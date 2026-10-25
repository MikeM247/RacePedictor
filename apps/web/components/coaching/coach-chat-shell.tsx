"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  coachContextSchema,
  coachConversationStateSchema,
  type CoachContext,
  type CoachConversationMessage,
  type CoachConversationState,
  type CoachRecordReference,
  type CoachTopic,
} from "../../../../packages/core/src/contracts/coach-chat";
import { createRecoveryContext, readRecoveryContext, recoveryReturnHref } from "../../lib/recovery-context";
import { DailyWellbeingCheckIn } from "./daily-wellbeing-check-in";
import { DashboardNavigation } from "../dashboard/dashboard-navigation";
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
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState(false);
  const [leaseMayHaveExpired, setLeaseMayHaveExpired] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [olderLoading, setOlderLoading] = useState(false);
  const [wellbeingOpen, setWellbeingOpen] = useState(false);
  const [orbitAvailable, setOrbitAvailable] = useState(true);
  const [recoveryReturn, setRecoveryReturn] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLOListElement | null>(null);
  const loadedRef = useRef(false);

  const readConversation = useCallback(async (before?: number) => {
    const suffix = before ? `?before=${before}` : "";
    const result = await requestJson(`/api/v1/coaching/chat/conversation${suffix}`, { cache: "no-store" });
    return validConversation(result);
  }, []);

  const refreshConversation = useCallback(async () => {
    const latest = await readConversation();
    setConversation(latest);
    const processing = latest.currentTurn?.state === "processing";
    setPending(processing);
    if (!processing) setLeaseMayHaveExpired(false);
    if (latest.currentTurn?.state === "failed" || latest.currentTurn?.state === "expired") {
      setFailure({ code: latest.currentTurn.safeErrorCode ?? "PROVIDER_UNAVAILABLE", message: "Your message is saved. Retry this reply or ask another question." });
    } else if (latest.currentTurn?.state === "completed") setFailure(null);
    return latest;
  }, [readConversation]);

  const refreshContext = useCallback(async (nextTopic = topic, nextRecord = selectedRecord) => {
    const query = new URLSearchParams({ topic: nextTopic });
    if (nextRecord) { query.set("recordType", nextRecord.type); query.set("recordId", nextRecord.id); }
    const result = await requestJson(`/api/v1/coaching/chat/context?${query}`, { cache: "no-store" });
    const latest = validContext(result);
    setContext(latest);
    setTopic(latest.selectedTopic);
    setSelectedRecord(latest.selectedRecord);
    return latest;
  }, [selectedRecord, topic]);

  const loadAll = useCallback(async (restore = false) => {
    setLoadState((current) => current === "ready" ? "ready" : "loading");
    try {
      const session = await requestJson("/api/v1/auth/session", { cache: "no-store" });
      const actor = session.actor && typeof session.actor === "object" ? session.actor as Record<string, unknown> : null;
      const activeAthleteId = session.authenticated === true && typeof actor?.activeAthleteId === "string" ? actor.activeAthleteId : null;
      if (!activeAthleteId) {
        clearCoachSessionStorage();
        setActorId(null);
        throw new Error("Sign in to open your private coaching conversation.");
      }
      if (actor?.credentialKind !== "session") throw new Error("Coach chat requires your signed-in owner session.");
      setActorId(activeAthleteId);
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
      if (typeof savedDraft === "string") setDraft(savedDraft);
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
      setConversation(latestConversation);
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
      setLoadState("error"); setLoadError(error instanceof Error ? error.message : "Coach is temporarily unavailable.");
    }
  }, [readConversation, selectedRecord, topic]);

  useEffect(() => {
    void loadAll();
    const focused = () => { if (document.visibilityState === "visible") void loadAll(true); };
    window.addEventListener("focus", focused);
    window.addEventListener("pageshow", focused);
    const visibility = () => { if (document.visibilityState === "visible") void loadAll(true); };
    document.addEventListener("visibilitychange", visibility);
    const onCleared = (event: MessageEvent) => { if (event.data?.type === "cleared") { setDraft(""); setFailure(null); setPending(false); void Promise.all([refreshConversation(), refreshContext("general", null)]); } };
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
    } catch { /* session storage is optional */ }
  }, [actorId, topic, selectedRecord, draft, loadState]);

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
    setTopic(nextTopic); setSelectedRecord(null); setFailure(null);
    try { await refreshContext(nextTopic, null); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Training context is temporarily unavailable."); }
  }

  async function selectRecord(reference: CoachRecordReference) {
    setSelectedRecord(reference); setFailure(null);
    try { await refreshContext(topic, reference); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "That training record is no longer available."); }
  }

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || !context || sending || pending || !context.canSend) return;
    const text = draft.trim();
    setSending(true); setFailure(null);
    const previousSequence = conversation.sequence;
    try {
      const freshContext = await refreshContext(topic, selectedRecord);
      const result = await requestJson("/api/v1/coaching/chat/turns", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientTurnId: crypto.randomUUID(), expectedGeneration: conversation.generation,
          expectedSequence: conversation.sequence, text, topic, selectedRecord: freshContext.selectedRecord,
          contextFingerprint: freshContext.fingerprint,
        }),
      });
      const failurePayload = result.failure && typeof result.failure === "object" ? result.failure as Record<string, unknown> : null;
      if (failurePayload) setFailure({ code: String(failurePayload.code ?? "PROVIDER_UNAVAILABLE"), message: String(failurePayload.message ?? "Your message was saved. Retry the reply.") });
      const saved = await refreshConversation();
      if (saved.sequence > previousSequence) setDraft("");
      setPending(saved.currentTurn?.state === "processing");
    } catch (error) {
      const current = await refreshConversation().catch(() => null);
      if (current && current.sequence > previousSequence) setDraft("");
      if (current?.currentTurn?.state === "processing") setPending(true);
      else setFailure({ code: (error as ApiError)?.code ?? "REQUEST_FAILED", message: error instanceof Error ? error.message : "Your message could not be sent." });
    } finally { setSending(false); }
  }

  async function retryReply() {
    const turn = conversation.currentTurn;
    if (!turn || !context || (!turn.retryable && !(turn.state === "processing" && leaseMayHaveExpired)) || sending) return;
    setSending(true); setFailure(null);
    try {
      const freshContext = await refreshContext(topic, selectedRecord);
      const result = await requestJson(`/api/v1/coaching/chat/turns/${encodeURIComponent(turn.id)}/retry`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedGeneration: conversation.generation, expectedAttempt: turn.attempt, retryId: crypto.randomUUID(), contextFingerprint: freshContext.fingerprint }),
      });
      const failurePayload = result.failure && typeof result.failure === "object" ? result.failure as Record<string, unknown> : null;
      if (failurePayload) setFailure({ code: String(failurePayload.code ?? "PROVIDER_UNAVAILABLE"), message: String(failurePayload.message ?? "The saved message could not be answered yet.") });
      setLeaseMayHaveExpired(false);
      await refreshConversation();
    } catch (error) {
      await refreshConversation().catch(() => undefined);
      setFailure({ code: (error as ApiError)?.code ?? "RETRY_FAILED", message: error instanceof Error ? error.message : "This reply could not be retried." });
    } finally { setSending(false); }
  }

  async function loadOlder() {
    if (!conversation.hasOlder || !conversation.oldestSequence || olderLoading) return;
    setOlderLoading(true);
    try {
      const previous = await readConversation(conversation.oldestSequence);
      setConversation((current) => ({ ...current, messages: [...previous.messages, ...current.messages], hasOlder: previous.hasOlder, oldestSequence: previous.oldestSequence }));
    } catch (error) { setFailure({ code: "HISTORY_READ_FAILED", message: error instanceof Error ? error.message : "Older messages could not be loaded." }); }
    finally { setOlderLoading(false); }
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
    const target = contextualHref(href, record, event.currentTarget.id);
    if (event.type === "click" && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      window.location.assign(target);
    } else {
      event.currentTarget.href = new URL(target, window.location.origin).href;
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault(); void submitMessage();
    }
  }

  const messages = conversation.messages;
  const currentSavedUser = messages.filter((message) => message.role === "user").at(-1);
  const retryable = Boolean((conversation.currentTurn?.retryable || (conversation.currentTurn?.state === "processing" && leaseMayHaveExpired)) && currentSavedUser?.turnState !== "abandoned");

  return <div className="dashboard-layout coach-v2-layout">
    <DashboardNavigation activePage="coach" />
    <main id="dashboard-main-content" className="dashboard-main coach-v2-main" tabIndex={-1} aria-labelledby="coach-page-title">
      <header className="coach-v2-toolbar"><div><p className="coach-v2-eyebrow">Your training companion</p><h1 id="coach-page-title">Coach</h1></div><Link id="coach-plan-header-link" className="coach-plan-link" href="/dashboard/plan" onClick={(event) => navigateWithCoachContext(event, "/dashboard/plan", null)} onAuxClick={(event) => navigateWithCoachContext(event, "/dashboard/plan", null)}>View race plan <span aria-hidden="true">↗</span></Link></header>
      <section className="coach-v2-goal-strip" aria-label="Training goal">
        <span className="coach-goal-mark" aria-hidden="true">↗</span>
        <div><span className="coach-v2-overline">CURRENT FOCUS</span><strong>{context?.goal?.title ?? "Your training plan"}</strong><span>{context?.nextSession ? `Next · ${context.nextSession.title} · ${context.nextSession.date}` : context?.todaySchedule.message ?? "Your current training context"}</span></div>
        <Link id="coach-plan-strip-link" href="/dashboard/plan" onClick={(event) => navigateWithCoachContext(event, "/dashboard/plan", null)} onAuxClick={(event) => navigateWithCoachContext(event, "/dashboard/plan", null)}>View race plan</Link>
      </section>
      {recoveryReturn ? <div className="coach-v2-return-note"><span>You’re back from a training record.</span><button type="button" onClick={() => setRecoveryReturn(null)} aria-label="Dismiss return message">×</button></div> : null}
      <section className="coach-chat-panel" aria-label="Conversation with ORBIT">
        <header className="coach-chat-heading">
          <div className="orbit-portrait-wrap">{orbitAvailable ? <Image src="/images/orbit-avatar.webp" alt="" width={48} height={48} onError={() => setOrbitAvailable(false)} /> : <span aria-hidden="true">O</span>}</div>
          <div><h2>ORBIT <span>AI COACH</span></h2><p>{context ? `Here with you · ${context.localDate}` : "Your training companion"}</p></div>
          <span className="orbit-presence"><i aria-hidden="true" />{context?.canSend ? " Ready" : context ? " Replies paused" : " Loading"}</span>
        </header>
        <div className="coach-topic-picker" role="group" aria-label="Choose what to talk about">
          {(["reflect", "prepare", "general"] as const).map((value) => <button type="button" key={value} aria-pressed={topic === value} onClick={() => void chooseTopic(value)}>{topicLabels[value]}</button>)}
        </div>
        {context ? <div className="coach-context-row">
          <span className="coach-context-label">{topic === "reflect" ? "REFLECTING ON" : topic === "prepare" ? "GETTING READY FOR" : "TRAINING CONTEXT"}</span>
          {context.ambiguousSessions.length > 1 && topic === "prepare" && !selectedRecord ? <div className="coach-record-choices" role="group" aria-label="Choose a session to prepare for">{context.ambiguousSessions.map((session) => <button key={session.id} type="button" onClick={() => void selectRecord({ type: "session", id: session.id })}>{session.title} · {session.date}</button>)}</div> : <strong>{recordLabel(context, selectedRecord)}</strong>}
          {selectedRecord ? <button className="coach-change-context" type="button" onClick={() => { setSelectedRecord(null); void refreshContext(topic, null); }}>Change</button> : null}
          {context.latestActivity && topic !== "reflect" ? <button className="coach-context-chip" type="button" onClick={() => void selectRecord({ type: "activity", id: context.latestActivity!.id })}>Last activity · {context.latestActivity.title}</button> : null}
          {context.nextSession && topic !== "prepare" ? <button className="coach-context-chip" type="button" onClick={() => void selectRecord({ type: "session", id: context.nextSession!.id })}>Next session · {context.nextSession.title}</button> : null}
        </div> : null}
        {loadState === "loading" ? <p className="coach-v2-state" role="status" aria-busy="true">Loading your training context…</p> : null}
        {loadState === "error" ? <div className="coach-v2-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => void loadAll(true)}>Retry</button><Link href="/dashboard/calendar">Open Calendar</Link></div> : null}
        {failure && !messages.length ? <div className="coach-v2-error" role="alert"><p>{failure.message}</p></div> : null}
        <ol className="coach-transcript" ref={transcriptRef} onScroll={(event) => { if (actorId) { try { sessionStorage.setItem(`${prefix}${actorId}.scrollTop`, String(event.currentTarget.scrollTop)); } catch { /* session storage is optional */ } } }} aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text">
          {conversation.hasOlder ? <li className="coach-older-control"><button type="button" disabled={olderLoading} onClick={() => void loadOlder()}>{olderLoading ? "Loading…" : "Load earlier messages"}</button></li> : null}
          {messages.length === 0 && context ? <li className="coach-opening-message"><div className="coach-message-avatar">{orbitAvailable ? <Image src="/images/orbit-avatar.webp" alt="" width={36} height={36} onError={() => setOrbitAvailable(false)} /> : "O"}</div><div className="coach-bubble coach-bubble--assistant"><p>{context.opening.text}</p><time>{context.localDate}</time></div></li> : null}
          {messages.map((message) => <li className={`coach-message coach-message--${message.role}`} key={message.id}>
            {message.role === "assistant" ? <div className="coach-message-avatar">{orbitAvailable ? <Image src="/images/orbit-avatar.webp" alt="" width={36} height={36} onError={() => setOrbitAvailable(false)} /> : "O"}</div> : null}
            <div className={`coach-bubble coach-bubble--${message.role}`}><p>{message.text}</p><time>{messageTime(message.createdAt)}</time></div>
          </li>)}
          {sending || pending ? <li className="coach-message coach-message--assistant"><div className="coach-message-avatar">{orbitAvailable ? <Image src="/images/orbit-avatar.webp" alt="" width={36} height={36} onError={() => setOrbitAvailable(false)} /> : "O"}</div><div className="coach-bubble coach-bubble--assistant coach-generating" role="status" aria-live="polite"><span className="coach-dot-pulse" aria-hidden="true"><i /><i /><i /></span><span>ORBIT is thinking…</span></div></li> : null}
        </ol>
        {pending && leaseMayHaveExpired ? <div className="coach-v2-error coach-turn-error" role="status"><p>The reply may have stopped before it was saved. You can safely recover this message.</p><button type="button" disabled={sending} onClick={() => void retryReply()}>{sending ? "Recovering…" : "Recover reply"}</button></div> : null}
        {failure && messages.length ? <div className="coach-v2-error coach-turn-error" role="alert"><p>{failure.message}</p>{retryable && !(pending && leaseMayHaveExpired) ? <button type="button" disabled={sending} onClick={() => void retryReply()}>{sending ? "Retrying…" : "Retry reply"}</button> : null}</div> : null}
        {context?.actions.length ? <div className="coach-action-row" aria-label="Training details">{context.actions.filter((action) => action.kind !== "wellbeing").map((action) => { const href = action.href; const record = action.kind === "activity" && context.latestActivity ? { type: "activity" as const, id: context.latestActivity.id } : action.kind === "session" && context.nextSession ? { type: "session" as const, id: context.nextSession.id } : selectedRecord; return <Link id={`coach-action-${action.kind}`} key={`${action.kind}-${href}`} href={href} onClick={(event) => navigateWithCoachContext(event, href, record)} onAuxClick={(event) => navigateWithCoachContext(event, href, record)}>{action.label} <span aria-hidden="true">↗</span></Link>; })}</div> : null}
        <form className="coach-composer" onSubmit={(event) => void submitMessage(event)}>
          <label className="sr-only" htmlFor="coach-message-input">Message ORBIT</label>
          <textarea id="coach-message-input" value={draft} maxLength={4_000} rows={3} placeholder={topic === "reflect" ? "What stood out in your last training?" : topic === "prepare" ? "What would you like to know before your session?" : "Ask about your training…"} onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKey} disabled={loadState !== "ready" || !context?.canSend || sending} />
          <div className="coach-composer-footer"><span>Enter to send · Shift + Enter for a new line <span aria-hidden="true">·</span> {draft.length}/4,000</span><button className="coach-send-button" type="submit" disabled={!draft.trim() || !context?.canSend || loadState !== "ready" || sending || pending}>{sending ? "Sending…" : "Send message"}<span aria-hidden="true">↑</span></button></div>
        </form>
        {context && !context.canSend ? <p className="coach-chat-paused" role="status">Chat replies are paused. Your conversation remains available, and your training plan is unchanged.</p> : null}
        <p className="coach-chat-boundary">ORBIT offers training guidance. Your plan only changes when you approve an update.</p>
      </section>
      <section id="wellbeing" className="coach-wellbeing-entry" aria-labelledby="coach-wellbeing-heading">
        <div><p className="coach-v2-overline">RECOVERY CONTEXT</p><h2 id="coach-wellbeing-heading">How are you feeling today?</h2><p>A wellbeing check-in is optional and only saved if you choose to submit it.</p></div>
        <button type="button" aria-expanded={wellbeingOpen} aria-controls="coach-wellbeing-form" onClick={() => setWellbeingOpen((open) => !open)}>{wellbeingOpen ? "Close check-in" : context?.wellbeing?.status === "saved" ? "Review check-in" : "Add check-in"}</button>
        {wellbeingOpen && context ? <div id="coach-wellbeing-form" className="coach-wellbeing-form"><DailyWellbeingCheckIn key={`${context.timezone}-${context.localDate}`} timezone={context.timezone} date={context.localDate} compact={false} dailyModal={false} onSaved={() => { void refreshContext(); }} /></div> : null}
      </section>
      {recoveryReturn ? <div className="coach-v2-return-link"><Link href={recoveryReturn}>Return to your previous conversation position</Link></div> : null}
    </main>
  </div>;
}
