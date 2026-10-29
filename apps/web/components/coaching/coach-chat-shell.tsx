"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  coachContextSchema,
  coachConversationStateSchema,
  coachArchiveResultSchema,
  type CoachContext,
  type CoachConversationMessage,
  type CoachConversationState,
  type CoachRecordReference,
  type CoachTopic,
} from "../../../../packages/core/src/contracts/coach-chat";
import { coachVoiceCapabilitiesSchema, type CoachVoiceCapabilities } from "../../../../packages/core/src/contracts/coach-voice";
import { createRecoveryContext, readRecoveryContext, recoveryReturnHref } from "../../lib/recovery-context";
import { DailyWellbeingCheckIn } from "./daily-wellbeing-check-in";
import { DashboardNavigation } from "../dashboard/dashboard-navigation";
import { CoachChatHistory } from "./coach-chat-history";
import { CoachVoiceDictation, CoachVoiceReplyPlayer, stopAllCoachVoice } from "./coach-voice-components";
import { NativeModal } from "./native-modal";
import "../dashboard/dashboard.css";
import "./coach-chat.css";

type RequestState = "loading" | "ready" | "error";
type Failure = { code: string; message: string } | null;
type ApiError = Error & { status?: number; code?: string; retryAfter?: string | null };

const prefix = "racepredictor.coach.v2.";
const topicLabels: Record<CoachTopic, string> = { reflect: "Reflect on last training", prepare: "Prepare for next training", general: "Ask ORBIT" };

function dataOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : record;
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = payload && typeof payload === "object" ? (payload as Record<string, unknown>).error : null;
    const error = errorPayload && typeof errorPayload === "object" ? errorPayload as Record<string, unknown> : {};
    const failure = new Error(typeof error.message === "string" ? error.message : "The request could not be completed.") as ApiError;
    failure.status = response.status;
    failure.code = typeof error.code === "string" ? error.code : undefined;
    failure.retryAfter = response.headers.get("retry-after");
    throw failure;
  }
  return dataOf(payload);
}

function validConversation(value: unknown): CoachConversationState {
  const parsed = coachConversationStateSchema.safeParse(value);
  if (!parsed.success) throw new Error("The coaching conversation could not be read safely. Retry to reload it.");
  return parsed.data;
}

function validContext(value: unknown): CoachContext {
  const parsed = coachContextSchema.safeParse(value);
  if (!parsed.success) throw new Error("Coaching context could not be read safely. Training navigation is still available.");
  return parsed.data;
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function recordLabel(context: CoachContext, reference: CoachRecordReference | null) {
  if (!reference) return "No training record selected";
  if (reference.type === "activity" && context.latestActivity?.id === reference.id) return context.latestActivity.title;
  if (reference.type === "session") {
    const session = [context.nextSession, ...context.ambiguousSessions].find((candidate) => candidate?.id === reference.id);
    return session?.title ?? "Selected training session";
  }
  return "Selected training record";
}

function clearCoachSessionStorage() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch { /* session storage is optional */ }
}

