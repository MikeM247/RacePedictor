import { createHash } from "node:crypto";
import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import {
  coachVoiceCapabilitiesSchema,
  coachVoiceSpeechRequestSchema,
  coachVoiceTranscriptionMetadataSchema,
  coachVoiceTranscriptionResultSchema,
  COACH_VOICE_MAX_AUDIO_BYTES,
  COACH_VOICE_MONTHLY_ALLOWANCE_MICRO_USD,
} from "../../../../packages/core/src/contracts/coach-voice.ts";
import { inspectCoachVoiceWav } from "../../../../packages/core/src/services/coach-voice-audio.ts";
import {
  CoachVoiceBudgetError,
  CoachVoiceBusyError,
  CoachVoiceConflictError,
  CoachVoiceRateLimitError,
} from "../../../../packages/db/src/cloud/index.js";
import { ApiHttpError, success } from "./api-response.ts";
import { readCloudEnvironment } from "./cloud-environment.ts";
import { getCloudReadComposition } from "./cloud-read-composition.ts";
import { CoachContextRecordNotFoundError, resolveCoachContext } from "./coach-context.ts";
import { createOpenAICoachVoiceProvider, normalizeCoachSpeechText, splitCoachSpeechText, CoachVoiceProviderError, COACH_SPEECH_MODEL, COACH_TRANSCRIPTION_MODEL } from "./coach-voice-provider.ts";
import type { SensitiveRouteContext } from "./route-security.ts";

export { withCoachRoute } from "./coach-chat-handlers.ts";

const DISCLOSURE_VERSION = 1 as const;
const OPENAI_DATA_CONTROLS_URL = "https://platform.openai.com/docs/guides/your-data" as const;
const CLIENT_TRANSCRIPTION_TIMEOUT_MS = 20_000;
const SERVER_TRANSCRIPTION_TIMEOUT_MS = 18_000;
const SPEECH_TIMEOUT_MS = 15_000;
const AUDIO_TTL_MS = 300_000;
const MAX_METADATA_HEADER_CHARS = 4_096;
const MAX_SPEECH_SOURCE_CHARS = 7_200;
const TRANSCRIPTION_RATE_MICRO_USD_PER_STARTED_MINUTE = 10_000;
const SPEECH_RATE_MICRO_USD_PER_MILLION_CHARS = 30_000_000;

let defaultVoiceProvider: ReturnType<typeof createOpenAICoachVoiceProvider> | undefined;
function voiceProvider() { defaultVoiceProvider ??= createOpenAICoachVoiceProvider(); return defaultVoiceProvider; }

export async function handleCoachVoiceCapabilities(security: SensitiveRouteContext) {
  const scope = requireOwnerScope(security);
  const environment = readCloudEnvironment();
  const keyAvailable = Boolean(process.env.OPENAI_API_KEY);
  const dictationEnabled = environment.features.coachUi && environment.features.coachChat && environment.features.coachDictation;
  const playbackEnabled = environment.features.coachUi && environment.features.coachPlayback;
  let remainingAllowanceMicroUsd = Number(COACH_VOICE_MONTHLY_ALLOWANCE_MICRO_USD);
  if ((dictationEnabled || playbackEnabled) && keyAvailable) {
    remainingAllowanceMicroUsd = await getCloudReadComposition().coachVoice.remainingAllowance(scope);
  }
  const resetsAt = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString();
  return success(coachVoiceCapabilitiesSchema.parse({
    dictation: { available: dictationEnabled && keyAvailable, reason: dictationEnabled && keyAvailable ? "available" : !environment.features.coachChat ? "chat_paused" : !environment.features.coachUi || !environment.features.coachDictation ? "disabled" : "provider_unavailable" },
    playback: { available: playbackEnabled && keyAvailable, reason: playbackEnabled && keyAvailable ? "available" : !environment.features.coachUi || !environment.features.coachPlayback ? "disabled" : "provider_unavailable" },
    limits: {
      maxRecordingSeconds: 120, maxAudioBytes: COACH_VOICE_MAX_AUDIO_BYTES, maxDraftChars: 4_000,
      transcriptionTimeoutMs: CLIENT_TRANSCRIPTION_TIMEOUT_MS, speechTimeoutMs: SPEECH_TIMEOUT_MS, transientAudioTtlMs: AUDIO_TTL_MS,
      monthlyAllowanceMicroUsd: Number(COACH_VOICE_MONTHLY_ALLOWANCE_MICRO_USD), remainingAllowanceMicroUsd, resetsAt,
    },
    disclosureVersion: DISCLOSURE_VERSION, providerName: "OpenAI", providerDataControlsUrl: OPENAI_DATA_CONTROLS_URL,
  }));
}

