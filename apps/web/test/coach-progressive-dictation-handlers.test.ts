import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../../packages/core/src/contracts/auth.ts";
import { encodeCoachVoiceWav } from "../../../packages/core/src/services/coach-voice-audio.ts";
import { resolveCoachContext } from "../lib/server/coach-context.ts";
import { handleCoachProgressiveChunk, handleCoachProgressiveClose, handleCoachProgressiveHeartbeat, handleCoachProgressiveSessionCreate } from "../lib/server/coach-voice-handlers.ts";

const security = { mode: "authenticated" as const, actor: buildActorContext({ userId: "owner_voice", activeAthleteId: "athlete_voice", permittedAthleteIds: ["athlete_voice"], requestId: "progressive_test", credentialKind: "session" }) };
const marker = { id: "conversation_voice", generation: 1, sequence: 0, lastReflectedActivityId: null, lastReflectedActivityAt: null };
function fakeComposition() {
  const session = { id: "session_voice", athleteId: "athlete_voice", conversationId: marker.id, generation: 1, sequence: 0, topic: "general", selectedRecordType: null, selectedRecordId: null, contextFingerprint: "", state: "active", expiresAt: new Date(Date.now() + 1_000_000), leaseExpiresAt: new Date(Date.now() + 90_000), admissionMonthStart: new Date("2026-11-01T00:00:00.000Z"), reservedMicroUsd: 350_000n, chargedMicroUsd: 0n, capturedSeconds: 0, admittedChunks: 0 };
  const admissions: any[] = []; const completions: any[] = [];
  const value = {
    coachChat: { getConversationMarker: async () => marker },
    coaching: { getActivePlan: async () => null }, goalContexts: {}, calendarSessions: {},
    activities: { list: async () => ({ items: [] }) }, activityReviews: {}, journal: { listWellbeing: async () => [] },
    coachProgressiveDictation: {
      createSession: async (_scope: unknown, binding: any) => { Object.assign(session, { ...binding, contextFingerprint: binding.contextFingerprint }); return session; },
      getActiveSession: async () => session,
      heartbeat: async () => session,
      admitChunk: async (_scope: unknown, _id: string, input: unknown) => { admissions.push(input); return { id: "attempt_voice" }; },
      completeChunk: async (_scope: unknown, id: string, input: unknown) => { completions.push({ id, input }); return true; },
      closeSession: async () => ({ closed: true, remainingAllowanceMicroUsd: 4_995_000 }),
    },
  } as any;
  return { value, session, admissions, completions };
}
const postJson = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { origin: new URL(url).origin, "content-type": "application/json" }, body: JSON.stringify(body) });

