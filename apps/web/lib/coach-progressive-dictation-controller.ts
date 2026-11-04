import {
  coachProgressiveChunkResponseSchema,
  coachProgressiveSessionResponseSchema,
  COACH_PROGRESSIVE_MAX_CHUNKS,
  COACH_PROGRESSIVE_MAX_DURATION_SECONDS,
} from "../../../packages/core/src/contracts/coach-voice.ts";
import type { CoachContext } from "../../../packages/core/src/contracts/coach-chat.ts";
import { encodeProgressiveCoachVoiceWav } from "../../../packages/core/src/services/coach-voice-audio.ts";

export const PROGRESSIVE_SAMPLE_RATE = 16_000;
export const PROGRESSIVE_MAX_PENDING_SECONDS = 90;
export const PROGRESSIVE_AUDIO_TTL_MS = 180_000;
export const PROGRESSIVE_CHUNK_MIN_SECONDS = 15;
export const PROGRESSIVE_CHUNK_MAX_SECONDS = 30;
export const PROGRESSIVE_OVERLAP_SECONDS = 1;
export const PROGRESSIVE_HEARTBEAT_MS = 30_000;
export const PROGRESSIVE_REQUEST_TIMEOUT_MS = 90_000;

export type ProgressiveCaptureContext = { context: CoachContext; generation: number; sequence: number };
export type ProgressiveWord = { text: string; startSeconds: number; endSeconds: number };
export type ProgressiveSectionState = "pending" | "transcribing" | "complete" | "failed" | "expired" | "omitted";
export type ProgressiveSection = {
  order: number;
  chunkIndex: number | null;
  state: ProgressiveSectionState;
  text: string;
  words: ProgressiveWord[];
  capturedStartSeconds: number;
  capturedEndSeconds: number;
  error: string;
  retryCount: number;
  retryAvailable: boolean;
};
type AudioSection = ProgressiveSection & { audio: Uint8Array | null; firstCapturedAt: number; retryOrdinal: 0 | 1; overlapSeconds: number };
export type ProgressiveControllerSnapshot = {
  capturedSeconds: number;
  sectionCount: number;
  completedCount: number;
  failedCount: number;
  pendingAudioSeconds: number;
  sessionId: string | null;
  pausedForQueue: boolean;
  error: string;
  transcript: string;
  sections: ProgressiveSection[];
};

export type ProgressiveControllerDependencies = {
  fetchImpl?: typeof fetch;
  onChange?(snapshot: ProgressiveControllerSnapshot): void;
  onPauseRequired?(reason: "queue_full" | "transcription_failed" | "session_expired" | "connection_interrupted"): void;
  onDurationLimit?(): void;
  now?(): number;
  newId?(): string;
};