export async function handleCoachVoiceTranscription(security: SensitiveRouteContext, request: Request, compositionOverride?: VoiceComposition) {
  const scope = requireOwnerScope(security);
  assertSameOrigin(request);
  const composition = compositionOverride ?? getCloudReadComposition();
  const env = readCloudEnvironment();
  assertDictationEnabled(env.features, Boolean(process.env.OPENAI_API_KEY));
  const input = parseMetadata(request);
  const audio = await readBoundedBody(request);
  let audioFacts: ReturnType<typeof inspectCoachVoiceWav>;
  try { audioFacts = inspectCoachVoiceWav(audio); }
  catch (error) { audio.fill(0); throw toVoiceApiError(error); }
  if (audioFacts.isDigitalSilence) { audio.fill(0); throw new ApiHttpError(422, "VOICE_NO_SPEECH", "We couldn't hear a message. Record again or type instead."); }

  let attempt: { operationId: string; inputUnits: number; reservedMicroUsd: number } | null = null;
  let completion: { state: "completed" | "failed"; errorCode: string | null } = { state: "failed", errorCode: "VOICE_PROVIDER_UNAVAILABLE" };
  const startedAt = Date.now();
  try {
    await assertCurrentContext(composition, scope, input);
    const reservedMicroUsd = Math.ceil(audioFacts.durationSeconds / 60) * TRANSCRIPTION_RATE_MICRO_USD_PER_STARTED_MINUTE;
    await composition.coachVoice.reserve(scope, { operationId: input.operationId, kind: "transcription", model: COACH_TRANSCRIPTION_MODEL, inputUnits: Math.ceil(audioFacts.durationSeconds), reservedMicroUsd });
    attempt = { operationId: input.operationId, inputUnits: Math.ceil(audioFacts.durationSeconds), reservedMicroUsd };
    const transcript = await withProviderDeadline(request, SERVER_TRANSCRIPTION_TIMEOUT_MS, (signal) => voiceProvider().transcribe(audio, signal));
    await assertCurrentContext(composition, scope, input);
    completion = { state: "completed", errorCode: null };
    const complete = await composition.coachVoice.complete(scope, input.operationId, { state: "completed", latencyMs: Date.now() - startedAt });
    if (!complete) { completion = { state: "failed", errorCode: "VOICE_CONTEXT_CHANGED" }; throw new ApiHttpError(409, "VOICE_CONTEXT_CHANGED", "Training context changed while your recording was being prepared. Record again or type instead."); }
    attempt = null;
    console.info("coach.voice.completed", { operationId: input.operationId, kind: "transcription", inputUnits: Math.ceil(audioFacts.durationSeconds), latencyMs: Date.now() - startedAt });
    return success(coachVoiceTranscriptionResultSchema.parse({ operationId: input.operationId, generation: input.expectedGeneration, sequence: input.expectedSequence, contextFingerprint: input.contextFingerprint, transcript }));
  } catch (error) {
    completion = { state: "failed", errorCode: voiceFailureCode(error) };
    throw toVoiceApiError(error);
  } finally {
    audio.fill(0);
    if (attempt) await completeBestEffort(composition, scope, input.operationId, { state: "failed", latencyMs: Date.now() - startedAt, safeErrorCode: completion.errorCode }).catch(() => undefined);
  }
}

