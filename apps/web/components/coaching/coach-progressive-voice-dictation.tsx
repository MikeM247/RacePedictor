"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { COACH_CHAT_MAX_MESSAGE_CHARS, type CoachContext } from "../../../../packages/core/src/contracts/coach-chat";
import {
  CoachProgressiveDictationController,
  PROGRESSIVE_HEARTBEAT_MS,
  type ProgressiveControllerSnapshot,
  type ProgressiveSection,
} from "../../lib/coach-progressive-dictation-controller";
import "./coach-voice.css";

type CaptureContext = { context: CoachContext; generation: number; sequence: number };
type Props = {
  children: ReactNode;
  footer: ReactNode;
  available: boolean;
  disabled: boolean;
  disclosureVersion: number;
  providerDataControlsUrl: string;
  remainingAllowanceMicroUsd: number;
  monthlyAllowanceMicroUsd: number;
  resetsAt: string;
  scopeKey: string;
  draft: string;
  onInsertTranscript(transcript: string, mode: "append" | "replace"): boolean;
  onBusyChange(busy: boolean): void;
  prepareTranscription(): Promise<CaptureContext>;
  onStart(): void;
  onAllowanceChanged(): void;
};

const DISCLOSURE_PREFIX = "racepredictor.orbit-voice-disclosure.";
const initialSnapshot: ProgressiveControllerSnapshot = { capturedSeconds: 0, sectionCount: 0, completedCount: 0, failedCount: 0, pendingAudioSeconds: 0, sessionId: null, pausedForQueue: false, error: "", transcript: "", sections: [] };

