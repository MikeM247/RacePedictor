import { z } from "zod";
import { COACH_CHAT_MAX_MESSAGE_CHARS, coachRecordReferenceSchema, coachTopicSchema } from "./coach-chat.ts";

// Legacy single-request dictation remains bounded independently of progressive sessions.
export const COACH_VOICE_MAX_AUDIO_BYTES = 3_840_044;
export const COACH_VOICE_MAX_DURATION_SECONDS = 120;
export const COACH_VOICE_MAX_TRANSCRIPT_CHARS = 16_000;
export const COACH_VOICE_MAX_DRAFT_CHARS = COACH_CHAT_MAX_MESSAGE_CHARS;
export const COACH_PROGRESSIVE_MAX_DURATION_SECONDS = 900;
export const COACH_PROGRESSIVE_MAX_CHUNK_SECONDS = 30;
export const COACH_PROGRESSIVE_MAX_CHUNK_BYTES = 992_044;
export const COACH_PROGRESSIVE_MAX_CHUNKS = 90;
export const COACH_PROGRESSIVE_TRANSCRIPTION_TIMEOUT_MS = 90_000;
export const COACH_VOICE_SPEECH_CHUNK_CHARS = 1_200;
export const COACH_VOICE_MAX_SPEECH_CHUNKS = 6;
export const COACH_VOICE_MONTHLY_ALLOWANCE_MICRO_USD = 5_000_000n;
export const COACH_VOICE_MAX_PER_MINUTE = 6;
export const COACH_VOICE_MAX_PER_DAY = 60;

const voiceContext = {
  operationId: z.string().uuid(),
  expectedGeneration: z.number().int().positive(),
  expectedSequence: z.number().int().nonnegative(),
  topic: coachTopicSchema,
  selectedRecord: coachRecordReferenceSchema.nullable(),
  contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
};

export const coachVoiceTranscriptionMetadataSchema = z.object(voiceContext).strict();
export const coachProgressiveSessionRequestSchema = z.object({
  expectedGeneration: z.number().int().positive(), expectedSequence: z.number().int().nonnegative(), topic: coachTopicSchema,
  selectedRecord: coachRecordReferenceSchema.nullable(), contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
export const coachProgressiveSessionResponseSchema = z.object({
  sessionId: z.string().min(1).max(128), expiresAt: z.string().datetime(), leaseExpiresAt: z.string().datetime(),
  limits: z.object({ maxDurationSeconds: z.literal(COACH_PROGRESSIVE_MAX_DURATION_SECONDS), maxChunkSeconds: z.literal(COACH_PROGRESSIVE_MAX_CHUNK_SECONDS), maxChunkBytes: z.literal(COACH_PROGRESSIVE_MAX_CHUNK_BYTES), maxChunks: z.literal(COACH_PROGRESSIVE_MAX_CHUNKS) }).strict(),
}).strict();
export const coachProgressiveChunkMetadataSchema = z.object({
  attemptId: z.string().uuid(), chunkIndex: z.number().int().min(0).max(COACH_PROGRESSIVE_MAX_CHUNKS - 1), retryOrdinal: z.union([z.literal(0), z.literal(1)]),
  capturedStartSeconds: z.number().finite().min(0).max(COACH_PROGRESSIVE_MAX_DURATION_SECONDS), overlapSeconds: z.number().finite().min(0).max(1),
  capturedEndSeconds: z.number().finite().min(0).max(COACH_PROGRESSIVE_MAX_DURATION_SECONDS),
}).strict().refine((value) => value.capturedEndSeconds > value.capturedStartSeconds && value.capturedEndSeconds - value.capturedStartSeconds <= COACH_PROGRESSIVE_MAX_CHUNK_SECONDS, { message: "Invalid capture interval" });
export const coachProgressiveChunkResponseSchema = z.object({
  sessionId: z.string().min(1).max(128), chunkIndex: z.number().int().min(0).max(COACH_PROGRESSIVE_MAX_CHUNKS - 1),
  capturedStartSeconds: z.number().finite().nonnegative(), capturedEndSeconds: z.number().finite().positive(), text: z.string().max(COACH_VOICE_MAX_TRANSCRIPT_CHARS),
  words: z.array(z.object({ text: z.string().min(1).max(200), startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().nonnegative() }).strict()).max(10_000),
}).strict();
export const coachProgressiveCloseRequestSchema = z.object({ cancel: z.boolean().default(false) }).strict();
export const coachVoiceSpeechRequestSchema = z.object({
  playbackId: z.string().uuid(),
  operationId: z.string().uuid(),
  expectedGeneration: z.number().int().positive(),
  messageId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/u),
  chunkIndex: z.number().int().min(0).max(COACH_VOICE_MAX_SPEECH_CHUNKS - 1),
}).strict();

export const coachVoiceCapabilitiesSchema = z.object({
  dictation: z.object({ available: z.boolean(), reason: z.enum(["available", "disabled", "chat_paused", "provider_unavailable"]) }).strict(),
  progressiveDictation: z.object({ available: z.boolean() }).strict().optional(),
  playback: z.object({ available: z.boolean(), reason: z.enum(["available", "disabled", "provider_unavailable"]) }).strict(),
  limits: z.object({
    maxRecordingSeconds: z.literal(COACH_VOICE_MAX_DURATION_SECONDS),
    maxAudioBytes: z.literal(COACH_VOICE_MAX_AUDIO_BYTES),
    // Accept existing 4k servers during rolling deploys; current servers advertise 30k.
    maxDraftChars: z.union([z.literal(4_000), z.literal(COACH_VOICE_MAX_DRAFT_CHARS)]),
    transcriptionTimeoutMs: z.literal(20_000),
    speechTimeoutMs: z.literal(15_000),
    transientAudioTtlMs: z.literal(300_000),
    monthlyAllowanceMicroUsd: z.literal(Number(COACH_VOICE_MONTHLY_ALLOWANCE_MICRO_USD)),
    remainingAllowanceMicroUsd: z.number().int().nonnegative().max(Number(COACH_VOICE_MONTHLY_ALLOWANCE_MICRO_USD)),
    resetsAt: z.string().datetime(),
  }).strict(),
  disclosureVersion: z.literal(1),
  providerName: z.literal("OpenAI"),
  providerDataControlsUrl: z.literal("https://platform.openai.com/docs/guides/your-data"),
}).strict();

export const coachVoiceTranscriptionResultSchema = z.object({
  operationId: z.string().uuid(),
  generation: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
  contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  transcript: z.string().trim().min(1).max(COACH_VOICE_MAX_TRANSCRIPT_CHARS),
}).strict();

export type CoachVoiceCapabilities = z.infer<typeof coachVoiceCapabilitiesSchema>;