export async function handleCoachVoiceSpeech(security: SensitiveRouteContext, request: Request, compositionOverride?: VoiceComposition) {
  const scope = requireOwnerScope(security);
  assertSameOrigin(request);
  const env = readCloudEnvironment();
  assertPlaybackEnabled(env.features, Boolean(process.env.OPENAI_API_KEY));
  const parsed = coachVoiceSpeechRequestSchema.safeParse(await boundedJson(request));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "The playback request is invalid");
  const composition = compositionOverride ?? getCloudReadComposition();
  const input = parsed.data;
  const message = await composition.coachChat.getCurrentAssistantMessage(scope, input.expectedGeneration, input.messageId);
  if (!message) throw new ApiHttpError(409, "VOICE_CONTEXT_CHANGED", "That reply is no longer available in this conversation.");
  const chunks = splitCoachSpeechText(message.text);
  if (normalizeCoachSpeechText(message.text).length > MAX_SPEECH_SOURCE_CHARS || chunks.length > 6) {
    throw new ApiHttpError(422, "VOICE_REPLY_TOO_LONG", "This reply is too long to play. You can still read it here.");
  }
  const text = chunks[input.chunkIndex];
  if (!text || input.chunkIndex >= chunks.length) throw new ApiHttpError(400, "VALIDATION_ERROR", "That spoken reply segment is invalid");
  const amount = Math.ceil(text.length * SPEECH_RATE_MICRO_USD_PER_MILLION_CHARS / 1_000_000);
  const startedAt = Date.now();
  let reserved = false;
  try {
    await composition.coachVoice.reserve(scope, { operationId: input.operationId, kind: "speech", model: COACH_SPEECH_MODEL, inputUnits: text.length, reservedMicroUsd: Math.max(1, amount) });
    reserved = true;
    const audio = await withProviderDeadline(request, SPEECH_TIMEOUT_MS, (signal) => voiceProvider().synthesize(text, signal));
    const current = await composition.coachChat.getCurrentAssistantMessage(scope, input.expectedGeneration, input.messageId);
    if (!current || current.text !== message.text) { audio.fill(0); throw new ApiHttpError(409, "VOICE_CONTEXT_CHANGED", "That reply is no longer available in this conversation."); }
    const complete = await composition.coachVoice.complete(scope, input.operationId, { state: "completed", latencyMs: Date.now() - startedAt });
    if (!complete) { audio.fill(0); throw new ApiHttpError(409, "VOICE_CONTEXT_CHANGED", "Playback expired. Choose Listen to reply again."); }
    reserved = false;
    console.info("coach.voice.completed", { operationId: input.operationId, kind: "speech", inputUnits: text.length, latencyMs: Date.now() - startedAt });
    const responseAudio = new Uint8Array(audio);
    audio.fill(0);
    return new Response(responseAudio, { headers: {
      "content-type": "audio/mpeg", "content-length": String(audio.byteLength),
      "cache-control": "private, no-store, max-age=0", pragma: "no-cache", expires: "0", "x-content-type-options": "nosniff",
      "x-orbit-playback-id": input.playbackId, "x-orbit-operation-id": input.operationId,
      "x-orbit-chunk-index": String(input.chunkIndex), "x-orbit-chunk-count": String(chunks.length),
    } });
  } catch (error) {
    throw toVoiceApiError(error);
  } finally {
    if (reserved) await completeBestEffort(composition, scope, input.operationId, { state: "failed", latencyMs: Date.now() - startedAt, safeErrorCode: "VOICE_PROVIDER_UNAVAILABLE" }).catch(() => undefined);
  }
}

type VoiceComposition = ReturnType<typeof getCloudReadComposition>;
function parseMetadata(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "audio/wav") throw new ApiHttpError(415, "VOICE_INVALID_AUDIO", "This browser recording format is not supported.");
  const raw = request.headers.get("x-orbit-voice");
  if (!raw || raw.length > MAX_METADATA_HEADER_CHARS) throw new ApiHttpError(400, "VALIDATION_ERROR", "The recording request is invalid");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "The recording request is invalid"); }
  const parsed = coachVoiceTranscriptionMetadataSchema.safeParse(value);
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "The recording request is invalid");
  return parsed.data;
}

async function boundedJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new ApiHttpError(415, "VALIDATION_ERROR", "The playback request must be JSON");
  const header = Number(request.headers.get("content-length"));
  if (Number.isFinite(header) && header > MAX_METADATA_HEADER_CHARS) throw new ApiHttpError(413, "VALIDATION_ERROR", "The playback request is too large");
  const text = await request.text();
  if (text.length > MAX_METADATA_HEADER_CHARS) throw new ApiHttpError(413, "VALIDATION_ERROR", "The playback request is too large");
  try { return JSON.parse(text) as unknown; } catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "The playback request is invalid"); }
}