test("progressive session handlers keep provider mock behind injection and return no-store timed text", async () => {
  const saved = { mode: process.env.RACEPREDICTOR_CLOUD_MODE, ui: process.env.RACEPREDICTOR_COACH_UI_ENABLED, chat: process.env.RACEPREDICTOR_COACH_CHAT_ENABLED, dictation: process.env.RACEPREDICTOR_COACH_DICTATION_ENABLED, progressive: process.env.RACEPREDICTOR_COACH_PROGRESSIVE_DICTATION_ENABLED, key: process.env.OPENAI_API_KEY };
  Object.assign(process.env, { RACEPREDICTOR_CLOUD_MODE: "enabled", RACEPREDICTOR_COACH_UI_ENABLED: "true", RACEPREDICTOR_COACH_CHAT_ENABLED: "true", RACEPREDICTOR_COACH_DICTATION_ENABLED: "true", RACEPREDICTOR_COACH_PROGRESSIVE_DICTATION_ENABLED: "true", OPENAI_API_KEY: "synthetic-test-key" });
  const fake = fakeComposition();
  try {
    const context = await resolveCoachContext(fake.value, security.actor as any, { topic: "general", selectedRecord: null });
    fake.session.contextFingerprint = context.fingerprint;
    const input = { expectedGeneration: 1, expectedSequence: 0, topic: "general", selectedRecord: null, contextFingerprint: context.fingerprint };
    const created = await handleCoachProgressiveSessionCreate(security, postJson("https://coach.test/api/v1/coaching/voice/dictation-sessions", input), fake.value);
    assert.equal(created.status, 201);
    assert.match(created.headers.get("cache-control") ?? "", /no-store/u);
    const audio = encodeCoachVoiceWav([new Int16Array(16_000).fill(20)]);
    const attemptId = crypto.randomUUID();
    const chunkRequest = new Request("https://coach.test/api/v1/coaching/voice/dictation-sessions/session_voice/chunks", { method: "POST", headers: { origin: "https://coach.test", "content-type": "audio/wav", "x-orbit-dictation-chunk": JSON.stringify({ attemptId, chunkIndex: 0, retryOrdinal: 0, capturedStartSeconds: 0.5, capturedEndSeconds: 1, overlapSeconds: 0.5 }) }, body: audio });
    let providerCalls = 0;
    const chunk = await handleCoachProgressiveChunk(security, chunkRequest, "session_voice", fake.value, { transcribeWithTimestamps: async () => { providerCalls += 1; return { text: "repeat Run easy.", words: [{ text: "repeat", startSeconds: 0.1, endSeconds: 0.3 }, { text: "Run", startSeconds: 0.6, endSeconds: 0.75 }, { text: "easy.", startSeconds: 0.8, endSeconds: 0.9 }, { text: "next", startSeconds: 0.9, endSeconds: 1.1 }] }; } });
    assert.equal(chunk.status, 200);
    assert.equal(providerCalls, 1);
    const body = await chunk.json();
    assert.deepEqual(body.data.words.map((word: any) => word.text), ["Run", "easy."]);
    assert.equal(body.data.text, "Run easy.");
    assert.equal(fake.admissions.length, 1);
    assert.equal(fake.admissions[0].attemptId, attemptId);
    assert.equal(fake.completions.length, 1);
    assert.equal((await handleCoachProgressiveHeartbeat(security, postJson("https://coach.test/heartbeat", {}), "session_voice", fake.value)).status, 200);
    assert.equal((await handleCoachProgressiveClose(security, postJson("https://coach.test/close", { cancel: false }), "session_voice", fake.value)).status, 200);
  } finally {
    for (const [key, value] of Object.entries({ RACEPREDICTOR_CLOUD_MODE: saved.mode, RACEPREDICTOR_COACH_UI_ENABLED: saved.ui, RACEPREDICTOR_COACH_CHAT_ENABLED: saved.chat, RACEPREDICTOR_COACH_DICTATION_ENABLED: saved.dictation, RACEPREDICTOR_COACH_PROGRESSIVE_DICTATION_ENABLED: saved.progressive, OPENAI_API_KEY: saved.key })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('progressive handlers use real PostgreSQL admission, reject replay and release unused reservation', {
  skip: !process.env.COACH_VOICE_TEST_DATABASE_URL,
}, async () => {
  const url = process.env.COACH_VOICE_TEST_DATABASE_URL!;
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname));
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaCoachChatRepository, PrismaCoachProgressiveDictationRepository } = await import('../../../packages/db/src/cloud/index.js');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const rivalPrisma = new PrismaClient({ datasources: { db: { url } } });
  const athleteId = `voice_handler_${crypto.randomUUID()}`;
  const actor = buildActorContext({ userId: 'voice_test_owner', activeAthleteId: athleteId, permittedAthleteIds: [athleteId], requestId: crypto.randomUUID(), credentialKind: 'session' });
  const scopedSecurity = { mode: 'authenticated' as const, actor };
  const fake = fakeComposition();
  fake.value.coachChat = new PrismaCoachChatRepository({ prisma });
  fake.value.coachProgressiveDictation = new PrismaCoachProgressiveDictationRepository({ prisma });
  const overrides = { RACEPREDICTOR_CLOUD_MODE: 'enabled', RACEPREDICTOR_COACH_UI_ENABLED: 'true', RACEPREDICTOR_COACH_CHAT_ENABLED: 'true', RACEPREDICTOR_COACH_DICTATION_ENABLED: 'true', RACEPREDICTOR_COACH_PROGRESSIVE_DICTATION_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-test-key' };
  const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    await prisma.athlete.create({ data: { id: athleteId } });
    const context = await resolveCoachContext(fake.value, athleteScopeFor(actor), { topic: 'general', selectedRecord: null });
    const sessionRequest = () => postJson('https://coach.test/sessions', { expectedGeneration: 1, expectedSequence: 0, topic: 'general', selectedRecord: null, contextFingerprint: context.fingerprint });
    const rivalComposition = { ...fake.value, coachChat: new PrismaCoachChatRepository({ prisma: rivalPrisma }), coachProgressiveDictation: new PrismaCoachProgressiveDictationRepository({ prisma: rivalPrisma }) };
    const admissions = await Promise.allSettled([
      handleCoachProgressiveSessionCreate(scopedSecurity, sessionRequest(), fake.value),
      handleCoachProgressiveSessionCreate(scopedSecurity, sessionRequest(), rivalComposition),
    ]);
    const admitted = admissions.filter((result) => result.status === 'fulfilled');
    assert.equal(admitted.length, 1);
    const rejected = admissions.find((result) => result.status === 'rejected');
    assert.equal((rejected as PromiseRejectedResult).reason.code, 'VOICE_OPERATION_BUSY');
    const created = (admitted[0] as PromiseFulfilledResult<Response>).value;
    const sessionId = (await created.json()).data.sessionId;
    const attemptId = crypto.randomUUID();
    const request = () => new Request('https://coach.test/chunks', { method: 'POST', headers: { origin: 'https://coach.test', 'content-type': 'audio/wav', 'x-orbit-dictation-chunk': JSON.stringify({ attemptId, chunkIndex: 0, retryOrdinal: 0, capturedStartSeconds: 0, capturedEndSeconds: 0.25, overlapSeconds: 0 }) }, body: new Uint8Array(8_044) });
    const { encodeProgressiveCoachVoiceWav } = await import('../../../packages/core/src/services/coach-voice-audio.ts');
    const chunkRequest = () => {
      const original = request();
      return new Request(original, { body: encodeProgressiveCoachVoiceWav(new Int16Array(4_000).fill(1000)) });
    };
    let calls = 0;
    const provider = { transcribeWithTimestamps: async () => { calls += 1; return { text: 'Run easy.', words: [{ text: 'Run', startSeconds: 0, endSeconds: 0.1 }, { text: 'easy.', startSeconds: 0.1, endSeconds: 0.25 }] }; } };
    const response = await handleCoachProgressiveChunk(scopedSecurity, chunkRequest(), sessionId, fake.value, provider);
    assert.equal((await response.json()).data.text, 'Run easy.');
    await assert.rejects(handleCoachProgressiveChunk(scopedSecurity, chunkRequest(), sessionId, fake.value, provider), (error: any) => error.code === 'VOICE_OPERATION_CONFLICT');
    assert.equal(calls, 1);
    await handleCoachProgressiveHeartbeat(scopedSecurity, postJson('https://coach.test/heartbeat', {}), sessionId, fake.value);
    const closed = await handleCoachProgressiveClose(scopedSecurity, postJson('https://coach.test/close', { cancel: false }), sessionId, fake.value);
    assert.equal((await closed.json()).data.remainingAllowanceMicroUsd, 4_999_958);
    await handleCoachProgressiveClose(scopedSecurity, postJson('https://coach.test/close', { cancel: false }), sessionId, fake.value);
    const session = await prisma.coachProgressiveDictationSession.findUniqueOrThrow({ where: { id: sessionId } });
    const attempt = await prisma.coachVoiceAttempt.findUniqueOrThrow({ where: { athleteId_operationId: { athleteId, operationId: attemptId } } });
    assert.equal(session.state, 'closed');
    assert.equal(session.admittedChunks, 1);
    assert.equal(attempt.state, 'completed');
    for (const contentKey of ['audio', 'text', 'transcript', 'words']) { assert.equal(contentKey in session, false); assert.equal(contentKey in attempt, false); }
  } finally {
    await prisma.athlete.deleteMany({ where: { id: athleteId } });
    await Promise.all([prisma.$disconnect(), rivalPrisma.$disconnect()]);
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
