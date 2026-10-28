"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoachContext, CoachConversationMessage } from "../../../../packages/core/src/contracts/coach-chat";
import { coachVoiceTranscriptionResultSchema, COACH_VOICE_MAX_DRAFT_CHARS, COACH_VOICE_MAX_TRANSCRIPT_CHARS } from "../../../../packages/core/src/contracts/coach-voice";
import { encodeCoachVoiceWav } from "../../../../packages/core/src/services/coach-voice-audio";
import "./coach-voice.css";

type CaptureContext = { context: CoachContext; generation: number; sequence: number };
type VoiceDictationProps = {
  available: boolean;
  disabled: boolean;
  disclosureVersion: number;
  providerDataControlsUrl: string;
  remainingAllowanceMicroUsd: number;
  monthlyAllowanceMicroUsd: number;
  resetsAt: string;
  scopeKey: string;
  draft: string;
  setDraft(value: string): void;
  prepareTranscription(): Promise<CaptureContext>;
  onStart(): void;
  onAllowanceChanged(): void;
};

const DISCLOSURE_PREFIX = "racepredictor.orbit-voice-disclosure.";
const CLIENT_TRANSCRIPTION_TIMEOUT_MS = 20_000;
const MAX_RECORDING_MS = 120_000;

export function CoachVoiceDictation(props: VoiceDictationProps) {
  const [recordingState, setRecordingState] = useState<"idle" | "permission" | "recording" | "transcribing">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [error, setError] = useState("");
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const framesRef = useRef<Int16Array[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const muteRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const maximumTimerRef = useRef<number | null>(null);
  const transcriptExpiryTimerRef = useRef<number | null>(null);
  const recordedSampleCountRef = useRef(0);
  const flushAckRef = useRef<(() => void) | null>(null);
  const flushAckTimerRef = useRef<number | null>(null);
  const recordStartedAtRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const captureSessionRef = useRef(0);
  const recordingRef = useRef(false);
  const unmountingRef = useRef(false);

  useEffect(() => {
    try { setDisclosureAccepted(sessionStorage.getItem(`${DISCLOSURE_PREFIX}${props.disclosureVersion}`) === "accepted"); }
    catch { setDisclosureAccepted(false); }
  }, [props.disclosureVersion]);

  const releaseCapture = useCallback((discardFrames: boolean) => {
    recordingRef.current = false;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (maximumTimerRef.current !== null) window.clearTimeout(maximumTimerRef.current);
    maximumTimerRef.current = null;
    try { workletRef.current?.port.close(); } catch { /* browser cleanup is best effort */ }
    try { sourceRef.current?.disconnect(); } catch { /* browser cleanup is best effort */ }
    try { workletRef.current?.disconnect(); } catch { /* browser cleanup is best effort */ }
    try { muteRef.current?.disconnect(); } catch { /* browser cleanup is best effort */ }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    sourceRef.current = null;
    workletRef.current = null;
    muteRef.current = null;
    const audioContext = contextRef.current;
    contextRef.current = null;
    if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => undefined);
    if (discardFrames) {
      for (const frame of framesRef.current) frame.fill(0);
      framesRef.current = [];
      recordedSampleCountRef.current = 0;
    }
  }, []);

  const cancel = useCallback((message = "") => {
    captureSessionRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    if (flushAckTimerRef.current !== null) window.clearTimeout(flushAckTimerRef.current);
    flushAckTimerRef.current = null;
    flushAckRef.current?.(); flushAckRef.current = null;
    if (transcriptExpiryTimerRef.current !== null) window.clearTimeout(transcriptExpiryTimerRef.current);
    transcriptExpiryTimerRef.current = null;
    releaseCapture(true);
    setRecordingState("idle");
    setElapsed(0);
    setTranscript("");
    setDisclosureOpen(false);
    setError(message);
  }, [releaseCapture]);

  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    unmountingRef.current = false;
    const onStop = () => cancelRef.current();
    const onPageHide = () => cancelRef.current();
    const onHidden = () => { if (document.visibilityState !== "visible") cancelRef.current(); };
    window.addEventListener("orbit:voice-stop", onStop);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("orbit:voice-stop", onStop);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHidden);
      unmountingRef.current = true;
      captureSessionRef.current += 1;
      requestRef.current?.abort();
      if (transcriptExpiryTimerRef.current !== null) window.clearTimeout(transcriptExpiryTimerRef.current);
      releaseCapture(true);
    };
  }, [releaseCapture]);

  const scopeKeyRef = useRef(props.scopeKey);
  useEffect(() => {
    if (scopeKeyRef.current !== props.scopeKey) {
      scopeKeyRef.current = props.scopeKey;
      cancel("Voice activity stopped because the coaching conversation changed.");
      window.dispatchEvent(new Event("orbit:voice-stop"));
    }
  }, [props.scopeKey, cancel]);
  useEffect(() => { if (props.disabled && recordingState !== "idle") cancel("Voice activity stopped because the coaching conversation changed."); }, [props.disabled, recordingState, cancel]);

  const startRecording = useCallback(async () => {
    setError(""); setTranscript(""); setElapsed(0); setDisclosureOpen(false);
    if (!navigator.mediaDevices?.getUserMedia || !("AudioWorkletNode" in window)) {
      setError("Voice capture is not supported in this browser. You can still type your message.");
      return;
    }
    setRecordingState("permission");
    props.onStart();
    const captureSession = ++captureSessionRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (captureSession !== captureSessionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const audioContext = new AudioContext();
      contextRef.current = audioContext;
      if (!audioContext.audioWorklet) throw new Error("This browser does not support voice recording.");
      await audioContext.audioWorklet.addModule("/audio/coach-voice-processor.js");
      await audioContext.resume();
      if (captureSession !== captureSessionRef.current) { releaseCapture(true); return; }
      const source = audioContext.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioContext, "coach-voice-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      const mute = audioContext.createGain(); mute.gain.value = 0;
      worklet.port.onmessage = (event: MessageEvent<{ type?: string; frame?: Int16Array }>) => {
        if (event.data?.type === "flushed") {
          if (flushAckTimerRef.current !== null) window.clearTimeout(flushAckTimerRef.current);
          flushAckTimerRef.current = null; flushAckRef.current?.(); flushAckRef.current = null; return;
        }
        const frame = event.data?.frame;
        if (recordingRef.current && event.data?.type === "pcm" && frame instanceof Int16Array) {
          const remaining = Math.max(0, 1_920_000 - recordedSampleCountRef.current);
          if (remaining >= frame.length) { framesRef.current.push(frame); recordedSampleCountRef.current += frame.length; }
          else if (remaining > 0) { framesRef.current.push(frame.slice(0, remaining)); recordedSampleCountRef.current += remaining; frame.fill(0); }
          else frame.fill(0);
        } else frame?.fill(0);
      };
      source.connect(worklet); worklet.connect(mute); mute.connect(audioContext.destination);
      sourceRef.current = source; workletRef.current = worklet; muteRef.current = mute;
      framesRef.current = [];
      recordedSampleCountRef.current = 0;
      recordStartedAtRef.current = Date.now();
      recordingRef.current = true;
      setRecordingState("recording");
      timerRef.current = window.setInterval(() => setElapsed(Math.min(120, Math.floor((Date.now() - recordStartedAtRef.current) / 1_000))), 250);
      maximumTimerRef.current = window.setTimeout(() => { if (recordingRef.current) void finishRef.current(); }, MAX_RECORDING_MS);
    } catch (cause) {
      if (captureSession !== captureSessionRef.current) return;
      if (unmountingRef.current) { releaseCapture(true); return; }
      releaseCapture(true); setRecordingState("idle");
      setError(cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "Microphone permission was denied. You can allow access in browser settings or type your message."
        : "The microphone could not be started. You can try again or type your message.");
    }
  }, [props.onStart, releaseCapture]);

  const beginAfterDisclosure = useCallback(() => {
    try { sessionStorage.setItem(`${DISCLOSURE_PREFIX}${props.disclosureVersion}`, "accepted"); } catch { /* session storage is optional */ }
    setDisclosureAccepted(true);
    void startRecording();
  }, [props.disclosureVersion, startRecording]);

  const finishRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    const captureSession = captureSessionRef.current;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (maximumTimerRef.current !== null) window.clearTimeout(maximumTimerRef.current);
    maximumTimerRef.current = null;
    const flushed = new Promise<void>((resolve) => {
      flushAckRef.current = resolve;
      workletRef.current?.port.postMessage({ type: "flush" });
      flushAckTimerRef.current = window.setTimeout(() => {
        flushAckTimerRef.current = null; flushAckRef.current?.(); flushAckRef.current = null;
      }, 250);
    });
    await flushed;
    flushAckRef.current = null;
    if (captureSession !== captureSessionRef.current) return;
    recordingRef.current = false;
    releaseCapture(false);
    setRecordingState("transcribing");
    const frames = framesRef.current;
    let wav: Uint8Array;
    try { wav = encodeCoachVoiceWav(frames); }
    catch {
      releaseCapture(true); setRecordingState("idle"); setError("Record at least half a second, then try again."); return;
    }
    for (const frame of frames) frame.fill(0);
    framesRef.current = [];
    const controller = new AbortController();
    requestRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, CLIENT_TRANSCRIPTION_TIMEOUT_MS);
    try {
      const snapshot = await props.prepareTranscription();
      const operationId = crypto.randomUUID();
      const metadata = {
        operationId, expectedGeneration: snapshot.generation, expectedSequence: snapshot.sequence,
        topic: snapshot.context.selectedTopic, selectedRecord: snapshot.context.selectedRecord,
        contextFingerprint: snapshot.context.fingerprint,
      };
      const response = await fetch("/api/v1/coaching/voice/transcriptions", {
        method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal,
        headers: { "content-type": "audio/wav", "x-orbit-voice": JSON.stringify(metadata) }, body: wav,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorPayload = payload && typeof payload === "object" ? (payload as Record<string, unknown>).error : null;
        const message = errorPayload && typeof errorPayload === "object" && typeof (errorPayload as Record<string, unknown>).message === "string"
          ? String((errorPayload as Record<string, unknown>).message) : "Voice transcription failed. Your draft is still here.";
        throw new Error(message);
      }
      const result = coachVoiceTranscriptionResultSchema.safeParse((payload as { data?: unknown }).data);
      if (!result.success || result.data.operationId !== operationId || result.data.generation !== metadata.expectedGeneration
        || result.data.sequence !== metadata.expectedSequence || result.data.contextFingerprint !== metadata.contextFingerprint) {
        throw new Error("The conversation changed before the transcript was ready. Record again or type your message.");
      }
      if (!unmountingRef.current) {
        setTranscript(result.data.transcript);
        if (transcriptExpiryTimerRef.current !== null) window.clearTimeout(transcriptExpiryTimerRef.current);
        transcriptExpiryTimerRef.current = window.setTimeout(() => {
          setTranscript(""); setError("Transcript expired after five minutes. Record again or type your message.");
          transcriptExpiryTimerRef.current = null;
        }, 300_000);
      }
    } catch (cause) {
      if (!unmountingRef.current && timedOut) setError("Voice transcription took too long. Record again or type your message.");
      else if (!unmountingRef.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Voice transcription failed. Your draft is still here.");
    } finally {
      window.clearTimeout(timeout);
      wav.fill(0);
      if (requestRef.current === controller) requestRef.current = null;
      if (!unmountingRef.current) props.onAllowanceChanged();
      if (!unmountingRef.current) setRecordingState("idle");
    }
  }, [props.prepareTranscription, props.onAllowanceChanged, releaseCapture]);

  const finishRef = useRef(finishRecording);
  finishRef.current = finishRecording;
  // The two-minute timer holds a stable callback without capturing stale render data.
  useEffect(() => { const timer = timerRef.current; return () => { if (timer !== null) window.clearInterval(timer); }; }, []);

  function insertTranscript(replace: boolean) {
    const insertion = transcript.trim();
    const next = replace || !props.draft.trim() ? insertion : `${props.draft.trimEnd()}\n${insertion}`;
    if (next.length > COACH_VOICE_MAX_DRAFT_CHARS) {
      setError("This transcript does not fit in the 4,000-character draft. Shorten it or replace the current draft.");
      return;
    }
    props.setDraft(next); setTranscript(""); setError("");
    if (transcriptExpiryTimerRef.current !== null) window.clearTimeout(transcriptExpiryTimerRef.current);
    transcriptExpiryTimerRef.current = null;
    requestAnimationFrame(() => document.getElementById("coach-message-input")?.focus({ preventScroll: true }));
  }

  if (!props.available) return null;
  const draftAppend = props.draft.trim() ? `${props.draft.trimEnd()}\n${transcript.trim()}` : transcript.trim();
  const busy = recordingState !== "idle";
  return <div className="coach-voice-dictation">
    {recordingState === "idle" && !transcript ? <button type="button" className="coach-voice-record-button" disabled={props.disabled} onClick={() => {
      setError("");
      if (disclosureAccepted) void startRecording(); else setDisclosureOpen(true);
    }}><span aria-hidden="true">●</span> Dictate</button> : null}
    {recordingState === "permission" ? <div className="coach-voice-status" role="status" aria-live="polite">Requesting microphone permission… <button type="button" onClick={() => cancel()}>Cancel</button></div> : null}
    {recordingState === "recording" ? <div className="coach-voice-recording" role="group" aria-label="Voice recording controls"><span className="coach-voice-live-dot" aria-hidden="true" /><span role="timer" aria-live="off">Recording · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} / 2:00</span><button type="button" onClick={() => void finishRef.current()}>Stop and review</button><button type="button" onClick={() => cancel("Recording discarded. Your draft is unchanged.")}>Cancel recording</button></div> : null}
    {recordingState === "transcribing" ? <div className="coach-voice-status" role="status" aria-live="polite">Preparing your transcript… <button type="button" onClick={() => cancel("Transcription cancelled. Your draft is unchanged.")}>Cancel</button></div> : null}
    {disclosureOpen ? <div className="coach-voice-disclosure" role="group" aria-labelledby="coach-voice-disclosure-title">
      <strong id="coach-voice-disclosure-title">Voice data and microphone access</strong>
      <p>ORBIT will send this recording to OpenAI to create a transcript for you to review. Your audio and transcript are not saved in RacePredictor’s conversation history until you choose to send the draft. OpenAI’s data controls and retention information are <a href={props.providerDataControlsUrl} target="_blank" rel="noreferrer">available here</a>.</p>
      <div><button type="button" onClick={beginAfterDisclosure}>Continue to microphone permission</button><button type="button" onClick={() => setDisclosureOpen(false)}>Not now</button></div>
    </div> : null}
    {transcript ? <div className="coach-voice-review">
      <label htmlFor="coach-voice-transcript">Review and edit transcript</label>
      <textarea id="coach-voice-transcript" value={transcript} maxLength={COACH_VOICE_MAX_TRANSCRIPT_CHARS} rows={4} onChange={(event) => setTranscript(event.target.value)} />
      <div className="coach-voice-review-actions"><span>{transcript.length.toLocaleString()}/16,000 characters</span>
        <button type="button" disabled={draftAppend.length > COACH_VOICE_MAX_DRAFT_CHARS} onClick={() => insertTranscript(false)}>{props.draft.trim() ? "Append to draft" : "Insert into draft"}</button>
        {props.draft.trim() ? <button type="button" onClick={() => insertTranscript(true)}>Replace draft</button> : null}
        <button type="button" onClick={() => { setTranscript(""); setError(""); if (transcriptExpiryTimerRef.current !== null) window.clearTimeout(transcriptExpiryTimerRef.current); transcriptExpiryTimerRef.current = null; }}>Discard transcript</button>
      </div>
      {draftAppend.length > COACH_VOICE_MAX_DRAFT_CHARS ? <p className="coach-voice-note">Shorten the transcript or replace the draft to fit the 4,000-character limit.</p> : null}
    </div> : null}
    {error ? <p className="coach-voice-error" role="alert">{error}</p> : null}
    <p className="coach-voice-budget">Estimated voice allowance · ${(props.remainingAllowanceMicroUsd / 1_000_000).toFixed(2)} of ${(props.monthlyAllowanceMicroUsd / 1_000_000).toFixed(2)} remaining; resets {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(props.resetsAt))}. Tax and hosting are excluded.</p>
    {busy && recordingState !== "recording" ? null : <span className="sr-only" aria-live="polite">{busy ? "Voice processing in progress" : "Voice controls ready"}</span>}
  </div>;
}