async function readBoundedBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > COACH_VOICE_MAX_AUDIO_BYTES)) throw new ApiHttpError(413, "VOICE_INVALID_AUDIO", "That recording is too large. Keep recordings under two minutes.");
  if (!request.body) throw new ApiHttpError(400, "VOICE_INVALID_AUDIO", "No recording was received. Record again or type instead.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > COACH_VOICE_MAX_AUDIO_BYTES) {
        await reader.cancel();
        for (const part of chunks) part.fill(0);
        value.fill(0);
        throw new ApiHttpError(413, "VOICE_INVALID_AUDIO", "That recording is too large. Keep recordings under two minutes.");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); chunk.fill(0); offset += chunk.byteLength; }
    return body;
  } catch (error) {
    for (const chunk of chunks) chunk.fill(0);
    throw error;
  } finally { reader.releaseLock(); }
}

async function assertCurrentContext(composition: VoiceComposition, scope: ReturnType<typeof athleteScopeFor>, input: ReturnType<typeof coachVoiceTranscriptionMetadataSchema.parse>) {
  const context = await resolveCoachContext(composition, scope, { topic: input.topic, selectedRecord: input.selectedRecord, canSend: true });
  const marker = await composition.coachChat.getConversationMarker(scope);
  if (context.fingerprint !== input.contextFingerprint || marker.generation !== input.expectedGeneration || marker.sequence !== input.expectedSequence
    || context.selectedTopic !== input.topic || JSON.stringify(context.selectedRecord) !== JSON.stringify(input.selectedRecord)) {
    throw new ApiHttpError(409, "VOICE_CONTEXT_CHANGED", "Training context changed. Review it before recording a new message.");
  }
}

async function withProviderDeadline<T>(request: Request, timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const onRequestAbort = () => controller.abort();
  if (request.signal.aborted) controller.abort();
  else request.signal.addEventListener("abort", onRequestAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (request.signal.aborted) throw new ApiHttpError(409, "VOICE_REQUEST_CANCELLED", "Recording cancelled. Your typed draft is still here.");
    if (timedOut || error instanceof CoachVoiceProviderError && error.safeCode === "VOICE_PROVIDER_TIMEOUT") throw new ApiHttpError(504, "VOICE_PROVIDER_TIMEOUT", "Voice processing took too long. Record again or type instead.");
    throw error;
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onRequestAbort);
  }
}

function assertDictationEnabled(features: ReturnType<typeof readCloudEnvironment>["features"], keyAvailable: boolean) {
  if (!features.coachUi || !features.coachChat || !features.coachDictation) throw new ApiHttpError(503, "VOICE_UNAVAILABLE", "Voice dictation is not available right now. You can still type to ORBIT.");
  if (!keyAvailable) throw new ApiHttpError(503, "VOICE_PROVIDER_NOT_CONFIGURED", "Voice dictation is not configured yet. You can still type to ORBIT.");
}
function assertPlaybackEnabled(features: ReturnType<typeof readCloudEnvironment>["features"], keyAvailable: boolean) {
  if (!features.coachUi || !features.coachPlayback) throw new ApiHttpError(503, "VOICE_UNAVAILABLE", "Reply playback is not available right now.");
  if (!keyAvailable) throw new ApiHttpError(503, "VOICE_PROVIDER_NOT_CONFIGURED", "Reply playback is not configured yet.");
}
function requireOwnerScope(security: SensitiveRouteContext) {
  if (security.mode !== "authenticated") throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Coach is available only on the authenticated online site");
  if (security.actor.credentialKind !== "session") throw new ApiHttpError(403, "FORBIDDEN", "A signed-in owner session is required");
  return athleteScopeFor(security.actor);
}
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let provided = origin;
  if (!provided && referer) { try { provided = new URL(referer).origin; } catch { provided = null; } }
  if (!provided || provided !== new URL(request.url).origin) throw new ApiHttpError(403, "FORBIDDEN", "A same-origin request is required");
}
async function completeBestEffort(composition: VoiceComposition, scope: ReturnType<typeof athleteScopeFor>, operationId: string, input: Parameters<VoiceComposition["coachVoice"]["complete"]>[2]) {
  await composition.coachVoice.complete(scope, operationId, input);
}

