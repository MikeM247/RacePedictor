import { z } from "zod";
import { coachRecordReferenceSchema, coachTopicSchema } from "./coach-chat.ts";

export const COACH_VOICE_MAX_AUDIO_BYTES = 3_840_044;
export const COACH_VOICE_MAX_DURATION_SECONDS = 120;
export const COACH_VOICE_MAX_TRANSCRIPT_CHARS = 16_000;
export const COACH_VOICE_MAX_DRAFT_CHARS = 4_000;
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
export const coachVoiceSpeechRequestSchema = z.object({
  playbackId: z.string().uuid(),
  operationId: z.string().uuid(),
  expectedGeneration: z.number().int().positive(),
  messageId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/u),
  chunkIndex: z.number().int().min(0).max(COACH_VOICE_MAX_SPEECH_CHUNKS - 1),
}).strict();

export const coachVoiceCapabilitiesSchema = z.object({
  dictation: z.object({ available: z.boolean(), reason: z.enum(["available", "disabled", "chat_paused", "provider_unavailable"]) }).strict(),
  playback: z.object({ available: z.boolean(), reason: z.enum(["available", "disabled", "provider_unavailable"]) }).strict(),
  limits: z.object({
    maxRecordingSeconds: z.literal(COACH_VOICE_MAX_DURATION_SECONDS),
    maxAudioBytes: z.literal(COACH_VOICE_MAX_AUDIO_BYTES),
    maxDraftChars: z.literal(COACH_VOICE_MAX_DRAFT_CHARS),
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
