import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../../packages/core/src/contracts/auth.ts";
import { encodeCoachVoiceWav } from "../../../packages/core/src/services/coach-voice-audio.ts";
import { handleCoachVoiceCapabilities, handleCoachVoiceSpeech, handleCoachVoiceTranscription } from "../lib/server/coach-voice-handlers.ts";
import { failure } from "../lib/server/api-response.ts";
import { resolveCoachContext } from "../lib/server/coach-context.ts";

const environmentKeys = ["RACEPREDICTOR_CLOUD_MODE", "RACEPREDICTOR_COACH_UI_ENABLED", "RACEPREDICTOR_COACH_CHAT_ENABLED", "RACEPREDICTOR_COACH_DICTATION_ENABLED", "RACEPREDICTOR_COACH_PLAYBACK_ENABLED", "OPENAI_API_KEY"];
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let providerFetch: typeof fetch = async () => new Response(JSON.stringify({ text: "Stay comfortable." }), { headers: { "content-type": "application/json" } });
globalThis.fetch = ((...args: Parameters<typeof fetch>) => providerFetch(...args)) as typeof fetch;
for (const [key, value] of Object.entries({
  RACEPREDICTOR_CLOUD_MODE: "enabled", RACEPREDICTOR_COACH_UI_ENABLED: "true", RACEPREDICTOR_COACH_CHAT_ENABLED: "true",
  RACEPREDICTOR_COACH_DICTATION_ENABLED: "true", RACEPREDICTOR_COACH_PLAYBACK_ENABLED: "true", OPENAI_API_KEY: "synthetic-key",
})) process.env[key] = value;

const scope = athleteScopeFor(buildActorContext({ userId: "voice-owner", activeAthleteId: "athlete_voice_test", permittedAthleteIds: ["athlete_voice_test"], requestId: "voice-route-test", credentialKind: "session" }));
const security = { mode: "authenticated" as const, actor: scope.actor };

function composition() {
  const marker = { id: "conversation-1", generation: 1, sequence: 0, lastReflectedActivityId: null, lastReflectedActivityAt: null };
  const state = { reserved: [] as Array<Record<string, unknown>>, completed: [] as Array<Record<string, unknown>>, message: { id: "message-assistant-1", text: "A complete saved coach reply." as string | null } };
  const value = {
    coachChat: {
      getConversationMarker: async () => ({ ...marker }),
      getCurrentAssistantMessage: async (_scope: unknown, generation: number, id: string) => generation === 1 && id === state.message.id ? { id, text: state.message.text } : null,
    },
    coaching: { getActivePlan: async () => null },
    activities: { list: async () => ({ items: [] }) },
    journal: { listWellbeing: async () => [] },
    coachVoice: {
      reserve: async (_scope: unknown, input: Record<string, unknown>) => { state.reserved.push(input); return input; },
      complete: async (_scope: unknown, operationId: string, input: Record<string, unknown>) => { state.completed.push({ operationId, ...input }); return true; },
      remainingAllowance: async () => 5_000_000,
    },
  };
  return { value: value as any, state };
}

async function requestError(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) { return failure(error); }
}

async function currentContext(fake: ReturnType<typeof composition>["value"]) {
  return resolveCoachContext(fake, scope, { topic: "general", selectedRecord: null, canSend: true });
}

function transcriptionRequest(metadata: Record<string, unknown>, wav = encodeCoachVoiceWav([new Int16Array(8_000).fill(200)])) {
  const url = "https://racepredictor.test/api/v1/coaching/voice/transcriptions";
  return new Request(url, { method: "POST", headers: { origin: "https://racepredictor.test", "content-type": "audio/wav", "x-orbit-voice": JSON.stringify(metadata) }, body: wav });
}

test("transcription revalidates current context, reserves cost, returns a reviewable transcript and persists no content", async () => {
  const fake = composition();
  const context = await currentContext(fake.value);
  const request = transcriptionRequest({ operationId: crypto.randomUUID(), expectedGeneration: 1, expectedSequence: 0, topic: "general", selectedRecord: null, contextFingerprint: context.fingerprint });
  providerFetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({ text: "Take the recovery day gently." }), { headers: { "content-type": "application/json" } });
  };
  const response = await handleCoachVoiceTranscription(security, request, fake.value);
  const payload = await response.json() as { data: { transcript: string; operationId: string; generation: number; sequence: number } };
  assert.equal(payload.data.transcript, "Take the recovery day gently.");
  assert.equal(payload.data.generation, 1); assert.equal(payload.data.sequence, 0);
  assert.equal(fake.state.reserved.length, 1);
  assert.equal(fake.state.completed[0].state, "completed");
  assert.equal("transcript" in fake.state.reserved[0], false);
  assert.equal("selectedRecord" in fake.state.reserved[0], false);
});

