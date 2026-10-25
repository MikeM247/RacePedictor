import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readPreviewDatabaseOverride } from "../packages/db/src/cloud/preview-database-configuration.js";
import { getCloudPrismaClient } from "../packages/db/src/cloud/prisma-client.js";
import { buildActorContext, athleteScopeFor } from "../packages/core/src/contracts/auth.ts";
import { CoachChatConflictError, PrismaCoachChatRepository } from "../packages/db/src/cloud/prisma-coach-chat-repository.js";
import { getCloudReadComposition } from "../apps/web/lib/server/cloud-read-composition.ts";
import { handleCoachContext, handleCoachNewTurn, handleCoachRetry, handleCoachConversation } from "../apps/web/lib/server/coach-chat-handlers.ts";
import { CoachProviderError } from "../apps/web/lib/server/coach-openai-provider.ts";

let phase = "environment";

async function main() {
  assert.ok(readPreviewDatabaseOverride(), "REQUIRES_WORK_PREVIEW");
  assert.equal(process.env.RACEPREDICTOR_COACH_UI_ENABLED, "true");
  assert.equal(process.env.RACEPREDICTOR_COACH_CHAT_ENABLED, "true");
  const prisma = getCloudPrismaClient();
  const athleteId = `coach_smoke_${randomUUID()}`;
  const activityId = `coach_activity_${randomUUID()}`;
  const security = { mode: "authenticated" as const, actor: buildActorContext({ userId: "preview_smoke", activeAthleteId: athleteId, permittedAthleteIds: [athleteId], credentialKind: "session", requestId: randomUUID() }) };
  const scope = athleteScopeFor(security.actor);
  const repo = new PrismaCoachChatRepository({ prisma });
  const composition = getCloudReadComposition();
  const origin = "https://preview-smoke.example";
  const request = (body?: unknown) => new Request(`${origin}/api/v1/coaching/chat/turns`, body === undefined ? {} : { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const readContext = async () => (await (await handleCoachContext(security, new Request(`${origin}/api/v1/coaching/chat/context?topic=reflect`))).json()).data;
  const makeTurn = async (text: string) => {
    const context = await readContext();
    const state: any = await repo.getConversation(scope);
    return { clientTurnId: randomUUID(), expectedGeneration: state.generation, expectedSequence: state.sequence, text, topic: "reflect", selectedRecord: context.selectedRecord, contextFingerprint: context.fingerprint };
  };
  const respond = async (body: unknown, override?: any) => (await (await handleCoachNewTurn(security, request(body), override)).json()).data;
  try {
    phase = "synthetic-records";
    await prisma.athlete.create({ data: { id: athleteId, displayName: "Synthetic Coach release check" } });
    const occurredAt = new Date(Date.now() - 3_600_000);
    await prisma.activity.create({ data: { id: activityId, athleteId, sourceType: "manual", sport: "run", title: "Synthetic 5 km easy run", occurredAt, endedAt: new Date(occurredAt.valueOf() + 1_800_000), elapsedTimeS: 1800, distanceM: 5000, avgPaceSecPerKm: 360, elevationGainM: 20, elevationLossM: 20, dedupeHash: randomUUID() } });
    const original = await makeTurn("This is a synthetic release check. Briefly reflect on the recorded distance and time; do not invent a goal or approved plan.");
    phase = "first-live-turn";
    const first = await respond(original);
    assert.equal(first.turn.state, "completed");
    assert.ok(first.assistantMessage.text.length > 0);
    assert.ok((await prisma.coachTurn.findUnique({ where: { id: first.turn.id } }))?.providerRequestId);
    assert.equal((await repo.getConversation(scope) as any).messages.length, 2);
    await prisma.activity.update({ where: { id: activityId }, data: { title: "Synthetic revised 5 km run" } });
    const replay = await respond(original);
    assert.equal(replay.assistantMessage.id, first.assistantMessage.id);
    assert.equal(await prisma.coachMessage.count({ where: { athleteId } }), 2);
    phase = "second-live-turn";
    const second = await respond(await makeTurn("In one sentence, connect your previous reply to this follow-up, while acknowledging there is no approved training plan here."));
    assert.equal(second.turn.state, "completed");
    const reloaded = (await (await handleCoachConversation(security, request())).json()).data;
    assert.equal(reloaded.messages.length, 4);
    console.log("[coach-smoke] Actual Coach context, two OpenAI replies, persisted reload, and duplicate replay after context change passed.");

    phase = "retry-recovery";
    const failed = await respond(await makeTurn("Synthetic retry check"), { ...composition, generateReply: async () => { throw new CoachProviderError("PROVIDER_TIMEOUT"); } });
    assert.equal(failed.turn.state, "failed");
    const retryContext = await readContext();
    const retryBody = { expectedGeneration: 1, expectedAttempt: 1, retryId: randomUUID(), contextFingerprint: retryContext.fingerprint };
    const syntheticProvider = { ...composition, generateReply: async () => ({ text: "Synthetic retry reply.", metadata: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } }) };
    const retried = (await (await handleCoachRetry(security, request(retryBody), failed.turn.id, syntheticProvider)).json()).data;
    assert.equal(retried.turn.state, "completed");
    await prisma.activity.update({ where: { id: activityId }, data: { title: "Synthetic context changed after retry" } });
    const retryReplay = (await (await handleCoachRetry(security, request(retryBody), failed.turn.id, syntheticProvider)).json()).data;
    assert.equal(retryReplay.assistantMessage.id, retried.assistantMessage.id);
    assert.equal(await prisma.coachMessage.count({ where: { athleteId, turnId: failed.turn.id, role: "user" } }), 1);

    phase = "concurrent-turns";
    const context = await readContext();
    const marker = await repo.getConversationMarker(scope);
    const concurrentInput = (id: string) => ({ clientTurnId: id, expectedGeneration: marker.generation, expectedSequence: marker.sequence, text: "Synthetic concurrent turn", topic: "general", selectedRecord: null, requestHash: createHash("sha256").update(id).digest("hex"), contextFingerprint: context.fingerprint, contextSnapshot: context });
    const concurrent = await Promise.allSettled([repo.beginTurn(scope, concurrentInput(randomUUID())), repo.beginTurn(scope, concurrentInput(randomUUID()))]);
    assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = concurrent.find((r) => r.status === "rejected");
    assert.ok(rejected?.status === "rejected" && rejected.reason instanceof CoachChatConflictError);
    const winner: any = concurrent.find((r) => r.status === "fulfilled");
    const pending = winner.value;
    const beforeClear: any = await repo.getConversation(scope);
    phase = "clear-during-generation";
    const cleared = await repo.clearHistory(scope, { expectedGeneration: beforeClear.generation, expectedSequence: beforeClear.sequence });
    assert.equal(cleared.sequence, 0);
    const late = await repo.completeTurn(scope, { turnId: pending.turn.id, attempt: pending.turn.attemptCount, leaseToken: pending.leaseToken, text: "Late synthetic reply", currentFingerprint: context.fingerprint });
    assert.equal(late.kind, "stale");
    assert.equal((await repo.getConversation(scope) as any).messages.length, 0);
    console.log("[coach-smoke] Real Postgres single-flight concurrency, retry replay, and clear-history lease fencing passed.");
  } finally {
    // Only this random synthetic athlete and its fixture activity are removed.
    await prisma.activity.deleteMany({ where: { id: activityId, athleteId } });
    await prisma.athlete.deleteMany({ where: { id: athleteId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Never log prompts, replies, owner identifiers, Prisma SQL, or credentials.
  console.error(`[coach-smoke] FAILED ${phase} ${error?.safeCode || error?.code || error?.name || "UNKNOWN"}`);
  process.exitCode = 1;
});