export function CoachChatShell() {
  const [actorId, setActorId] = useState<string | null>(null);
  const [context, setContext] = useState<CoachContext | null>(null);
  const [conversation, setConversation] = useState<CoachConversationState>({ generation: 1, sequence: 0, messages: [], hasOlder: false, oldestSequence: null, currentTurn: null });
  const [loadState, setLoadState] = useState<RequestState>("loading");
  const [loadError, setLoadError] = useState("");
  const [topic, setTopic] = useState<CoachTopic>("general");
  const [selectedRecord, setSelectedRecord] = useState<CoachRecordReference | null>(null);
  const [draft, setDraft] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState(false);
  const [leaseMayHaveExpired, setLeaseMayHaveExpired] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [olderLoading, setOlderLoading] = useState(false);
  const [wellbeingOpen, setWellbeingOpen] = useState(false);
  const [conversationActionsOpen, setConversationActionsOpen] = useState(false);
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [showLatestMessage, setShowLatestMessage] = useState(false);
  const [orbitAvailable, setOrbitAvailable] = useState(true);
  const [recoveryReturn, setRecoveryReturn] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLOListElement | null>(null);
  const mobileActionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const contextLauncherRef = useRef<HTMLButtonElement | null>(null);
  const historyReturnFocusRef = useRef<HTMLElement | null>(null);
  const archiveReturnFocusRef = useRef<HTMLElement | null>(null);
  const wellbeingReturnFocusRef = useRef<HTMLElement | null>(null);
  const followLatestRef = useRef(true);
  const unreadLatestRef = useRef(false);
  const olderScrollAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const lastTranscriptRef = useRef<{ generation: number; count: number } | null>(null);
  const loadedRef = useRef(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const epochRef = useRef(0);
  const generationRef = useRef(1);
  const actorRef = useRef<string | null>(null);
  const tabIdRef = useRef<string | null>(null);
  const archivingRef = useRef(false);
  const archiveRequestRef = useRef<{ requestId: string; expectedGeneration: number; expectedSequence: number } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [archiveStatus, setArchiveStatus] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [voiceCapabilities, setVoiceCapabilities] = useState<CoachVoiceCapabilities | null>(null);
  const voiceScopeRef = useRef("");

  function acceptConversation(latest: CoachConversationState) {
    if (latest.generation < generationRef.current) return false;
    generationRef.current = latest.generation;
    setConversation((current) => latest.generation === current.generation && latest.sequence < current.sequence ? current : latest);
    return true;
  }

  useEffect(() => {
    const currentScope = [actorId ?? "", conversation.generation, conversation.sequence, topic, selectedRecord?.type ?? "", selectedRecord?.id ?? "", context?.fingerprint ?? ""].join(":");
    if (voiceScopeRef.current && voiceScopeRef.current !== currentScope) stopAllCoachVoice();
    voiceScopeRef.current = currentScope;
  }, [actorId, conversation.generation, conversation.sequence, topic, selectedRecord, context?.fingerprint]);

  useEffect(() => {
    if (historyOpen || contextSheetOpen || conversationActionsOpen) stopAllCoachVoice();
  }, [historyOpen, contextSheetOpen, conversationActionsOpen]);

  const refreshVoiceCapabilities = useCallback(async () => {
    const payload = await requestJson("/api/v1/coaching/voice/capabilities", { cache: "no-store" });
    const parsed = coachVoiceCapabilitiesSchema.safeParse(payload);
    if (!parsed.success) throw new Error("Voice controls are temporarily unavailable.");
    setVoiceCapabilities(parsed.data);
  }, []);
  const onVoiceAllowanceChanged = useCallback(() => { void refreshVoiceCapabilities().catch(() => undefined); }, [refreshVoiceCapabilities]);

  useEffect(() => {
    if (loadState !== "ready" || !actorId) { setVoiceCapabilities(null); return; }
    let active = true;
    void requestJson("/api/v1/coaching/voice/capabilities", { cache: "no-store" })
      .then((payload) => {
        const parsed = coachVoiceCapabilitiesSchema.safeParse(payload);
        if (active && parsed.success) setVoiceCapabilities(parsed.data);
      }).catch(() => { if (active) setVoiceCapabilities(null); });
    return () => { active = false; };
  }, [loadState, actorId]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const fit = () => {
      if (window.innerWidth >= 768) { panel.style.height = ""; return; }
      const viewport = window.visualViewport;
      const top = panel.getBoundingClientRect().top;
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      panel.style.height = `${Math.max(0, bottom - top)}px`;
    };
    const observer = new ResizeObserver(fit);
    if (panel.parentElement) observer.observe(panel.parentElement);
    Array.from(panel.children).forEach((child) => observer.observe(child));
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    fit();
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("scroll", fit); };
  }, [loadState, failure, archiveError, archiveStatus, context]);

  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    const previous = lastTranscriptRef.current;
    const anchor = olderScrollAnchorRef.current;
    if (anchor) {
      transcript.scrollTop = anchor.top + (transcript.scrollHeight - anchor.height);
      olderScrollAnchorRef.current = null;
    } else if (previous && previous.generation === conversation.generation && conversation.messages.length > previous.count) {
      if (followLatestRef.current) {
        transcript.scrollTop = transcript.scrollHeight;
        unreadLatestRef.current = false;
        setShowLatestMessage(false);
      } else {
        unreadLatestRef.current = true;
        setShowLatestMessage(true);
      }
    }
    lastTranscriptRef.current = { generation: conversation.generation, count: conversation.messages.length };
  }, [conversation.generation, conversation.messages]);

  useEffect(() => {
    const input = document.getElementById("coach-message-input");
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.style.height = "auto";
    const height = Math.min(128, Math.max(66, input.scrollHeight));
    input.style.height = `${height}px`;
    input.style.overflowY = input.scrollHeight > height ? "auto" : "hidden";
  }, [draft]);

  const readConversation = useCallback(async (before?: number) => {
    const suffix = before ? `?before=${before}` : "";
    const result = await requestJson(`/api/v1/coaching/chat/conversation${suffix}`, { cache: "no-store" });
    return validConversation(result);
  }, []);

  const refreshConversation = useCallback(async () => {
    const epoch = epochRef.current;
    const latest = await readConversation();
    if (epoch === epochRef.current && !archivingRef.current && latest.generation > generationRef.current) {
      epochRef.current += 1;
      acceptConversation(latest); setPending(false); setSending(false); setFailure(null); setTopic("general"); setSelectedRecord(null);
      void refreshContext("general", null).catch(() => undefined);
      return latest;
    }
    if (epoch !== epochRef.current || archivingRef.current || !acceptConversation(latest)) return latest;
    const processing = latest.currentTurn?.state === "processing";
    setPending(processing);
    if (!processing) setLeaseMayHaveExpired(false);
    if (latest.currentTurn?.state === "failed" || latest.currentTurn?.state === "expired") {
      setFailure({ code: latest.currentTurn.safeErrorCode ?? "PROVIDER_UNAVAILABLE", message: "Your message is saved. Retry this reply or ask another question." });
    } else if (latest.currentTurn?.state === "completed") setFailure(null);
    return latest;
  }, [readConversation]);

  const refreshContext = useCallback(async (nextTopic = topic, nextRecord = selectedRecord) => {
    const epoch = epochRef.current;
    const query = new URLSearchParams({ topic: nextTopic });
    if (nextRecord) { query.set("recordType", nextRecord.type); query.set("recordId", nextRecord.id); }
    const result = await requestJson(`/api/v1/coaching/chat/context?${query}`, { cache: "no-store" });
    const latest = validContext(result);
    if (epoch !== epochRef.current || archivingRef.current) return latest;
    setContext(latest);
    setTopic(latest.selectedTopic);
    setSelectedRecord(latest.selectedRecord);
    return latest;
  }, [selectedRecord, topic]);

  const loadAll = useCallback(async (restore = false) => {
    if (archivingRef.current) return;
    const epoch = epochRef.current;
    setLoadState((current) => current === "ready" ? "ready" : "loading");
    try {
      const session = await requestJson("/api/v1/auth/session", { cache: "no-store" });
      if (epoch !== epochRef.current || archivingRef.current) return;
      const actor = session.actor && typeof session.actor === "object" ? session.actor as Record<string, unknown> : null;
      const activeAthleteId = session.authenticated === true && typeof actor?.activeAthleteId === "string" ? actor.activeAthleteId : null;
      if (!activeAthleteId) {
        clearCoachSessionStorage();
        setActorId(null);
        throw new Error("Sign in to open your private coaching conversation.");
      }
      if (actor?.credentialKind !== "session") throw new Error("Coach chat requires your signed-in owner session.");
      setActorId(activeAthleteId);
      actorRef.current = activeAthleteId;
      const params = new URLSearchParams(window.location.search);
      const recovery = readRecoveryContext(params.get("recovery"));
      if (recovery?.kind === "coach") {
        setRecoveryReturn(recoveryReturnHref(recovery, "/dashboard/coach"));
        if (recovery.coach) {
          setTopic(recovery.coach.topic);
          setSelectedRecord(recovery.coach.selectedRecord ?? null);
        }
      }
      const savedTopic = sessionStorage.getItem(`${prefix}${activeAthleteId}.topic`);
      const savedRecord = sessionStorage.getItem(`${prefix}${activeAthleteId}.record`);
      const savedDraft = sessionStorage.getItem(`${prefix}${activeAthleteId}.draft`);
      const savedScrollValue = sessionStorage.getItem(`${prefix}${activeAthleteId}.scrollTop`);
      const savedScrollTop = savedScrollValue === null ? undefined : Number(savedScrollValue);
      if (recovery?.kind !== "coach" && !restore) {
        if (savedTopic === "reflect" || savedTopic === "prepare" || savedTopic === "general") setTopic(savedTopic);
        if (savedRecord) {
          try {
            const candidate = JSON.parse(savedRecord) as unknown;
            if (candidate && typeof candidate === "object" && ["activity", "session"].includes(String((candidate as Record<string, unknown>).type)) && typeof (candidate as Record<string, unknown>).id === "string") setSelectedRecord(candidate as CoachRecordReference);
          } catch { sessionStorage.removeItem(`${prefix}${activeAthleteId}.record`); }
        }
      }
      if (!restore && typeof savedDraft === "string") setDraft(savedDraft);
      const savedTopicIsValid = savedTopic === "reflect" || savedTopic === "prepare" || savedTopic === "general";
      const selectedTopic: CoachTopic | null = recovery?.kind === "coach" && recovery.coach
        ? recovery.coach.topic
        : savedTopicIsValid ? savedTopic : null;
      let selected = recovery?.kind === "coach" ? recovery.coach?.selectedRecord ?? null : selectedRecord;
      if (!selected && savedRecord && recovery?.kind !== "coach") {
        try { selected = JSON.parse(savedRecord) as CoachRecordReference; } catch { selected = null; }
      }
      const [latestConversation, latestContext] = await Promise.all([
        readConversation(),
        (async () => {
          const query = new URLSearchParams();
          if (selectedTopic) query.set("topic", selectedTopic);
          if (selected) { query.set("recordType", selected.type); query.set("recordId", selected.id); }
          return validContext(await requestJson(`/api/v1/coaching/chat/context?${query}`, { cache: "no-store" }));
        })(),
      ]);
      if (epoch !== epochRef.current || archivingRef.current || latestConversation.generation < generationRef.current) return;
      const savedGeneration = Number(sessionStorage.getItem(`${prefix}${activeAthleteId}.generation`));
      const changedGeneration = (loadedRef.current && latestConversation.generation > generationRef.current) || (savedGeneration > 0 && savedGeneration !== latestConversation.generation);
      acceptConversation(latestConversation);
      if (changedGeneration) {
        setSending(false); setOlderLoading(false); setRecoveryReturn(null);
        setTopic("general"); setSelectedRecord(null);
        const fresh = validContext(await requestJson("/api/v1/coaching/chat/context?topic=general", { cache: "no-store" }));
        if (epoch !== epochRef.current || generationRef.current !== latestConversation.generation || archivingRef.current) return;
        epochRef.current += 1;
        setContext(fresh); setTopic(fresh.selectedTopic); setSelectedRecord(fresh.selectedRecord);
        setPending(latestConversation.currentTurn?.state === "processing"); setFailure(null); setLoadState("ready"); setLoadError(""); loadedRef.current = true;
        if (transcriptRef.current) transcriptRef.current.scrollTop = 0;
        return;
      }
      setPending(latestConversation.currentTurn?.state === "processing");
      setContext(latestContext);
      setTopic(latestContext.selectedTopic);
      setSelectedRecord(latestContext.selectedRecord);
      const transcriptScrollTop = recovery?.coach?.transcriptScrollTop
        ?? (Number.isFinite(savedScrollTop) && savedScrollTop! >= 0 && savedScrollTop! <= 10_000_000 ? savedScrollTop : undefined);
      if (transcriptScrollTop !== undefined || recovery?.kind === "coach") requestAnimationFrame(() => {
        if (transcriptScrollTop !== undefined && transcriptRef.current) transcriptRef.current.scrollTop = transcriptScrollTop;
        if (recovery?.kind === "coach" && recovery.focusKey && /^[A-Za-z][A-Za-z0-9_-]{0,95}$/u.test(recovery.focusKey)) {
          document.getElementById(recovery.focusKey)?.focus();
        }
      });
      setLoadState("ready"); setLoadError("");
      const currentTurn = latestConversation.currentTurn;
      if (currentTurn?.state === "failed" || currentTurn?.state === "expired") {
        setFailure({ code: currentTurn.safeErrorCode ?? "PROVIDER_UNAVAILABLE", message: "Your message is saved. Retry this reply or ask another question." });
      } else {
        setFailure(null);
      }
      loadedRef.current = true;
    } catch (error) {
      if (epoch !== epochRef.current || archivingRef.current) return;
      setLoadState("error"); setLoadError(error instanceof Error ? error.message : "Coach is temporarily unavailable.");
    }
  }, [readConversation, selectedRecord, topic]);

  useEffect(() => {
    tabIdRef.current ??= crypto.randomUUID();
    void loadAll();
    const focused = () => { if (document.visibilityState === "visible") void loadAll(true); };
    window.addEventListener("focus", focused);
    window.addEventListener("pageshow", focused);
    const visibility = () => { if (document.visibilityState === "visible") void loadAll(true); };
    document.addEventListener("visibilitychange", visibility);
    const onCleared = (event: MessageEvent) => {
      if (!["archived", "cleared"].includes(event.data?.type) || event.data?.athleteId !== actorRef.current || event.data?.sourceId === tabIdRef.current) return;
      epochRef.current += 1; archiveRequestRef.current = null; stopAllCoachVoice();
      generationRef.current = Math.max(generationRef.current, Number(event.data.generation) || 1);
      setArchiveError(""); setArchiveStatus(event.data.type === "archived" ? "Chat saved in another tab. New discussion started." : "Coaching history permanently deleted.");
      setFailure(null); setPending(false); setSending(false); setTopic("general"); setSelectedRecord(null); setHistoryOpen(false);
      if (event.data.type === "cleared") setDraft("");
      try { for (const key of ["topic", "record", "scrollTop"]) sessionStorage.removeItem(`${prefix}${actorRef.current}.${key}`); } catch { /* optional */ }
      void Promise.all([refreshConversation(), refreshContext("general", null)]).catch(() => setArchiveError("The discussion changed in another tab. Reload to see the latest chat."));
    };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("racepredictor.coach-history") : null;
    channel?.addEventListener("message", onCleared);
    return () => { window.removeEventListener("focus", focused); window.removeEventListener("pageshow", focused); document.removeEventListener("visibilitychange", visibility); channel?.removeEventListener("message", onCleared); channel?.close(); };
    // A single mounted Coach owns these lifecycle listeners; refresh helpers are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Do not persist the initial React defaults while the asynchronous session/context
    // load is still deciding which topic and record to restore.
    if (!actorId || loadState !== "ready" || !loadedRef.current) return;
    try {
      sessionStorage.setItem(`${prefix}${actorId}.topic`, topic);
      if (selectedRecord) sessionStorage.setItem(`${prefix}${actorId}.record`, JSON.stringify(selectedRecord));
      else sessionStorage.removeItem(`${prefix}${actorId}.record`);
      sessionStorage.setItem(`${prefix}${actorId}.draft`, draft);
      sessionStorage.setItem(`${prefix}${actorId}.generation`, String(conversation.generation));
    } catch { /* session storage is optional */ }
  }, [actorId, topic, selectedRecord, draft, loadState, conversation.generation]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshConversation().catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [pending, refreshConversation]);

  useEffect(() => {
    if (!pending) { setLeaseMayHaveExpired(false); return; }
    const timer = window.setTimeout(() => setLeaseMayHaveExpired(true), 90_000);
    return () => window.clearTimeout(timer);
  }, [pending, conversation.currentTurn?.attempt]);

  useEffect(() => {
    if (!context || !loadedRef.current) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshContext().catch(() => undefined); }, 60_000);
    return () => window.clearInterval(timer);
  }, [context, refreshContext]);

  async function chooseTopic(nextTopic: CoachTopic) {
    if (archivingRef.current) return;
    stopAllCoachVoice();
    setTopic(nextTopic); setSelectedRecord(null); setFailure(null);
    try { await refreshContext(nextTopic, null); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Training context is temporarily unavailable."); }
  }

  async function selectRecord(reference: CoachRecordReference) {
    if (archivingRef.current) return;
    stopAllCoachVoice();
    setSelectedRecord(reference); setFailure(null);
    try { await refreshContext(topic, reference); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "That training record is no longer available."); }
  }

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || !context || sending || pending || archivingRef.current || archiveError || !context.canSend) return;
    stopAllCoachVoice();
    followLatestRef.current = true;
    unreadLatestRef.current = false;
    setShowLatestMessage(false);
    const epoch = epochRef.current;
    const text = draft.trim();
    setSending(true); setFailure(null);
    const previousSequence = conversation.sequence;
    try {
      const freshContext = await refreshContext(topic, selectedRecord);
      if (epoch !== epochRef.current || archivingRef.current) return;
      const result = await requestJson("/api/v1/coaching/chat/turns", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientTurnId: crypto.randomUUID(), expectedGeneration: conversation.generation,
          expectedSequence: conversation.sequence, text, topic, selectedRecord: freshContext.selectedRecord,
          contextFingerprint: freshContext.fingerprint,
        }),
      });
      if (epoch !== epochRef.current || archivingRef.current) return;
      const failurePayload = result.failure && typeof result.failure === "object" ? result.failure as Record<string, unknown> : null;
      if (failurePayload) setFailure({ code: String(failurePayload.code ?? "PROVIDER_UNAVAILABLE"), message: String(failurePayload.message ?? "Your message was saved. Retry the reply.") });
      const saved = await refreshConversation();
      if (epoch !== epochRef.current || archivingRef.current) return;
      if (saved.generation === conversation.generation && saved.sequence > previousSequence) setDraft((current) => current.trim() === text ? "" : current);
      setPending(saved.currentTurn?.state === "processing");
    } catch (error) {
      if (epoch !== epochRef.current || archivingRef.current) return;
      const current = await refreshConversation().catch(() => null);
      if (epoch !== epochRef.current || archivingRef.current) return;
      if (current && current.generation === conversation.generation && current.sequence > previousSequence) setDraft((value) => value.trim() === text ? "" : value);
      if (current?.currentTurn?.state === "processing") setPending(true);
      else setFailure({ code: (error as ApiError)?.code ?? "REQUEST_FAILED", message: error instanceof Error ? error.message : "Your message could not be sent." });
    } finally { if (epoch === epochRef.current && !archivingRef.current) setSending(false); }
  }

  async function retryReply() {
    const turn = conversation.currentTurn;
    if (!turn || !context || (!turn.retryable && !(turn.state === "processing" && leaseMayHaveExpired)) || sending || archivingRef.current) return;
    const epoch = epochRef.current;
    setSending(true); setFailure(null);
    try {
      const freshContext = await refreshContext(topic, selectedRecord);
      if (epoch !== epochRef.current || archivingRef.current) return;
      const result = await requestJson(`/api/v1/coaching/chat/turns/${encodeURIComponent(turn.id)}/retry`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedGeneration: conversation.generation, expectedAttempt: turn.attempt, retryId: crypto.randomUUID(), contextFingerprint: freshContext.fingerprint }),
      });
      if (epoch !== epochRef.current || archivingRef.current) return;
      const failurePayload = result.failure && typeof result.failure === "object" ? result.failure as Record<string, unknown> : null;
      if (failurePayload) setFailure({ code: String(failurePayload.code ?? "PROVIDER_UNAVAILABLE"), message: String(failurePayload.message ?? "The saved message could not be answered yet.") });
      setLeaseMayHaveExpired(false);
      await refreshConversation();
    } catch (error) {
      if (epoch !== epochRef.current || archivingRef.current) return;
      await refreshConversation().catch(() => undefined);
      if (epoch !== epochRef.current || archivingRef.current) return;
      setFailure({ code: (error as ApiError)?.code ?? "RETRY_FAILED", message: error instanceof Error ? error.message : "This reply could not be retried." });
    } finally { if (epoch === epochRef.current && !archivingRef.current) setSending(false); }
  }

  async function loadOlder() {
    if (!conversation.hasOlder || !conversation.oldestSequence || olderLoading || archivingRef.current) return;
    const epoch = epochRef.current;
    const transcript = transcriptRef.current;
    if (transcript) olderScrollAnchorRef.current = { height: transcript.scrollHeight, top: transcript.scrollTop };
    setOlderLoading(true);
    try {
      const previous = await readConversation(conversation.oldestSequence);
      if (epoch !== epochRef.current || archivingRef.current || previous.generation !== conversation.generation) { olderScrollAnchorRef.current = null; return; }
      setConversation((current) => previous.generation !== current.generation ? current : ({ ...current, messages: [...previous.messages.filter((item) => !current.messages.some((message) => message.id === item.id)), ...current.messages], hasOlder: previous.hasOlder, oldestSequence: previous.oldestSequence }));
    } catch (error) { olderScrollAnchorRef.current = null; if (epoch === epochRef.current && !archivingRef.current) setFailure({ code: "HISTORY_READ_FAILED", message: error instanceof Error ? error.message : "Older messages could not be loaded." }); }
    finally { if (epoch === epochRef.current && !archivingRef.current) setOlderLoading(false); }
  }

  async function archiveChat() {
    if (archivingRef.current || loadState !== "ready") return;
    stopAllCoachVoice();
    archivingRef.current = true; setArchiving(true); setArchiveError(""); setArchiveStatus("");
    const epoch = ++epochRef.current;
    archiveRequestRef.current ??= { requestId: crypto.randomUUID(), expectedGeneration: conversation.generation, expectedSequence: conversation.sequence };
    try {
      const result = coachArchiveResultSchema.parse(await requestJson("/api/v1/coaching/chat/conversation/archive", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(archiveRequestRef.current),
      }));
      if (epoch !== epochRef.current) return;
      acceptConversation(result.conversation); archiveRequestRef.current = null;
      setFailure(null); setPending(false); setSending(false); setOlderLoading(false); setTopic("general"); setSelectedRecord(null); setRecoveryReturn(null);
      try {
        sessionStorage.setItem(`${prefix}${actorId}.topic`, "general");
        sessionStorage.setItem(`${prefix}${actorId}.generation`, String(result.conversation.generation));
        for (const key of ["record", "scrollTop"]) sessionStorage.removeItem(`${prefix}${actorId}.${key}`);
      } catch { /* optional browser storage */ }
      try {
        const channel = new BroadcastChannel("racepredictor.coach-history");
        channel.postMessage({ type: "archived", athleteId: actorId, generation: result.conversation.generation, sourceId: tabIdRef.current }); channel.close();
      } catch { /* optional browser messaging */ }
      setArchiveStatus(result.archive ? "Chat saved. New discussion started." : "New discussion ready.");
      if (transcriptRef.current) transcriptRef.current.scrollTop = 0;
      archivingRef.current = false;
      await refreshContext("general", null).catch(() => { setContext(null); setLoadState("error"); setLoadError("Training context could not be refreshed. Reload before sending."); });
      requestAnimationFrame(() => document.getElementById("coach-message-input")?.focus({ preventScroll: true }));
    } catch (error) {
      if (epoch !== epochRef.current) return;
      if ((error as ApiError).status === 409) {
        archiveRequestRef.current = null; archivingRef.current = false;
        await refreshConversation().catch(() => undefined);
        setArchiveError("The discussion changed. Review the latest messages, then choose Clear chat again.");
      } else setArchiveError("The chat could not be saved. Your messages and draft are kept here. Retry saving.");
    } finally { archivingRef.current = false; setArchiving(false); setSending(false); setOlderLoading(false); }
  }

  function contextualHref(href: string, record: CoachRecordReference | null = selectedRecord, focusKey?: string) {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const recovery = createRecoveryContext({
      kind: "coach", path: "/dashboard/coach",
      focusKey: focusKey || activeElement?.id || "coach-message-input",
      coach: { topic, selectedRecord: record ?? undefined, transcriptAnchorSequence: conversation.sequence, transcriptScrollTop: transcriptRef.current?.scrollTop ?? 0 },
    });
    const url = new URL(href, "https://racepredictor.invalid");
    url.searchParams.set("recovery", recovery.id);
    if (url.pathname === "/dashboard/activities") url.searchParams.set("returnTo", "/dashboard/coach");
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function navigateWithCoachContext(event: ReactMouseEvent<HTMLAnchorElement>, href: string, record: CoachRecordReference | null = selectedRecord) {
    stopAllCoachVoice();
    const target = contextualHref(href, record, event.currentTarget.id);
    if (event.type === "click" && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      window.location.assign(target);
    } else {
      event.currentTarget.href = new URL(target, window.location.origin).href;
    }
  }

  async function prepareVoiceTranscription() {
    if (!context || !context.canSend) throw new Error("Coach replies are paused. Your draft is still here.");
    const startingFingerprint = context.fingerprint;
    const startingGeneration = conversation.generation;
    const startingSequence = conversation.sequence;
    const latestContext = await refreshContext(topic, selectedRecord);
    const latestConversation = await refreshConversation();
    if (latestContext.fingerprint !== startingFingerprint || latestContext.selectedTopic !== topic
      || JSON.stringify(latestContext.selectedRecord) !== JSON.stringify(selectedRecord)
      || latestConversation.generation !== startingGeneration || latestConversation.sequence !== startingSequence) {
      throw new Error("Training context or conversation changed while recording. Review the latest chat, then record again.");
    }
    return { context: latestContext, generation: latestConversation.generation, sequence: latestConversation.sequence };
  }

  const insertVoiceTranscript = useCallback((transcript: string) => {
    const composer = document.getElementById("coach-message-input") as HTMLTextAreaElement | null;
    const current = composer?.value ?? draft;
    const start = Math.min(composer?.selectionStart ?? current.length, current.length);
    const end = Math.min(composer?.selectionEnd ?? start, current.length);
    const next = `${current.slice(0, start)}${transcript}${current.slice(end)}`;
    if (next.length > 4_000) return false;
    setDraft(next);
    requestAnimationFrame(() => {
      const currentComposer = document.getElementById("coach-message-input") as HTMLTextAreaElement | null;
      if (!currentComposer) return;
      const caret = start + transcript.length;
      currentComposer.focus({ preventScroll: true });
      currentComposer.setSelectionRange(caret, caret);
    });
    return true;
  }, [draft]);

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (voiceBusy) {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) event.preventDefault();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault(); void submitMessage();
    }
  }

  const messages = conversation.messages;
  const currentSavedUser = messages.filter((message) => message.role === "user").at(-1);
  const retryable = Boolean((conversation.currentTurn?.retryable || (conversation.currentTurn?.state === "processing" && leaseMayHaveExpired)) && currentSavedUser?.turnState !== "abandoned");

  const orbitStatus = context?.canSend ? "Ready" : context ? "Replies paused" : loadState === "error" ? "Unavailable" : "Loading";
  const contextReference = selectedRecord ?? context?.selectedRecord ?? null;
  const mobileSubject = context
    ? contextReference
      ? recordLabel(context, contextReference)
      : topic === "reflect" ? context.latestActivity?.title ?? "No recent activity"
        : topic === "prepare" ? context.nextSession?.title ?? "No upcoming session" : "General training"
    : loadState === "error" ? "Training context unavailable" : "Loading training context";
  const showHistoryFromActions = () => {
    historyReturnFocusRef.current = mobileActionsTriggerRef.current;
    setConversationActionsOpen(false);
    window.requestAnimationFrame(() => setHistoryOpen(true));
  };
  const showArchiveFromActions = () => {
    archiveReturnFocusRef.current = mobileActionsTriggerRef.current;
    setConversationActionsOpen(false);
    window.requestAnimationFrame(() => setArchiveConfirmOpen(true));
  };
  const showWellbeingFromActions = () => {
    wellbeingReturnFocusRef.current = mobileActionsTriggerRef.current;
    setConversationActionsOpen(false);
    window.requestAnimationFrame(() => setWellbeingOpen(true));
  };

  return <div className="dashboard-layout coach-v2-layout">
    <DashboardNavigation
      activePage="coach"
      mobileIdentity={<div className="coach-mobile-identity"><span className="coach-mobile-avatar">{orbitAvailable ? <Image src="/images/orbit-avatar.webp" alt="" width={30} height={30} onError={() => setOrbitAvailable(false)} /> : "O"}</span><span className="coach-mobile-name"><strong>ORBIT</strong><span><i className={`coach-mobile-status coach-mobile-status--${context?.canSend ? "ready" : context ? "paused" : loadState === "error" ? "unavailable" : "loading"}`} aria-hidden="true" />AI coach · {orbitStatus}</span></span></div>}
      mobileActions={<button ref={mobileActionsTriggerRef} className="coach-mobile-actions-trigger" type="button" aria-label="Conversation actions" aria-haspopup="dialog" aria-expanded={conversationActionsOpen} onClick={() => setConversationActionsOpen(true)}><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg></button>}
    />
    <main id="dashboard-main-content" className="dashboard-main coach-v2-main" tabIndex={-1} aria-label="Coach chat">
      {recoveryReturn ? <div className="coach-v2-return-note"><span>You’re back from a training record.</span><button type="button" onClick={() => setRecoveryReturn(null)} aria-label="Dismiss return message">×</button></div> : null}
      <section className="coach-chat-panel" ref={panelRef} aria-label="Conversation with ORBIT">
        <header className="coach-chat-heading">
          <div className="orbit-portrait-wrap">{orbitAvailable ? <Image src="/images/orbit-avatar.webp" alt="" width={48} height={48} onError={() => setOrbitAvailable(false)} /> : <span aria-hidden="true">O</span>}</div>
          <div><h2>ORBIT <span>AI COACH</span></h2><p>{context ? `Here with you · ${context.localDate}` : "Your training companion"}</p></div>
          <span className={`orbit-presence orbit-presence--${context?.canSend ? "ready" : context ? "paused" : loadState === "error" ? "unavailable" : "loading"}`}><i aria-hidden="true" />{orbitStatus}</span>
          <div className="coach-history-actions">
            <button type="button" onClick={(event) => { historyReturnFocusRef.current = event.currentTarget; setHistoryOpen(true); }} disabled={archiving}>Previous chats</button>
            <button type="button" title="Save this discussion and start a new one" disabled={archiving || loadState !== "ready"} onClick={(event) => { archiveReturnFocusRef.current = event.currentTarget; setArchiveConfirmOpen(true); }}>Clear chat</button>
            <button type="button" onClick={(event) => { wellbeingReturnFocusRef.current = event.currentTarget; setWellbeingOpen(true); }}>Daily check-in</button>
          </div>
        </header>
        <div className="coach-topic-picker" role="group" aria-label="Choose what to talk about">
          {(["reflect", "prepare", "general"] as const).map((value) => <button type="button" key={value} disabled={archiving} aria-pressed={topic === value} onClick={() => void chooseTopic(value)}>{topicLabels[value]}</button>)}
        </div>
        <button ref={contextLauncherRef} className="coach-mobile-context-launcher" type="button" aria-haspopup="dialog" aria-expanded={contextSheetOpen} onClick={() => setContextSheetOpen(true)}><span><strong>{topic === "reflect" ? "Reflect" : topic === "prepare" ? "Prepare" : "Ask ORBIT"}</strong><span>{mobileSubject}</span></span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
        {context ? <div className="coach-context-row">
          <span className="coach-context-label">{topic === "reflect" ? "REFLECTING ON" : topic === "prepare" ? "GETTING READY FOR" : "TRAINING CONTEXT"}</span>
          {context.ambiguousSessions.length > 1 && topic === "prepare" && !selectedRecord ? <div className="coach-record-choices" role="group" aria-label="Choose a session to prepare for">{context.ambiguousSessions.map((session) => <button key={session.id} type="button" onClick={() => void selectRecord({ type: "session", id: session.id })}>{session.title} · {session.date}</button>)}</div> : <strong>{recordLabel(context, selectedRecord)}</strong>}
          {selectedRecord ? <button className="coach-change-context" type="button" onClick={() => { setSelectedRecord(null); void refreshContext(topic, null); }}>Change</button> : null}
          {context.latestActivity && topic !== "reflect" ? <button className="coach-context-chip" type="button" onClick={() => void selectRecord({ type: "activity", id: context.latestActivity!.id })}>Last activity · {context.latestActivity.title}</button> : null}
          {context.nextSession && topic !== "prepare" ? <button className="coach-context-chip" type="button" onClick={() => void selectRecord({ type: "session", id: context.nextSession!.id })}>Next session · {context.nextSession.title}</button> : null}
        </div> : null}
        {loadState === "loading" ? <p className="coach-v2-state" role="status" aria-busy="true">Loading your training context…</p> : null}
        {archiveStatus ? <p className="coach-v2-state" role="status">{archiveStatus}</p> : null}
        {archiveError ? <div className="coach-v2-error" role="alert"><p>{archiveError}</p><button type="button" disabled={archiving} onClick={() => void archiveChat()}>Retry saving</button></div> : null}
        {loadState === "error" ? <div className="coach-v2-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => void loadAll(true)}>Retry</button><Link href="/dashboard/calendar">Open Calendar</Link></div> : null}
        {failure && !messages.length ? <div className="coach-v2-error" role="alert"><p>{failure.message}</p></div> : null}
        <div className="coach-transcript-wrap">
        <ol className="coach-transcript" tabIndex={0} ref={transcriptRef} onScroll={(event) => { const transcript = event.currentTarget; const nearLatest = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <= 48; followLatestRef.current = nearLatest; if (nearLatest) { unreadLatestRef.current = false; setShowLatestMessage(false); } else if (unreadLatestRef.current) setShowLatestMessage(true); if (actorId) { try { sessionStorage.setItem(`${prefix}${actorId}.scrollTop`, String(transcript.scrollTop)); } catch { /* session storage is optional */ } } }} aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text">
          {conversation.hasOlder ? <li className="coach-older-control"><button type="button" disabled={archiving || olderLoading} onClick={() => void loadOlder()}>{olderLoading ? "Loading…" : "Load earlier messages"}</button></li> : null}
          {messages.length === 0 && context ? <li className="coach-opening-message"><div className="coach-message-avatar">{orbitAvailable ? <Image src="/images/orbit-avatar.webp" alt="" width={36} height={36} onError={() => setOrbitAvailable(false)} /> : "O"}</div><div className="coach-bubble coach-bubble--assistant"><p>{context.opening.text}</p><time>{context.localDate}</time></div></li> : null}
          {messages.map((message) => <li className={`coach-message coach-message--${message.role}`} key={message.id}>
            {message.role === "assistant" ? <div className="coach-message-avatar">{orbitAvailable ? <Image src="/images/orbit-avatar.webp" alt="" width={36} height={36} onError={() => setOrbitAvailable(false)} /> : "O"}</div> : null}
            <div className={`coach-bubble coach-bubble--${message.role}`}><p>{message.text}</p><time>{messageTime(message.createdAt)}</time>{message.role === "assistant" ? <CoachVoiceReplyPlayer key={message.id} message={message} generation={conversation.generation} available={Boolean(voiceCapabilities?.playback.available)} disabled={archiving || sending || pending || loadState !== "ready"} onAllowanceChanged={onVoiceAllowanceChanged} /> : null}</div>
          </li>)}
          {sending || pending ? <li className="coach-message coach-message--assistant"><div className="coach-message-avatar">{orbitAvailable ? <Image src="/images/orbit-avatar.webp" alt="" width={36} height={36} onError={() => setOrbitAvailable(false)} /> : "O"}</div><div className="coach-bubble coach-bubble--assistant coach-generating" role="status" aria-live="polite"><span className="coach-dot-pulse" aria-hidden="true"><i /><i /><i /></span><span>ORBIT is thinking…</span></div></li> : null}
        </ol>
        {showLatestMessage ? <button className="coach-latest-message" type="button" onClick={() => { const transcript = transcriptRef.current; if (!transcript) return; followLatestRef.current = true; unreadLatestRef.current = false; setShowLatestMessage(false); transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" }); }}>Latest message <span aria-hidden="true">↓</span></button> : null}
        </div>
        {pending && leaseMayHaveExpired ? <div className="coach-v2-error coach-turn-error" role="status"><p>The reply may have stopped before it was saved. You can safely recover this message.</p><button type="button" disabled={archiving || sending} onClick={() => void retryReply()}>{sending ? "Recovering…" : "Recover reply"}</button></div> : null}
        {failure && messages.length ? <div className="coach-v2-error coach-turn-error" role="alert"><p>{failure.message}</p>{retryable && !(pending && leaseMayHaveExpired) ? <button type="button" disabled={archiving || sending} onClick={() => void retryReply()}>{sending ? "Retrying…" : "Retry reply"}</button> : null}</div> : null}
        {context?.actions.length ? <div className="coach-action-row" aria-label="Training details">{context.actions.filter((action) => action.kind !== "wellbeing").map((action) => { const href = action.href; const record = action.kind === "activity" && context.latestActivity ? { type: "activity" as const, id: context.latestActivity.id } : action.kind === "session" && context.nextSession ? { type: "session" as const, id: context.nextSession.id } : selectedRecord; return <Link className={`coach-action-link coach-action-link--${action.kind}`} id={`coach-action-${action.kind}`} key={`${action.kind}-${href}`} href={href} onClick={(event) => navigateWithCoachContext(event, href, record)} onAuxClick={(event) => navigateWithCoachContext(event, href, record)}>{action.label} <span aria-hidden="true">↗</span></Link>; })}</div> : null}
        <form className="coach-composer" onSubmit={(event) => { if (voiceBusy) { event.preventDefault(); return; } void submitMessage(event); }}>
          <label className="coach-composer-label" htmlFor="coach-message-input">Message ORBIT</label>
          <textarea id="coach-message-input" value={draft} maxLength={4_000} rows={2} placeholder={topic === "reflect" ? "What stood out in your last training?" : topic === "prepare" ? "What would you like to know before your session?" : "Ask about your training…"} onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKey} disabled={archiving || loadState !== "ready" || !context?.canSend || sending} />
          <div className="coach-composer-footer"><span>Enter to send · Shift + Enter for a new line <span aria-hidden="true">·</span> {draft.length}/4,000</span></div>
          <div className="coach-composer-actions">
            {voiceCapabilities?.dictation.available && context ? <CoachVoiceDictation
              available={voiceCapabilities.dictation.available}
              disabled={archiving || sending || pending || loadState !== "ready" || !context.canSend || voiceCapabilities.limits.remainingAllowanceMicroUsd === 0}
              disclosureVersion={voiceCapabilities.disclosureVersion}
              providerDataControlsUrl={voiceCapabilities.providerDataControlsUrl}
              remainingAllowanceMicroUsd={voiceCapabilities.limits.remainingAllowanceMicroUsd}
              monthlyAllowanceMicroUsd={voiceCapabilities.limits.monthlyAllowanceMicroUsd}
              resetsAt={voiceCapabilities.limits.resetsAt}
              scopeKey={[actorId ?? "", conversation.generation, conversation.sequence, topic, selectedRecord?.type ?? "", selectedRecord?.id ?? "", context.fingerprint].join(":")}
              onTranscriptReady={insertVoiceTranscript}
              onBusyChange={setVoiceBusy}
              prepareTranscription={prepareVoiceTranscription}
              onStart={() => window.dispatchEvent(new Event("orbit:voice-playback-stop"))}
              onAllowanceChanged={onVoiceAllowanceChanged}
            /> : null}
            <button className="coach-send-button" type="submit" disabled={voiceBusy || archiving || Boolean(archiveError) || !draft.trim() || !context?.canSend || loadState !== "ready" || sending || pending}>{sending ? "Sending…" : "Send message"}<span aria-hidden="true">↑</span></button>
          </div>
        </form>
        {context && !context.canSend ? <p className="coach-chat-paused" role="status">Chat replies are paused. Your conversation remains available, and your training plan is unchanged.</p> : null}
        <p className="coach-chat-boundary">ORBIT offers training guidance. Your plan only changes when you approve an update.</p>
      </section>
      <CoachChatHistory open={historyOpen} onClose={() => setHistoryOpen(false)} returnFocusRef={historyReturnFocusRef} />
      <NativeModal open={conversationActionsOpen} titleId="coach-mobile-actions-title" onClose={() => setConversationActionsOpen(false)} returnFocusRef={mobileActionsTriggerRef} className="coach-mobile-actions-dialog">
        <header className="coach-overlay-heading"><h2 id="coach-mobile-actions-title">Conversation actions</h2><button type="button" aria-label="Close conversation actions" onClick={() => setConversationActionsOpen(false)}>×</button></header>
        <div className="coach-mobile-action-list">
          <button type="button" onClick={showHistoryFromActions} disabled={archiving}>Previous chats <span>Read saved chats</span></button>
          <button type="button" onClick={showArchiveFromActions} disabled={archiving || loadState !== "ready"}>Clear chat <span>Save this discussion and start a new one</span></button>
          <button type="button" onClick={showWellbeingFromActions}>Daily check-in <span>{context?.wellbeing?.status === "saved" ? "Review today’s recovery check-in" : "Add an optional recovery check-in"}</span></button>
        </div>
      </NativeModal>
      <NativeModal open={contextSheetOpen} titleId="coach-context-sheet-title" onClose={() => setContextSheetOpen(false)} returnFocusRef={contextLauncherRef} className="coach-context-sheet">
        <header className="coach-overlay-heading"><div><p className="coach-v2-overline">CONVERSATION CONTEXT</p><h2 id="coach-context-sheet-title">Choose a topic</h2></div><button type="button" aria-label="Close topic and context" onClick={() => setContextSheetOpen(false)}>×</button></header>
        <p className="coach-context-sheet-intro">Changing this context updates the conversation focus. It does not send a message.</p>
        <div className="coach-context-sheet-topics" role="group" aria-label="Choose what to talk about">
          {(["reflect", "prepare", "general"] as const).map((value) => <button type="button" key={value} disabled={archiving} aria-pressed={topic === value} onClick={async () => { await chooseTopic(value); setContextSheetOpen(false); }}>{topicLabels[value]}</button>)}
        </div>
        {context ? <div className="coach-context-sheet-details">
          <div><span>{topic === "reflect" ? "REFLECTING ON" : topic === "prepare" ? "GETTING READY FOR" : "CURRENT CONTEXT"}</span><strong>{mobileSubject}</strong></div>
          {selectedRecord ? <button className="coach-change-context" type="button" onClick={() => { setSelectedRecord(null); void refreshContext(topic, null); }}>Change</button> : null}
          {topic === "prepare" && context.ambiguousSessions.length > 1 ? <div className="coach-context-sheet-options" role="group" aria-label="Choose a session to prepare for">{context.ambiguousSessions.map((session) => <button key={session.id} type="button" onClick={async () => { await selectRecord({ type: "session", id: session.id }); setContextSheetOpen(false); }}>{session.title} · {session.date}</button>)}</div> : null}
          {context.latestActivity && topic !== "reflect" ? <button className="coach-context-sheet-option" type="button" onClick={async () => { await selectRecord({ type: "activity", id: context.latestActivity!.id }); setContextSheetOpen(false); }}>Use last activity · {context.latestActivity.title}</button> : null}
          {context.nextSession && topic !== "prepare" ? <button className="coach-context-sheet-option" type="button" onClick={async () => { await selectRecord({ type: "session", id: context.nextSession!.id }); setContextSheetOpen(false); }}>Use next session · {context.nextSession.title}</button> : null}
          <p className="coach-context-sheet-next"><span>Next session</span>{context.nextSession ? `${context.nextSession.title} · ${context.nextSession.date}` : "No upcoming session"}</p>
        </div> : <p role="status">{loadState === "error" ? "Training context is unavailable. Retry to refresh." : "Loading training context…"}</p>}
      </NativeModal>
      <NativeModal open={archiveConfirmOpen} titleId="coach-archive-confirm-title" onClose={() => setArchiveConfirmOpen(false)} busy={archiving} returnFocusRef={archiveReturnFocusRef} className="coach-clear-chat-dialog">
        <header className="coach-overlay-heading"><h2 id="coach-archive-confirm-title">Start a new discussion?</h2><button type="button" aria-label="Close confirmation" disabled={archiving} onClick={() => setArchiveConfirmOpen(false)}>×</button></header>
        <p>The current discussion, when it contains messages, is saved to Previous chats. This starts a fresh conversation; it does not delete saved history. Your unsent draft stays in the composer.</p>
        <div className="coach-confirm-actions"><button type="button" onClick={() => setArchiveConfirmOpen(false)} disabled={archiving}>Cancel</button><button type="button" className="coach-confirm-primary" onClick={async () => { await archiveChat(); archiveReturnFocusRef.current = document.getElementById("coach-message-input"); setArchiveConfirmOpen(false); }} disabled={archiving || loadState !== "ready"}>{archiving ? "Saving…" : "Save and start new"}</button></div>
      </NativeModal>
      <NativeModal open={wellbeingOpen && Boolean(context)} titleId="coach-wellbeing-dialog-title" onClose={() => setWellbeingOpen(false)} returnFocusRef={wellbeingReturnFocusRef} className="coach-wellbeing-dialog">
        <header className="coach-overlay-heading"><div><p className="coach-v2-overline">RECOVERY CONTEXT</p><h2 id="coach-wellbeing-dialog-title">Daily check-in</h2></div><button type="button" aria-label="Close daily check-in" onClick={() => setWellbeingOpen(false)}>×</button></header>
        <p className="coach-context-sheet-intro">This check-in is optional and only saved if you choose to submit it.</p>
        {context ? <DailyWellbeingCheckIn key={`${context.timezone}-${context.localDate}`} timezone={context.timezone} date={context.localDate} compact={false} dailyModal={false} onSaved={() => { void refreshContext(); }} /> : null}
      </NativeModal>
      {recoveryReturn ? <div className="coach-v2-return-link"><Link href={recoveryReturn}>Return to your previous conversation position</Link></div> : null}
    </main>
  </div>;
}