test("transcription rejects stale conversations and cross-origin callers before provider work", async () => {
  const fake = composition();
  const context = await currentContext(fake.value);
  let called = false;
  providerFetch = async () => { called = true; return new Response("{}"); };
  const stale = await requestError(() => handleCoachVoiceTranscription(security, transcriptionRequest({ operationId: crypto.randomUUID(), expectedGeneration: 2, expectedSequence: 0, topic: "general", selectedRecord: null, contextFingerprint: context.fingerprint }), fake.value));
  assert.equal(stale.status, 409); assert.equal(called, false); assert.equal(fake.state.reserved.length, 0);
  const crossOrigin = transcriptionRequest({ operationId: crypto.randomUUID(), expectedGeneration: 1, expectedSequence: 0, topic: "general", selectedRecord: null, contextFingerprint: context.fingerprint });
  const crossRequest = new Request(crossOrigin, { headers: { "content-type": "audio/wav", "x-orbit-voice": crossOrigin.headers.get("x-orbit-voice")! } });
  const forbidden = await requestError(() => handleCoachVoiceTranscription(security, crossRequest, fake.value));
  assert.equal(forbidden.status, 403); assert.equal(called, false);
  const device = { mode: "authenticated" as const, actor: { ...scope.actor, credentialKind: "device" as const } };
  const denied = await requestError(() => handleCoachVoiceTranscription(device, transcriptionRequest({}), fake.value));
  assert.equal(denied.status, 403);
});

test("transcription rejects malformed and silent WAV input before reserving usage", async () => {
  const fake = composition(); const context = await currentContext(fake.value);
  const metadata = { operationId: crypto.randomUUID(), expectedGeneration: 1, expectedSequence: 0, topic: "general", selectedRecord: null, contextFingerprint: context.fingerprint };
  const malformed = await requestError(() => handleCoachVoiceTranscription(security, transcriptionRequest(metadata, new Uint8Array(16_044)), fake.value));
  assert.equal(malformed.status, 422);
  const silence = await requestError(() => handleCoachVoiceTranscription(security, transcriptionRequest({ ...metadata, operationId: crypto.randomUUID() }, encodeCoachVoiceWav([new Int16Array(8_000)])), fake.value));
  assert.equal(silence.status, 422);
  assert.equal(fake.state.reserved.length, 0);
});

test("speech returns current saved coach audio as no-store MP3 and rejects archived/missing messages", async () => {
  const fake = composition();
  providerFetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/audio/speech");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.input, "A complete saved coach reply.");
    return new Response(new Uint8Array([0x49, 0x44, 0x33]), { headers: { "content-type": "audio/mpeg" } });
  };
  const playbackId = crypto.randomUUID(); const operationId = crypto.randomUUID();
  const request = new Request("https://racepredictor.test/api/v1/coaching/voice/speech", {
    method: "POST", headers: { origin: "https://racepredictor.test", "content-type": "application/json" },
    body: JSON.stringify({ playbackId, operationId, expectedGeneration: 1, messageId: "message-assistant-1", chunkIndex: 0 }),
  });
  const response = await handleCoachVoiceSpeech(security, request, fake.value);
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
  assert.equal(response.headers.get("x-orbit-playback-id"), playbackId);
  assert.equal(response.headers.get("x-orbit-operation-id"), operationId);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0x49, 0x44, 0x33]);
  assert.equal(fake.state.completed[0].state, "completed");

  const stale = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ playbackId: crypto.randomUUID(), operationId: crypto.randomUUID(), expectedGeneration: 2, messageId: "message-assistant-1", chunkIndex: 0 }) });
  const staleResponse = await requestError(() => handleCoachVoiceSpeech(security, stale, fake.value));
  assert.equal(staleResponse.status, 409);
});

test("voice UI/API remains fail-closed for non-owner credentials", async () => {
  const local = await requestError(() => handleCoachVoiceSpeech({ mode: "local", actor: null }, new Request("https://racepredictor.test", { method: "POST", headers: { origin: "https://racepredictor.test", "content-type": "application/json" }, body: "{}" }), composition().value));
  assert.equal(local.status, 503);
});

test("capabilities stay disabled without the release switches or provider key", async () => {
  const previous = new Map(["RACEPREDICTOR_COACH_UI_ENABLED", "RACEPREDICTOR_COACH_CHAT_ENABLED", "RACEPREDICTOR_COACH_DICTATION_ENABLED", "RACEPREDICTOR_COACH_PLAYBACK_ENABLED", "OPENAI_API_KEY"].map((key) => [key, process.env[key]]));
  try {
    process.env.RACEPREDICTOR_COACH_UI_ENABLED = "false";
    process.env.RACEPREDICTOR_COACH_CHAT_ENABLED = "false";
    process.env.RACEPREDICTOR_COACH_DICTATION_ENABLED = "false";
    process.env.RACEPREDICTOR_COACH_PLAYBACK_ENABLED = "false";
    delete process.env.OPENAI_API_KEY;
    const response = await handleCoachVoiceCapabilities(security);
    const payload = await response.json() as { data: { dictation: { available: boolean }; playback: { available: boolean }; limits: { monthlyAllowanceMicroUsd: number } } };
    assert.equal(payload.data.dictation.available, false);
    assert.equal(payload.data.playback.available, false);
    assert.equal(payload.data.limits.monthlyAllowanceMicroUsd, 5_000_000);
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test.after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