export function CoachProgressiveVoiceDictation(props: Props) {
  const [mode, setMode] = useState<"idle" | "permission" | "recording" | "paused" | "stopping" | "review">("idle");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [reviewText, setReviewText] = useState("");
  const [reviewEdited, setReviewEdited] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [recoveredSections, setRecoveredSections] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const micRef = useRef<HTMLButtonElement | null>(null);
  const focusAfterRef = useRef(false);
  const controllerRef = useRef<CoachProgressiveDictationController | null>(null);
  const captureWantedRef = useRef(false);
  const captureOperationRef = useRef(0);
  const insertingRef = useRef(false);
  const capturingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const muteRef = useRef<GainNode | null>(null);
  const flushResolveRef = useRef<(() => void) | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const lastVisualUpdateRef = useRef(0);
  const mountedRef = useRef(true);
  const scopeRef = useRef(props.scopeKey);
  const pauseRef = useRef<(reason: "queue_full" | "transcription_failed" | "session_expired" | "connection_interrupted") => void>(() => undefined);
  const stopRef = useRef<() => void>(() => undefined);

  const setModeAndBusy = useCallback((next: typeof mode) => {
    setMode(next);
    props.onBusyChange(next !== "idle");
  }, [props.onBusyChange]);

  const createController = useCallback(() => {
    const controller = new CoachProgressiveDictationController({
      onChange: (next) => { if (mountedRef.current && controllerRef.current === controller) setSnapshot(next); },
      onPauseRequired: (reason) => pauseRef.current(reason),
      onDurationLimit: () => stopRef.current(),
    });
    controllerRef.current = controller;
    return controller;
  }, []);

  const releaseCaptureGraph = useCallback(async (flush: boolean) => {
    const worklet = workletRef.current;
    if (flush && worklet) {
      await new Promise<void>((resolve) => {
        flushResolveRef.current = resolve;
        worklet.port.postMessage({ type: "flush" });
        flushTimerRef.current = window.setTimeout(() => { flushTimerRef.current = null; flushResolveRef.current?.(); flushResolveRef.current = null; }, 300);
      });
    }
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null; flushResolveRef.current = null;
    capturingRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    try { sourceRef.current?.disconnect(); } catch { /* best-effort audio cleanup */ }
    try { workletRef.current?.disconnect(); workletRef.current?.port.close(); } catch { /* best-effort audio cleanup */ }
    try { muteRef.current?.disconnect(); } catch { /* best-effort audio cleanup */ }
    sourceRef.current = null; workletRef.current = null; muteRef.current = null;
    const audioContext = contextRef.current; contextRef.current = null;
    if (audioContext && audioContext.state !== "closed") await audioContext.close().catch(() => undefined);
  }, []);

  const pauseCapture = useCallback(async (reason?: "queue_full" | "transcription_failed" | "session_expired" | "connection_interrupted") => {
    if (!capturingRef.current && mode !== "recording" && reason !== "session_expired") return;
    const operation = captureOperationRef.current;
    captureWantedRef.current = false;
    await releaseCaptureGraph(true);
    if (captureOperationRef.current !== operation || !mountedRef.current) return;
    controllerRef.current?.pauseCapture();
    if (mountedRef.current) {
      if (reason === "session_expired") {
        const current = controllerRef.current?.snapshot() ?? initialSnapshot;
        setSnapshot(current); if (!reviewEdited) setReviewText(current.transcript);
        setModeAndBusy("review");
      } else setModeAndBusy("paused");
      if (reason === "queue_full") setError("Uploads are catching up. Resume when the pending audio queue has room.");
      else if (reason === "transcription_failed") setError("Dictation paused after a section failed. Retry it or stop and review.");
      else if (reason === "connection_interrupted") setError("Connection interrupted. Resume when connected, retry a missing section, or stop and review.");
      else if (reason === "session_expired") setError("The dictation session expired. Recognized text is still available to review.");
    }
  }, [mode, reviewEdited, releaseCaptureGraph, setModeAndBusy]);
  pauseRef.current = (reason) => { void pauseCapture(reason); };

  const finishAndReview = useCallback(async () => {
    const operation = ++captureOperationRef.current;
    captureWantedRef.current = false;
    setModeAndBusy("stopping");
    await releaseCaptureGraph(true);
    if (captureOperationRef.current !== operation || !mountedRef.current) return;
    await controllerRef.current?.stopCapture();
    if (!mountedRef.current || captureOperationRef.current !== operation) return;
    const current = controllerRef.current?.snapshot() ?? initialSnapshot;
    setSnapshot(current); setReviewText(current.transcript); setReviewEdited(false); setReplaceConfirm(false);
    setRetryBusy(false);
    setModeAndBusy("review");
  }, [releaseCaptureGraph, setModeAndBusy]);
  stopRef.current = () => { void finishAndReview(); };

  const attachMicrophone = useCallback(async (resume: boolean, operation: number) => {
    const assertCurrent = () => {
      if (!mountedRef.current || !captureWantedRef.current || captureOperationRef.current !== operation || document.visibilityState !== "visible") throw new Error("Dictation was cancelled while the microphone was starting.");
    };
    if (!navigator.mediaDevices?.getUserMedia || !("AudioWorkletNode" in window)) throw new Error("Voice capture is not supported in this browser. You can still type your message.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    try { assertCurrent(); } catch (cause) { stream.getTracks().forEach((track) => track.stop()); throw cause; }
    streamRef.current = stream;
    try {
      if (!resume) {
        const captureContext = await props.prepareTranscription();
        assertCurrent();
        const controller = createController();
        await controller.startSession(captureContext);
        assertCurrent();
      }
      const audioContext = new AudioContext(); contextRef.current = audioContext;
      await audioContext.audioWorklet.addModule("/audio/coach-voice-processor.js"); await audioContext.resume();
      assertCurrent();
      const source = audioContext.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioContext, "coach-voice-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      const mute = audioContext.createGain(); mute.gain.value = 0;
      worklet.port.onmessage = (event: MessageEvent<{ type?: string; frame?: Int16Array }>) => {
        if (event.data?.type === "flushed") { flushResolveRef.current?.(); flushResolveRef.current = null; return; }
        const frame = event.data?.frame;
        if (capturingRef.current && event.data?.type === "pcm" && frame instanceof Int16Array) {
          const now = performance.now();
          if (now - lastVisualUpdateRef.current > 80) {
            let energy = 0; for (let index = 0; index < frame.length; index += 1) { const sample = frame[index] / 32768; energy += sample * sample; }
            setAudioLevel(Math.min(1, Math.sqrt(energy / Math.max(1, frame.length)) * 5)); lastVisualUpdateRef.current = now;
          }
          controllerRef.current?.pushFrame(frame);
        } else frame?.fill(0);
      };
      source.connect(worklet); worklet.connect(mute); mute.connect(audioContext.destination);
      sourceRef.current = source; workletRef.current = worklet; muteRef.current = mute;
      if (resume && !controllerRef.current?.resumeCapture()) throw new Error("The pending audio queue is still full. Wait for uploads or stop and review.");
      capturingRef.current = true;
    } catch (cause) {
      if (captureOperationRef.current === operation) await releaseCaptureGraph(false);
      throw cause;
    }
  }, [createController, props.prepareTranscription, releaseCaptureGraph]);

  const beginCapture = useCallback(async (resume = false) => {
    const operation = ++captureOperationRef.current;
    insertingRef.current = false;
    setRetryBusy(false);
    if (!resume) setRecoveredSections([]);
    setError(""); setAudioLevel(0); setDisclosureOpen(false); setModeAndBusy("permission");
    props.onStart();
    try {
      captureWantedRef.current = true;
      await attachMicrophone(resume, operation);
      if (captureOperationRef.current !== operation) return;
      if (!resume) controllerRef.current?.resumeCapture();
      setModeAndBusy("recording");
    } catch (cause) {
      if (captureOperationRef.current !== operation || !mountedRef.current) return;
      captureWantedRef.current = false;
      await releaseCaptureGraph(false);
      if (!resume) { await controllerRef.current?.close(true); controllerRef.current = null; setSnapshot(initialSnapshot); }
      setModeAndBusy(resume ? "paused" : "idle");
      setError(cause instanceof Error ? cause.message : "The microphone could not be started. You can try again or type your message.");
    }
  }, [attachMicrophone, props.onStart, releaseCaptureGraph, setModeAndBusy]);

  const cancelSession = useCallback(async (message = "") => {
    const operation = ++captureOperationRef.current;
    captureWantedRef.current = false;
    const controller = controllerRef.current; controllerRef.current = null;
    void controller?.close(true, true).finally(() => { if (mountedRef.current) props.onAllowanceChanged(); });
    await releaseCaptureGraph(false);
    if (captureOperationRef.current !== operation || !mountedRef.current) return;
    controllerRef.current = null; setSnapshot(initialSnapshot); setReviewText(""); setReviewEdited(false); setReplaceConfirm(false); setRecoveredSections([]); setRetryBusy(false); setError(message);
    if (mountedRef.current) setModeAndBusy("idle");
  }, [releaseCaptureGraph, setModeAndBusy, props.onAllowanceChanged]);

  useEffect(() => {
    try { setDisclosureAccepted(sessionStorage.getItem(`${DISCLOSURE_PREFIX}progressive.${props.disclosureVersion}`) === "accepted"); } catch { setDisclosureAccepted(false); }
  }, [props.disclosureVersion]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (mode !== "recording" && mode !== "paused" && mode !== "review") return;
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") void controller?.heartbeat();
      controller?.expireAudio();
    }, PROGRESSIVE_HEARTBEAT_MS);
    return () => window.clearInterval(heartbeat);
  }, [mode, snapshot.sessionId]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "visible") return;
      ++captureOperationRef.current;
      captureWantedRef.current = false;
      setRetryBusy(false);
      const controller = controllerRef.current;
      const suspension = controller?.suspendForVisibility();
      void releaseCaptureGraph(false).then(() => suspension).then(() => {
        if (!mountedRef.current) return;
        const current = controllerRef.current?.snapshot() ?? initialSnapshot;
        setSnapshot(current); if (!reviewEdited) { setReviewText(current.transcript); setReviewEdited(false); } setModeAndBusy(current.sectionCount ? "review" : "idle");
        setError("Coach must remain visible while recording. Audio still waiting for transcription was discarded when the page went into the background.");
      });
    };
    const onPageHide = () => { ++captureOperationRef.current; captureWantedRef.current = false; void controllerRef.current?.suspendForVisibility(); void releaseCaptureGraph(false); };
    const onStop = () => { void cancelSession(); };
    document.addEventListener("visibilitychange", onHidden); window.addEventListener("pagehide", onPageHide); window.addEventListener("orbit:voice-stop", onStop);
    return () => { document.removeEventListener("visibilitychange", onHidden); window.removeEventListener("pagehide", onPageHide); window.removeEventListener("orbit:voice-stop", onStop); };
  }, [cancelSession, releaseCaptureGraph, reviewEdited, setModeAndBusy]);

  useEffect(() => {
    if (scopeRef.current === props.scopeKey) return;
    scopeRef.current = props.scopeKey;
    void cancelSession("Dictation ended because the coaching context changed.");
  }, [props.scopeKey, cancelSession]);

  useEffect(() => {
    if (props.disabled && mode !== "idle" && mode !== "review") void cancelSession("Dictation ended because Coach is unavailable. Your typed draft is unchanged.");
  }, [props.disabled, mode, cancelSession]);

  useEffect(() => {
    if (mode === "review" && !reviewEdited) setReviewText(snapshot.transcript);
  }, [mode, reviewEdited, snapshot.transcript]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false; captureWantedRef.current = false;
      ++captureOperationRef.current;
      void releaseCaptureGraph(false); controllerRef.current?.dispose(); controllerRef.current = null;
    };
  }, [releaseCaptureGraph]);

  useEffect(() => {
    if (!focusAfterRef.current) return;
    focusAfterRef.current = false; requestAnimationFrame(() => micRef.current?.focus());
  }, [mode]);

  const progressLabel = `${snapshot.completedCount} of ${snapshot.sectionCount} sections transcribed`;
  const unresolved = snapshot.sections.filter((section) => section.state !== "complete" && section.state !== "omitted");
  const canInsert = !retryBusy && recoveredSections.length === 0 && unresolved.length === 0 && reviewText.trim().length > 0 && reviewText.length <= COACH_CHAT_MAX_MESSAGE_CHARS;
  const captureStart = () => {
    if (props.disabled) return;
    setError("");
    if (disclosureAccepted) void beginCapture(false); else setDisclosureOpen(true);
  };
  const pauseButton = () => { void pauseCapture(); };
  const handleRetry = async (section: ProgressiveSection) => {
    if (retryBusy) return;
    const controller = controllerRef.current;
    const operation = captureOperationRef.current;
    setRetryBusy(true);
    setError("A retry may incur additional provider cost if the earlier response was lost.");
    const succeeded = await controller?.retry(section.order);
    if (captureOperationRef.current !== operation || controllerRef.current !== controller || !mountedRef.current) return;
    setRetryBusy(false);
    if (succeeded && mode === "review" && reviewEdited) setRecoveredSections((current) => [...new Set([...current, section.order])]);
    if (succeeded) setError("");
    else setError(controllerRef.current?.snapshot().error || "The section could not be retried. You can acknowledge its omission.");
  };
  const handleInsert = async (mode: "append" | "replace") => {
    if (!canInsert || insertingRef.current) return;
    insertingRef.current = true;
    if (!props.onInsertTranscript(reviewText, mode)) { insertingRef.current = false; setError("The transcript and draft together exceed 30,000 characters. Edit the transcript or replace the draft."); return; }
    const controller = controllerRef.current; controllerRef.current = null;
    void controller?.close(false, true).finally(() => { if (mountedRef.current) props.onAllowanceChanged(); });
    setSnapshot(initialSnapshot); setReviewText(""); setReviewEdited(false); setReplaceConfirm(false); setRecoveredSections([]); setModeAndBusy("idle");
  };
  const discard = () => { focusAfterRef.current = true; void cancelSession("Dictation discarded. Your typed draft is unchanged."); };

  return <div className="coach-voice-dictation coach-progressive-dictation">
    <div className="coach-composer-input-frame">
      {props.children}
      {mode === "recording" ? <div className="coach-voice-listening-controls"><div className="coach-voice-waveform" role="img" aria-label="Microphone recording volume" style={{ "--voice-level": audioLevel } as CSSProperties}>{[0.58, 0.84, 0.48, 1, 0.66, 0.9, 0.54].map((height, index) => <i key={index} style={{ "--bar-height": height } as CSSProperties} />)}</div></div> : null}
    </div>
    {mode === "idle" ? <div className="coach-voice-status"><button ref={micRef} type="button" disabled={props.disabled} onClick={captureStart}>Start dictation</button><span>Up to 15 minutes. Coach must remain visible while recording.</span></div> : null}
    {mode === "permission" ? <div className="coach-voice-status" role="status" aria-live="polite">Preparing microphone and private dictation session… <button type="button" onClick={discard}>Cancel</button></div> : null}
    {mode === "recording" || mode === "paused" || mode === "stopping" ? <div className="coach-voice-recording" role="group" aria-label="Progressive dictation controls">
      <span className={`coach-voice-live-dot${mode !== "recording" ? " coach-voice-live-dot--paused" : ""}`} aria-hidden="true" />
      <span className="coach-voice-listening-label" role="status" aria-live="polite">{mode === "recording" ? "Recording · transcript updates as sections finish" : mode === "paused" ? "Paused · Resume requires your action" : "Stopping and finishing pending sections…"}</span>
      <span className="coach-voice-timer" role="timer" aria-live="off">{formatTime(snapshot.capturedSeconds)} / 15:00</span>
      {mode === "recording" ? <button type="button" onClick={pauseButton}>Pause</button> : mode === "paused" ? <button type="button" disabled={props.disabled || snapshot.pendingAudioSeconds >= 90} onClick={() => void beginCapture(true)}>Resume</button> : null}
      <button type="button" disabled={mode === "stopping"} onClick={() => void finishAndReview()}>Stop and review</button>
      <button type="button" className="coach-voice-discard-button" onClick={discard}>Cancel</button>
    </div> : null}
    {mode === "recording" && snapshot.capturedSeconds >= 840 ? <p className="coach-voice-error" role="status">One minute remains before recording stops automatically.</p> : null}
    {snapshot.sectionCount > 0 && mode !== "review" ? <section className="coach-progressive-live" aria-label="Live dictation transcript">
      <div><strong>Dictation transcript</strong><span>{progressLabel} · {snapshot.pendingAudioSeconds.toFixed(1)} seconds waiting to upload</span></div>
      {snapshot.transcript ? <p aria-live="polite">{snapshot.transcript}</p> : <p className="coach-progressive-placeholder">Your recognized text will appear here. Your typed draft stays unchanged.</p>}
      <SectionList sections={snapshot.sections} retry={handleRetry} acknowledge={(order) => controllerRef.current?.acknowledgeGap(order)} />
    </section> : null}
    {mode === "review" ? <section className="coach-progressive-review" aria-labelledby="coach-progressive-review-title">
      <h3 id="coach-progressive-review-title">Review dictation</h3>
      <p>Correct the transcript and resolve every missing section before adding it. The transcript remains separate from your typed draft until you choose an action.</p>
      <SectionList sections={snapshot.sections} retry={handleRetry} canCorrect={reviewEdited} acknowledge={(order, corrected) => controllerRef.current?.acknowledgeGap(order, corrected)} />
      <label htmlFor="coach-dictation-review-text">Editable transcript</label>
      <textarea id="coach-dictation-review-text" rows={7} readOnly={retryBusy} aria-busy={retryBusy} value={reviewText} onChange={(event) => { setReviewText(event.target.value); setReviewEdited(true); }} />
      {recoveredSections.map((order) => <div key={order} className="coach-progressive-replace-confirm" role="group" aria-label={`Recovered section ${order + 1}`}>
        <p>A retry recovered section {order + 1} after your edits. Include these words in the editable transcript, then confirm: <strong>{snapshot.sections.find((section) => section.order === order)?.text}</strong></p>
        <button type="button" onClick={() => setRecoveredSections((current) => current.filter((item) => item !== order))}>Confirm included in review</button>
      </div>)}
      <div className="coach-progressive-review-count" aria-live="polite">{reviewText.length.toLocaleString()} / 30,000 characters</div>
      {reviewText.length > COACH_CHAT_MAX_MESSAGE_CHARS ? <p className="coach-voice-error" role="alert">This transcript exceeds the message limit. Edit it here; no text will be truncated.</p> : null}
      {unresolved.length ? <p className="coach-voice-error" role="alert">Retry, correct in the editable transcript, or acknowledge each missing section before adding this transcript.</p> : null}
      {snapshot.error ? <p className="coach-voice-error" role="status">{snapshot.error}</p> : null}
      {replaceConfirm && props.draft ? <div className="coach-progressive-replace-confirm" role="group" aria-label="Confirm draft replacement"><span>Replace the existing typed draft?</span><button type="button" disabled={!canInsert} onClick={() => void handleInsert("replace")}>Confirm replace</button><button type="button" onClick={() => setReplaceConfirm(false)}>Keep draft</button></div> : null}
      <div className="coach-progressive-review-actions">
        <button type="button" disabled={!canInsert} onClick={() => void handleInsert("append")}>Add to draft</button>
        {props.draft ? <button type="button" disabled={!canInsert} onClick={() => setReplaceConfirm(true)}>Replace draft</button> : null}
        <button type="button" className="coach-voice-discard-button" onClick={discard}>Discard dictation</button>
      </div>
      <p className="coach-progressive-send-note">Only Send message sends this as one coaching turn.</p>
    </section> : null}
    {disclosureOpen ? <div className="coach-voice-disclosure" role="group" aria-labelledby="coach-progressive-disclosure-title">
      <strong id="coach-progressive-disclosure-title">Voice data and microphone access</strong>
      <p>Dictation sends short audio sections to OpenAI for transcription. Recognized text appears here and is not added to your draft until you choose Add to draft or Replace draft. Audio and uninserted text are not stored by RacePredictor. Refreshing or closing this page loses dictation you have not added to your draft. Keep Coach visible; hiding or locking your phone stops recording and discards audio waiting to upload. OpenAI’s data controls and retention information are <a href={props.providerDataControlsUrl} target="_blank" rel="noreferrer">available here</a>.</p>
      <div><button type="button" onClick={() => { try { sessionStorage.setItem(`${DISCLOSURE_PREFIX}progressive.${props.disclosureVersion}`, "accepted"); } catch { /* session storage is optional */ } setDisclosureAccepted(true); void beginCapture(false); }}>Continue to microphone permission</button><button type="button" onClick={() => setDisclosureOpen(false)}>Not now</button></div>
    </div> : null}
    {error ? <p className="coach-voice-error" role="alert">{error}</p> : null}
    {props.footer}
    <p className="coach-voice-budget">${(props.remainingAllowanceMicroUsd / 1_000_000).toFixed(2)} of ${(props.monthlyAllowanceMicroUsd / 1_000_000).toFixed(2)} voice allowance remaining · resets {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(props.resetsAt))}</p>
  </div>;
}