function voiceFailureCode(error: unknown) {
  if (error instanceof ApiHttpError) return error.code;
  if (error instanceof CoachContextRecordNotFoundError) return "VOICE_CONTEXT_CHANGED";
  if (error instanceof CoachVoiceBudgetError) return "VOICE_BUDGET_EXHAUSTED";
  if (error instanceof CoachVoiceRateLimitError) return "VOICE_RATE_LIMITED";
  if (error instanceof CoachVoiceBusyError) return "VOICE_OPERATION_BUSY";
  if (error instanceof CoachVoiceConflictError) return "VOICE_OPERATION_CONFLICT";
  if (error instanceof CoachVoiceProviderError) return error.safeCode;
  return "VOICE_PROVIDER_UNAVAILABLE";
}
function toVoiceApiError(error: unknown): ApiHttpError {
  if (error instanceof ApiHttpError) return error;
  if (error instanceof CoachContextRecordNotFoundError) return new ApiHttpError(409, "VOICE_CONTEXT_CHANGED", "That training record is no longer available. Review your context before recording again.");
  if (error instanceof CoachVoiceBudgetError) return new ApiHttpError(429, "VOICE_BUDGET_EXHAUSTED", error.message, [], { "retry-after": String(Math.ceil((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1) - Date.now()) / 1_000)) });
  if (error instanceof CoachVoiceRateLimitError) return new ApiHttpError(429, "VOICE_RATE_LIMITED", error.message, [], { "retry-after": String(error.retryAfterSeconds) });
  if (error instanceof CoachVoiceBusyError) return new ApiHttpError(409, "VOICE_OPERATION_BUSY", error.message);
  if (error instanceof CoachVoiceConflictError) return new ApiHttpError(409, "VOICE_OPERATION_CONFLICT", error.message);
  if (error instanceof CoachVoiceProviderError) {
    const code = error.safeCode;
    if (code === "VOICE_PROVIDER_NOT_CONFIGURED") return new ApiHttpError(503, code, "Voice processing is not configured yet.");
    if (code === "VOICE_PROVIDER_TIMEOUT") return new ApiHttpError(504, code, "Voice processing took too long. Record again or type instead.");
    if (code === "VOICE_NO_SPEECH") return new ApiHttpError(422, code, "We couldn't hear a message. Record again or type instead.");
    if (code === "VOICE_TRANSCRIPT_TOO_LONG") return new ApiHttpError(422, code, "That recording produced too much text to review. Try a shorter recording.");
    if (code === "VOICE_PROVIDER_RATE_LIMITED") return new ApiHttpError(503, code, "The voice provider is busy. Try again in a moment.");
    if (code === "VOICE_PROVIDER_REJECTED") return new ApiHttpError(502, code, "The voice provider couldn't process this request.");
    if (code === "VOICE_PROVIDER_INVALID_RESPONSE" || code === "VOICE_PROVIDER_AUDIO_TOO_LARGE") return new ApiHttpError(502, code, "The voice provider returned audio we couldn't use.");
    if (code === "VOICE_INVALID_SPEECH_CHUNK") return new ApiHttpError(502, "VOICE_PROVIDER_INVALID_RESPONSE", "The voice provider couldn't prepare that reply for playback.");
    return new ApiHttpError(503, "VOICE_PROVIDER_UNAVAILABLE", "Voice processing is temporarily unavailable. You can still type to ORBIT.");
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "VOICE_INVALID_AUDIO") return new ApiHttpError(422, "VOICE_INVALID_AUDIO", "This recording is not a supported mono 16 kHz WAV. Record again or type instead.");
  if (code === "NOT_FOUND") return new ApiHttpError(404, "NOT_FOUND", "That coaching record is no longer available.");
  if (code === "CONFLICT") return new ApiHttpError(409, "CONFLICT", "The coaching conversation changed. Review it before recording a new message.");
  return new ApiHttpError(500, "INTERNAL_ERROR", "Voice processing failed. You can still type to ORBIT.");
}
