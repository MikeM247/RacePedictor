import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildActorContext } from "../../../packages/core/src/contracts/auth.ts";
import { handleCoachNewTurn, handleCoachRetry } from "../lib/server/coach-chat-handlers.ts";

const security = { mode: "authenticated" as const, actor: buildActorContext({ userId: "owner_test", activeAthleteId: "athlete_test", permittedAthleteIds: ["athlete_test"], requestId: "replay_test", credentialKind: "session" }) };
const fingerprint = "a".repeat(64);
const original = { clientTurnId: "fe4602d1-8d64-4e8c-853f-d0c715f10ae7", expectedGeneration: 1, expectedSequence: 0, text: "How should I prepare?", topic: "general", selectedRecord: null, contextFingerprint: fingerprint };
const hash = (input: Record<string, unknown>) => createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))))).digest("hex");
const post = (body: unknown) => new Request("https://preview.example/api/v1/coaching/chat/turns", { method: "POST", headers: { origin: "https://preview.example", "content-type": "application/json" }, body: JSON.stringify(body) });
function composition(turn: Record<string, unknown>, userOverrides = {}) {
  return { coachChat: {
    getTurnReplay: async () => ({ kind: "replay", turn: { id: "turn_saved", state: "completed", attemptCount: 2, safeErrorCode: null, ...turn },
      userMessage: { id: "message_saved", sequence: 1, generation: 1, role: "user", text: original.text, createdAt: new Date(), ...userOverrides },
      assistantMessage: { id: "reply_saved", sequence: 2, generation: 1, role: "assistant", text: "Saved reply", createdAt: new Date() } }),
    getConversationMarker: async () => { throw new Error("Changed or deleted training context must not be read for a replay"); },
  } } as unknown as NonNullable<Parameters<typeof handleCoachNewTurn>[2]>;
}

test("new-turn replay returns the persisted result before rereading changed training context", async () => {
  const previous = process.env.RACEPREDICTOR_COACH_CHAT_ENABLED;
  process.env.RACEPREDICTOR_CLOUD_MODE = "enabled";
  process.env.RACEPREDICTOR_COACH_CHAT_ENABLED = "true";
  try {
    const savedHash = hash({ text: original.text, topic: original.topic, selectedRecord: null, contextFingerprint: fingerprint });
    const data = composition({ requestHash: savedHash });
    const response = await handleCoachNewTurn(security, post(original), data);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.assistantMessage.id, "reply_saved");
    const selectedRecord = { id: "activity_selected", type: "activity" };
    const selectedHash = hash({ text: original.text, topic: original.topic, selectedRecord, contextFingerprint: fingerprint });
    const selected = composition({ requestHash: selectedHash }, { selectedRecordType: "activity", selectedRecordId: "activity_selected" });
    assert.equal((await handleCoachNewTurn(security, post(original), selected)).status, 200);
    await assert.rejects(handleCoachNewTurn(security, post({ ...original, text: "Changed content" }), data), (e: any) => e.status === 409);
  } finally { if (previous === undefined) delete process.env.RACEPREDICTOR_COACH_CHAT_ENABLED; else process.env.RACEPREDICTOR_COACH_CHAT_ENABLED = previous; delete process.env.RACEPREDICTOR_CLOUD_MODE; }
});

test("retry replay uses the original fingerprint and rejects a changed retry payload", async () => {
  process.env.RACEPREDICTOR_CLOUD_MODE = "enabled";
  process.env.RACEPREDICTOR_COACH_CHAT_ENABLED = "true";
  try {
    const retry = { expectedGeneration: 1, expectedAttempt: 1, retryId: "b7fdc5a3-106e-4ad7-a135-5e4b0d884a0a", contextFingerprint: fingerprint };
    const data = composition({ retryRequestHash: hash({ expectedAttempt: 1, contextFingerprint: fingerprint }) });
    const response = await handleCoachRetry(security, post(retry), "turn_saved", data);
    assert.equal((await response.json()).data.replayKind, "retry-replay");
    await assert.rejects(handleCoachRetry(security, post({ ...retry, contextFingerprint: "b".repeat(64) }), "turn_saved", data), (e: any) => e.status === 409);
  } finally { delete process.env.RACEPREDICTOR_COACH_CHAT_ENABLED; delete process.env.RACEPREDICTOR_CLOUD_MODE; }
});