function SectionList({ sections, retry, acknowledge, canCorrect = false }: { sections: ProgressiveSection[]; retry(section: ProgressiveSection): void; acknowledge(order: number, corrected?: boolean): void; canCorrect?: boolean }) {
  if (!sections.length) return null;
  return <ul className="coach-progressive-section-list">{sections.map((section) => <li key={section.order} data-state={section.state}>
    <span>Section {section.order + 1} · {formatTime(section.capturedStartSeconds)}–{formatTime(section.capturedEndSeconds)} · {section.state === "complete" ? "Transcribed" : section.state === "transcribing" ? "Transcribing" : section.state === "pending" ? "Waiting" : section.state === "omitted" ? section.error.startsWith("Corrected") ? "Correction confirmed" : "Omission acknowledged" : "Missing audio or transcript"}</span>
    {section.error ? <span className="coach-progressive-section-error">{section.error}</span> : null}
    {section.retryAvailable ? <><span className="coach-progressive-section-error">A lost response may already have used voice allowance. Retrying can use allowance again.</span><button type="button" onClick={() => retry(section)}>Retry chunk</button></> : null}
    {section.state === "failed" || section.state === "expired" ? <button type="button" onClick={() => acknowledge(section.order)}>Acknowledge omission</button> : null}
    {canCorrect && (section.state === "failed" || section.state === "expired") ? <button type="button" onClick={() => acknowledge(section.order, true)}>I corrected this section</button> : null}
  </li>)}</ul>;
}

function formatTime(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
