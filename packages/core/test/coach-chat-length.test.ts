import assert from "node:assert/strict";
import test from "node:test";
import { COACH_CHAT_MAX_MESSAGE_CHARS, coachConversationMessageSchema, coachTurnRequestSchema } from "../src/contracts/coach-chat.ts";
import { COACH_VOICE_MAX_DRAFT_CHARS, COACH_VOICE_MAX_DURATION_SECONDS, COACH_VOICE_MAX_AUDIO_BYTES, coachVoiceCapabilitiesSchema } from "../src/contracts/coach-voice.ts";

test("chat message and saved-history contracts share the 30,000-character limit", () => {
  const text = "x".repeat(COACH_CHAT_MAX_MESSAGE_CHARS);
  const request = {
    clientTurnId: crypto.randomUUID(), expectedGeneration: 1, expectedSequence: 0, text,
    topic: "general", selectedRecord: null, contextFingerprint: "a".repeat(64),
  };
  assert.equal(coachTurnRequestSchema.safeParse(request).success, true);
  assert.equal(coachTurnRequestSchema.safeParse({ ...request, text: `${text}x` }).success, false);
  assert.equal(coachConversationMessageSchema.safeParse({
    id: "message-user-1", sequence: 1, generation: 1, role: "user", text,
    createdAt: new Date().toISOString(), topic: "general", selectedRecord: null, turnState: "completed",
  }).success, true);
  assert.equal(COACH_VOICE_MAX_DRAFT_CHARS, COACH_CHAT_MAX_MESSAGE_CHARS);
});

test("progressive limits are separate and legacy voice capability remains backward compatible", () => {
  assert.equal(COACH_VOICE_MAX_DURATION_SECONDS, 120);
  assert.equal(COACH_VOICE_MAX_AUDIO_BYTES, 3_840_044);
  const legacyCapabilities = {
    dictation: { available: true, reason: "available" },
    playback: { available: true, reason: "available" },
    limits: {
      maxRecordingSeconds: 120, maxAudioBytes: 3_840_044, maxDraftChars: 4_000,
      transcriptionTimeoutMs: 20_000, speechTimeoutMs: 15_000, transientAudioTtlMs: 300_000,
      monthlyAllowanceMicroUsd: 5_000_000, remainingAllowanceMicroUsd: 5_000_000,
      resetsAt: "2026-12-01T00:00:00.000Z",
    },
    disclosureVersion: 1, providerName: "OpenAI", providerDataControlsUrl: "https://platform.openai.com/docs/guides/your-data",
  };
  assert.equal(coachVoiceCapabilitiesSchema.safeParse(legacyCapabilities).success, true);
  assert.equal(coachVoiceCapabilitiesSchema.safeParse({ ...legacyCapabilities, limits: { ...legacyCapabilities.limits, maxDraftChars: 30_000 } }).success, true);
  assert.equal(coachVoiceCapabilitiesSchema.safeParse({ ...legacyCapabilities, progressiveDictation: { available: false } }).success, true);
});