/** Owns bounded audio assembly, ordered chunk admission, one-flight uploads and in-page retries. */
export class CoachProgressiveDictationController {
  #fetch: typeof fetch;
  #onChange: NonNullable<ProgressiveControllerDependencies["onChange"]>;
  #onPauseRequired: NonNullable<ProgressiveControllerDependencies["onPauseRequired"]>;
  #onDurationLimit: NonNullable<ProgressiveControllerDependencies["onDurationLimit"]>;
  #now: () => number;
  #newId: () => string;
  #sessionId: string | null = null;
  #controller: AbortController | null = null;
  #inFlight: AudioSection | null = null;
  #queue: AudioSection[] = [];
  #sections: AudioSection[] = [];
  #activeSamples: Int16Array[] = [];
  #activeSampleCount = 0;
  #activeOverlap = new Int16Array(0);
  #activeStartSample = 0;
  #activeFirstCapturedAt = 0;
  #tail = new Int16Array(0);
  #silenceSamples = 0;
  #totalSamples = 0;
  #nextChunkIndex = 0;
  #nextOrder = 0;
  #inFlightPromise: Promise<void> | null = null;
  #closed = false;
  #stopped = false;
  #pausedForFailure = false;
  #pausedForQueue = false;
  #isRecording = true;
  #error = "";
  #audioExpiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dependencies: ProgressiveControllerDependencies = {}) {
    this.#fetch = dependencies.fetchImpl ?? fetch.bind(globalThis);
    this.#onChange = dependencies.onChange ?? (() => undefined);
    this.#onPauseRequired = dependencies.onPauseRequired ?? (() => undefined);
    this.#onDurationLimit = dependencies.onDurationLimit ?? (() => undefined);
    this.#now = dependencies.now ?? Date.now;
    this.#newId = dependencies.newId ?? (() => crypto.randomUUID());
  }

  async startSession(snapshot: ProgressiveCaptureContext) {
    if (this.#sessionId || this.#closed) throw new Error("This dictation session has already started.");
    const response = await this.#fetch("/api/v1/coaching/voice/dictation-sessions", {
      method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedGeneration: snapshot.generation, expectedSequence: snapshot.sequence, topic: snapshot.context.selectedTopic, selectedRecord: snapshot.context.selectedRecord, contextFingerprint: snapshot.context.fingerprint }),
    });
    const payload = await readJson(response);
    if (!response.ok) throw apiMessage(payload, "The dictation session could not start.");
    const parsed = coachProgressiveSessionResponseSchema.safeParse(payload?.data);
    if (!parsed.success) throw new Error("The server returned invalid dictation session details.");
    if (this.#closed) {
      await this.#fetch(`/api/v1/coaching/voice/dictation-sessions/${encodeURIComponent(parsed.data.sessionId)}/close`, {
        method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true,
        headers: { "content-type": "application/json" }, body: JSON.stringify({ cancel: true }),
      }).catch(() => undefined);
      throw new Error("Dictation was cancelled while the session was starting.");
    }
    this.#sessionId = parsed.data.sessionId;
    this.#emit();
    return parsed.data;
  }

  /** Called with transferred 16 kHz PCM samples from the AudioWorklet. */
  pushFrame(frame: Int16Array, now = this.#now()) {
    if (this.#closed || this.#stopped || !this.#sessionId || !frame.length) { frame.fill(0); return; }
    if (!this.#isRecording) {
      const start = this.#totalSamples / PROGRESSIVE_SAMPLE_RATE;
      this.#totalSamples = Math.min(COACH_PROGRESSIVE_MAX_DURATION_SECONDS * PROGRESSIVE_SAMPLE_RATE, this.#totalSamples + frame.length);
      this.#addGap(start, this.#totalSamples / PROGRESSIVE_SAMPLE_RATE, this.#pausedForFailure ? "Audio was not retained after transcription paused." : "Audio was not retained while dictation was paused.");
      frame.fill(0); this.#emit(); return;
    }
    const maxSamples = COACH_PROGRESSIVE_MAX_DURATION_SECONDS * PROGRESSIVE_SAMPLE_RATE;
    let frameOffset = 0;
    while (frameOffset < frame.length && !this.#pausedForQueue && this.#totalSamples < maxSamples) {
      const pendingRoom = Math.max(0, PROGRESSIVE_MAX_PENDING_SECONDS * PROGRESSIVE_SAMPLE_RATE - this.#pendingSamples());
      const durationRoom = maxSamples - this.#totalSamples;
      const chunkRoom = PROGRESSIVE_CHUNK_MAX_SECONDS * PROGRESSIVE_SAMPLE_RATE - this.#activeSampleCount;
      // Reserve boundary context before accepting new capture. Otherwise the
      // next chunk's one-second overlap can push retained audio over the cap.
      const overlapRoom = this.#activeSampleCount === 0 ? this.#tail.length : 0;
      const accepted = Math.min(frame.length - frameOffset, Math.max(0, pendingRoom - overlapRoom), durationRoom, chunkRoom);
      if (accepted <= 0) { this.#requirePause("queue_full"); break; }
      const part = frame.subarray(frameOffset, frameOffset + accepted).slice();
      if (this.#activeSampleCount === 0) {
        this.#activeStartSample = this.#totalSamples;
        this.#activeOverlap = this.#tail.slice();
        this.#activeFirstCapturedAt = now - (frame.length - frameOffset + this.#activeOverlap.length) / PROGRESSIVE_SAMPLE_RATE * 1_000;
      }
      this.#activeSamples.push(part);
      this.#activeSampleCount += part.length;
      this.#totalSamples += part.length;
      this.#appendTail(part);
      frameOffset += accepted;

      const silent = rms(part) < 0.012;
      this.#silenceSamples = silent ? this.#silenceSamples + part.length : 0;
      const activeSeconds = this.#activeSampleCount / PROGRESSIVE_SAMPLE_RATE;
      if (activeSeconds >= PROGRESSIVE_CHUNK_MAX_SECONDS) this.#enqueueActive();
      else if (activeSeconds >= PROGRESSIVE_CHUNK_MIN_SECONDS && this.#silenceSamples >= PROGRESSIVE_SAMPLE_RATE) this.#enqueueActive();

      if (this.#pendingSamples() >= (PROGRESSIVE_MAX_PENDING_SECONDS - PROGRESSIVE_OVERLAP_SECONDS) * PROGRESSIVE_SAMPLE_RATE) this.#requirePause("queue_full");
      if (this.#totalSamples >= maxSamples) { this.#enqueueActive(); this.#stopped = true; this.#onDurationLimit(); }
    }
    if (frameOffset < frame.length) {
      if (!this.#stopped) {
        const start = this.#totalSamples / PROGRESSIVE_SAMPLE_RATE;
        this.#totalSamples = Math.min(maxSamples, this.#totalSamples + frame.length - frameOffset);
        if (this.#totalSamples > start) this.#addGap(start, this.#totalSamples / PROGRESSIVE_SAMPLE_RATE, "Audio was not retained when the pending-audio limit was reached.");
      }
    }
    frame.fill(0);
    this.#pump();
    this.#expireAudio(now);
    this.#emit();
  }

  pauseCapture() {
    if (this.#closed || this.#stopped) return;
    this.#isRecording = false;
    this.#enqueueActive();
    this.#tail.fill(0); this.#tail = new Int16Array(0);
    this.#pump(); this.#emit();
  }

  resumeCapture() {
    if (this.#closed || this.#stopped || this.#pausedForFailure) return false;
    if (this.#pendingSamples() >= PROGRESSIVE_MAX_PENDING_SECONDS * PROGRESSIVE_SAMPLE_RATE) return false;
    this.#pausedForQueue = false;
    this.#isRecording = true;
    this.#emit(); return true;
  }

  async stopCapture() {
    this.#isRecording = false; this.#stopped = true;
    this.#enqueueActive(); this.#pump();
    this.#tail.fill(0); this.#tail = new Int16Array(0);
    await this.settle();
    this.#emit();
  }

  async settle() {
    this.#pump();
    while (this.#inFlightPromise || (this.#queue.length && !this.#pausedForFailure && !this.#closed)) {
      if (this.#inFlightPromise) await this.#inFlightPromise;
      else { this.#pump(); await Promise.resolve(); }
    }
  }

  async retry(order: number) {
    const section = this.#sections.find((candidate) => candidate.order === order);
    if (!section || section.state !== "failed" || !section.audio || section.retryCount >= 1 || this.#closed) return false;
    if (this.#now() - section.firstCapturedAt > PROGRESSIVE_AUDIO_TTL_MS) { this.#expireSection(section); this.#emit(); return false; }
    section.retryCount = 1; section.retryOrdinal = 1; section.state = "pending"; section.error = "";
    this.#pausedForFailure = false; this.#error = "";
    this.#queue.unshift(section); this.#pump(); this.#emit();
    await this.settle();
    return this.snapshot().sections.find((candidate) => candidate.order === order)?.state === "complete";
  }

  acknowledgeGap(order: number, corrected = false) {
    const section = this.#sections.find((candidate) => candidate.order === order);
    if (!section || !["failed", "expired"].includes(section.state)) return false;
    this.#disposeSectionAudio(section); section.state = "omitted"; section.error = corrected ? "Corrected in review by athlete" : "Omitted by athlete";
    if (this.#pausedForFailure) { this.#pausedForFailure = false; this.#error = ""; this.#pump(); }
    this.#emit(); return true;
  }

  expireAudio(now = this.#now()) { this.#expireAudio(now); this.#emit(); }

  async close(cancel = false, keepalive = false) {
    if (this.#closed) return;
    this.#closed = true; this.#isRecording = false; this.#stopped = true;
    if (cancel || this.#pendingSamples()) this.#discardUnfinished(cancel ? "Dictation cancelled." : "Dictation was closed.");
    this.#tail.fill(0); this.#tail = new Int16Array(0);
    if (this.#audioExpiryTimer) clearTimeout(this.#audioExpiryTimer);
    this.#audioExpiryTimer = null;
    const sessionId = this.#sessionId;
    this.#controller?.abort(); this.#controller = null;
    if (!sessionId) return;
    try {
      await this.#fetch(`/api/v1/coaching/voice/dictation-sessions/${encodeURIComponent(sessionId)}/close`, {
        method: "POST", cache: "no-store", credentials: "same-origin", keepalive,
        headers: { "content-type": "application/json" }, body: JSON.stringify({ cancel }),
      });
    } catch { /* server expiry settles an unreachable close */ }
    this.#sessionId = null; this.#emit();
  }

  async heartbeat() {
    if (!this.#sessionId || this.#closed) return true;
    let invalidated = false;
    try {
      const response = await this.#fetch(`/api/v1/coaching/voice/dictation-sessions/${encodeURIComponent(this.#sessionId)}/heartbeat`, { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) {
        invalidated = [401, 403, 404, 409].includes(response.status);
        throw apiMessage(await readJson(response), "The dictation connection was interrupted.");
      }
      return true;
    } catch {
      if (this.#closed) return false;
      if (!invalidated) {
        this.#isRecording = false;
        this.#error = "Connection interrupted. Dictation paused; eligible audio is still available for an explicit retry.";
        this.#onPauseRequired("connection_interrupted"); this.#emit(); return false;
      }
      this.#closed = true; this.#stopped = true; this.#isRecording = false; this.#abortInFlight(); this.#discardUnfinished("This dictation session expired. Review recognized text and acknowledge any missing sections.");
      void this.closeSessionAfterSuspension();
      this.#onPauseRequired("session_expired"); this.#emit(); return false;
    }
  }

  async suspendForVisibility() {
    this.#isRecording = false; this.#stopped = true; this.#closed = true;
    this.#abortInFlight(); this.#discardUnfinished("Audio was discarded when Coach went into the background.");
    void this.closeSessionAfterSuspension();
    this.#emit();
  }

  dispose() {
    if (!this.#closed) void this.close(true, true);
    this.#abortInFlight(); this.#zeroAudio(); this.#sessionId = null;
  }

  snapshot(): ProgressiveControllerSnapshot {
    const sections = this.#sections.map(({ order, chunkIndex, state, text, words, capturedStartSeconds, capturedEndSeconds, error, retryCount, audio }) => ({ order, chunkIndex, state, text, words, capturedStartSeconds, capturedEndSeconds, error, retryCount, retryAvailable: state === "failed" && Boolean(audio) && retryCount < 1 }));
    const completed = sections.filter((section) => section.state === "complete").sort((a, b) => a.order - b.order);
    return {
      capturedSeconds: this.#totalSamples / PROGRESSIVE_SAMPLE_RATE,
      sectionCount: sections.length, completedCount: completed.length,
      failedCount: sections.filter((section) => section.state === "failed" || section.state === "expired").length,
      pendingAudioSeconds: this.#pendingSamples() / PROGRESSIVE_SAMPLE_RATE,
      sessionId: this.#sessionId, pausedForQueue: this.#pausedForQueue, error: this.#error,
      transcript: joinSections(completed.map((section) => section.text)), sections,
    };
  }

  #enqueueActive() {
    if (!this.#activeSampleCount) return;
    const samples = new Int16Array(this.#activeSampleCount + this.#activeOverlap.length);
    samples.set(this.#activeOverlap);
    let offset = this.#activeOverlap.length;
    for (const frame of this.#activeSamples) { samples.set(frame, offset); frame.fill(0); offset += frame.length; }
    const silent = samples.every((sample) => sample === 0);
    const audio = silent ? null : encodeProgressiveCoachVoiceWav(samples); samples.fill(0);
    const capturedStartSeconds = this.#activeStartSample / PROGRESSIVE_SAMPLE_RATE;
    const capturedEndSeconds = this.#totalSamples / PROGRESSIVE_SAMPLE_RATE;
    const order = this.#nextOrder++;
    const section: AudioSection = {
      order, chunkIndex: silent ? null : this.#nextChunkIndex++, state: silent ? "complete" : "pending", text: "", words: [], capturedStartSeconds, capturedEndSeconds, error: "", retryCount: 0, retryAvailable: false,
      audio, firstCapturedAt: this.#activeFirstCapturedAt, retryOrdinal: 0, overlapSeconds: this.#activeOverlap.length / PROGRESSIVE_SAMPLE_RATE,
    };
    this.#sections.push(section); if (!silent) this.#queue.push(section);
    this.#activeSamples.forEach((frame) => frame.fill(0));
    this.#activeSamples = []; this.#activeSampleCount = 0; this.#activeOverlap.fill(0); this.#activeOverlap = new Int16Array(0); this.#silenceSamples = 0;
    if (this.#nextChunkIndex >= COACH_PROGRESSIVE_MAX_CHUNKS) {
      this.#error = "The dictation session reached its section limit. Review your recognized text before starting another session.";
      this.#stopped = true; this.#onDurationLimit();
    }
  }

  #addGap(start: number, end: number, reason: string) {
    if (end <= start) return;
    const previous = this.#sections.at(-1);
    if (previous && previous.chunkIndex === null && previous.state === "expired" && Math.abs(previous.capturedEndSeconds - start) < 0.01) {
      previous.capturedEndSeconds = end; previous.error = reason; return;
    }
    this.#sections.push({ order: this.#nextOrder++, chunkIndex: null, state: "expired", text: "", words: [], capturedStartSeconds: start, capturedEndSeconds: end, error: reason, retryCount: 0, retryAvailable: false, audio: null, firstCapturedAt: this.#now(), retryOrdinal: 0, overlapSeconds: 0 });
  }

  #appendTail(samples: Int16Array) {
    const length = Math.min(PROGRESSIVE_SAMPLE_RATE, this.#tail.length + samples.length);
    const next = new Int16Array(length);
    if (samples.length >= length) next.set(samples.subarray(samples.length - length));
    else { next.set(this.#tail.subarray(Math.max(0, this.#tail.length - (length - samples.length)))); next.set(samples, length - samples.length); }
    this.#tail.fill(0); this.#tail = next;
  }

  #pendingSamples() {
    const retained = this.#sections.reduce((sum, section) => sum + audioSamples(section.audio), 0);
    return retained + this.#activeSampleCount + this.#activeOverlap.length;
  }

  #requirePause(reason: "queue_full" | "transcription_failed") {
    if (this.#pausedForQueue || this.#pausedForFailure) return;
    this.#pausedForQueue = true; this.#isRecording = false;
    this.#onPauseRequired(reason); this.#emit();
  }

  #pump() {
    if (this.#inFlight || this.#pausedForFailure || this.#closed || !this.#sessionId) return;
    const next = this.#queue.find((section) => section.state === "pending" && section.audio);
    if (!next) return;
    this.#queue = this.#queue.filter((section) => section !== next);
    this.#inFlight = next; next.state = "transcribing"; this.#emit();
    this.#inFlightPromise = this.#upload(next).finally(() => {
      this.#inFlight = null; this.#inFlightPromise = null; this.#emit();
      if (!this.#pausedForFailure) this.#pump();
    });
  }

  async #upload(section: AudioSection) {
    const audio = section.audio;
    if (!audio || !this.#sessionId) return;
    if (this.#now() - section.firstCapturedAt > PROGRESSIVE_AUDIO_TTL_MS) { this.#expireSection(section); return; }
    const sessionId = this.#sessionId;
    const controller = new AbortController(); this.#controller = controller;
    const timeout = setTimeout(() => controller.abort(), PROGRESSIVE_REQUEST_TIMEOUT_MS);
    try {
      const response = await this.#fetch(`/api/v1/coaching/voice/dictation-sessions/${encodeURIComponent(sessionId)}/chunks`, {
        method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal,
        headers: { "content-type": "audio/wav", "x-orbit-dictation-chunk": JSON.stringify({ attemptId: this.#newId(), chunkIndex: section.chunkIndex, retryOrdinal: section.retryOrdinal, capturedStartSeconds: section.capturedStartSeconds, capturedEndSeconds: section.capturedEndSeconds, overlapSeconds: section.overlapSeconds }) },
        body: audio,
      });
      const payload = await readJson(response);
      if (!response.ok) throw apiMessage(payload, "This audio section could not be transcribed.");
      const parsed = coachProgressiveChunkResponseSchema.safeParse(payload?.data);
      if (!parsed.success || parsed.data.sessionId !== sessionId || parsed.data.chunkIndex !== section.chunkIndex
        || parsed.data.capturedStartSeconds !== section.capturedStartSeconds || parsed.data.capturedEndSeconds !== section.capturedEndSeconds) throw new Error("The server returned an invalid transcript section.");
      if (this.#closed || this.#sessionId !== sessionId || section.state === "expired") return;
      section.text = parsed.data.text; section.words = parsed.data.words; section.state = "complete"; section.error = "";
      this.#disposeSectionAudio(section);
    } catch (cause) {
      if (this.#closed || section.state === "expired") return;
      section.state = "failed"; section.error = cause instanceof Error ? cause.message : "This audio section could not be transcribed.";
      this.#error = "Dictation paused because a section could not be transcribed."; this.#pausedForFailure = true; this.#isRecording = false;
      this.#onPauseRequired("transcription_failed");
    } finally {
      clearTimeout(timeout);
      if (this.#controller === controller) this.#controller = null;
      this.#emit();
    }
  }

  #expireAudio(now: number) {
    for (const section of this.#sections) {
      if (section.audio && now - section.firstCapturedAt >= PROGRESSIVE_AUDIO_TTL_MS) {
        if (section === this.#inFlight) this.#abortInFlight();
        this.#expireSection(section);
      }
    }
    this.#queue = this.#queue.filter((section) => Boolean(section.audio));
  }

  #expireSection(section: AudioSection) {
    this.#disposeSectionAudio(section); section.state = "expired"; section.error = "The temporary audio expired. Correct the transcript or acknowledge this omission.";
  }

  #disposeSectionAudio(section: AudioSection) { section.audio?.fill(0); section.audio = null; }
  #abortInFlight() { this.#controller?.abort(); this.#controller = null; }
  #discardUnfinished(reason: string) {
    if (this.#activeSampleCount) this.#addGap(this.#activeStartSample / PROGRESSIVE_SAMPLE_RATE, this.#totalSamples / PROGRESSIVE_SAMPLE_RATE, reason);
    this.#activeSamples.forEach((frame) => frame.fill(0)); this.#activeSamples = []; this.#activeSampleCount = 0; this.#activeOverlap.fill(0); this.#activeOverlap = new Int16Array(0); this.#tail.fill(0); this.#tail = new Int16Array(0);
    for (const section of this.#sections) if (!["complete", "omitted"].includes(section.state)) { this.#disposeSectionAudio(section); section.state = "expired"; section.error = reason; }
    this.#queue = []; this.#pausedForFailure = true; this.#error = reason;
  }
  #zeroAudio() { this.#discardUnfinished("Dictation was closed."); for (const section of this.#sections) this.#disposeSectionAudio(section); }
  async closeSessionAfterSuspension() {
    const sessionId = this.#sessionId; if (!sessionId) return;
    this.#sessionId = null;
    try { await this.#fetch(`/api/v1/coaching/voice/dictation-sessions/${encodeURIComponent(sessionId)}/close`, { method: "POST", cache: "no-store", credentials: "same-origin", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ cancel: true }) }); }
    catch { /* session lease expiry releases unused budget */ }
  }
  #emit() {
    if (this.#audioExpiryTimer) clearTimeout(this.#audioExpiryTimer);
    this.#audioExpiryTimer = null;
    const deadlines = this.#sections.filter((section) => section.audio).map((section) => section.firstCapturedAt + PROGRESSIVE_AUDIO_TTL_MS);
    if (!this.#closed && deadlines.length) {
      this.#audioExpiryTimer = setTimeout(() => this.expireAudio(), Math.max(1, Math.min(...deadlines) - this.#now()));
    }
    this.#onChange(this.snapshot());
  }
}

function audioSamples(audio: Uint8Array | null) { return audio ? Math.max(0, (audio.byteLength - 44) / 2) : 0; }
function rms(samples: Int16Array) { let energy = 0; for (let index = 0; index < samples.length; index += 1) { const value = samples[index] / 32768; energy += value * value; } return Math.sqrt(energy / Math.max(1, samples.length)); }
function joinSections(sections: string[]) { return sections.map((part) => part.trim()).filter(Boolean).join(" ").replace(/\s+([,.;:!?])/gu, "$1"); }
async function readJson(response: Response): Promise<any> { return response.json().catch(() => ({})); }
function apiMessage(payload: any, fallback: string) { return typeof payload?.error?.message === "string" ? new Error(payload.error.message) : new Error(fallback); }