type ReplyPlayerProps = { message: CoachConversationMessage; generation: number; available: boolean; disabled: boolean; onAllowanceChanged(): void };
type PlayerState = "idle" | "preparing" | "playing" | "paused" | "ready" | "error";

export function CoachVoiceReplyPlayer({ message, generation, available, disabled, onAllowanceChanged }: ReplyPlayerProps) {
  const [state, setState] = useState<PlayerState>("idle");
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [segment, setSegment] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const playbackIdRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef("");
  const expiredRef = useRef(false);
  const expiryTimerRef = useRef<number | null>(null);

  const revokeAudio = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = ""; setAudioUrl("");
  }, []);
  const releasePlayer = useCallback(() => {
    controllerRef.current?.abort(); controllerRef.current = null;
    if (expiryTimerRef.current !== null) window.clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = null;
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = ""; playbackIdRef.current = ""; expiredRef.current = false;
  }, []);
  const stop = useCallback(() => {
    releasePlayer(); setAudioUrl("");
    setState("idle"); setSegment(0); setTotalSegments(0); setError("");
  }, [releasePlayer]);
  const stopRef = useRef(stop); stopRef.current = stop;

  useEffect(() => {
    const cancel = () => stopRef.current();
    const cancelPlayback = () => stopRef.current();
    const onVisibility = () => { if (document.visibilityState !== "visible") cancel(); };
    window.addEventListener("orbit:voice-stop", cancel);
    window.addEventListener("orbit:voice-playback-stop", cancelPlayback);
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("orbit:voice-stop", cancel); window.removeEventListener("orbit:voice-playback-stop", cancelPlayback); window.removeEventListener("pagehide", cancel); document.removeEventListener("visibilitychange", onVisibility); releasePlayer(); };
  }, [releasePlayer]);

  const loadSegment = useCallback(async (index: number, playbackId: string, autoPlay: boolean) => {
    const controller = new AbortController(); controllerRef.current = controller;
    setState("preparing"); setError("");
    try {
      const operationId = crypto.randomUUID();
      const response = await fetch("/api/v1/coaching/voice/speech", {
        method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playbackId, operationId, expectedGeneration: generation, messageId: message.id, chunkIndex: index }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const failure = (payload as { error?: { message?: unknown } }).error;
        throw new Error(typeof failure?.message === "string" ? failure.message : "Reply audio could not be prepared.");
      }
      onAllowanceChanged();
      if (response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "audio/mpeg") throw new Error("Reply audio had an unsupported format.");
      const count = Number(response.headers.get("x-orbit-chunk-count"));
      if (response.headers.get("x-orbit-playback-id") !== playbackId || response.headers.get("x-orbit-operation-id") !== operationId
        || Number(response.headers.get("x-orbit-chunk-index")) !== index || !Number.isInteger(count) || count < 1 || count > 6 || index >= count) {
        throw new Error("Reply audio did not match this conversation. Choose Listen to reply again.");
      }
      const blob = await response.blob();
      if (controller.signal.aborted || playbackIdRef.current !== playbackId) return;
      revokeAudio();
      const url = URL.createObjectURL(blob); urlRef.current = url;
      setAudioUrl(url); setSegment(index); setTotalSegments(count); setState("ready");
      if (autoPlay) window.setTimeout(() => { if (playbackIdRef.current === playbackId) void audioRef.current?.play().catch(() => setState("ready")); }, 0);
    } catch (cause) {
      if (controller.signal.aborted) { onAllowanceChanged(); return; }
      onAllowanceChanged();
      setError(cause instanceof Error ? cause.message : "Reply audio could not be prepared."); setState("error");
    }
  }, [generation, message.id, onAllowanceChanged, revokeAudio]);

  function start() {
    window.dispatchEvent(new Event("orbit:voice-playback-stop"));
    const playbackId = crypto.randomUUID(); playbackIdRef.current = playbackId;
    expiredRef.current = false; setState("preparing"); setError("");
    expiryTimerRef.current = window.setTimeout(() => { if (playbackIdRef.current === playbackId) stopRef.current(); }, 300_000);
    void loadSegment(0, playbackId, true);
  }

  async function onEnded() {
    const playbackId = playbackIdRef.current;
    if (!playbackId || segment + 1 >= totalSegments) { stop(); return; }
    revokeAudio();
    await loadSegment(segment + 1, playbackId, true);
  }

  if (!available || message.role !== "assistant") return null;
  return <div className="coach-voice-player">
    {state === "idle" || state === "error" ? <button type="button" disabled={disabled} onClick={start}>Listen to reply</button> : null}
    {state === "preparing" ? <span role="status" aria-live="polite">Preparing reply audio… <button type="button" onClick={stop}>Stop</button></span> : null}
    {audioUrl ? <audio ref={audioRef} controls preload="none" src={audioUrl} onPlay={() => setState("playing")} onPause={(event) => { if (!event.currentTarget.ended && playbackIdRef.current) setState("paused"); }} onEnded={() => void onEnded()} aria-label={`Spoken coach reply, segment ${segment + 1} of ${totalSegments}`} /> : null}
    {audioUrl && (state === "playing" || state === "paused" || state === "ready") ? <button type="button" onClick={stop}>Stop listening</button> : null}
    {totalSegments > 1 && audioUrl ? <span aria-live="polite">Part {segment + 1} of {totalSegments}</span> : null}
    {error ? <span className="coach-voice-player-error" role="alert">{error}</span> : null}
  </div>;
}

export function stopAllCoachVoice() { window.dispatchEvent(new Event("orbit:voice-stop")); }
