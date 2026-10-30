import assert from "node:assert/strict";
import test from "node:test";
import { buildActorContext } from "../../../packages/core/src/contracts/auth.ts";
import { coachArchiveRequestSchema, coachArchiveResultSchema, coachDiscardRequestSchema, coachDiscardResultSchema, coachHistoryMessagesSchema } from "../../../packages/core/src/contracts/coach-chat.ts";
import { handleCoachArchive, handleCoachDiscard, handleCoachHistory, handleCoachHistoryMessages, handleClearCoachHistory } from "../lib/server/coach-chat-handlers.ts";
import { CoachChatConflictError } from "../../../packages/db/src/cloud/index.js";

const actor = buildActorContext({ userId: "owner_test", activeAthleteId: "athlete_test", permittedAthleteIds: ["athlete_test"], requestId: "history_test", credentialKind: "session" });
const security = { mode: "authenticated" as const, actor };
const body = { expectedGeneration: 1, expectedSequence: 2, requestId: "bcf95be9-a69e-4c71-9d45-7fa4db187f77" };
const archive = { id: "archive_saved", generation: 1, title: "My next week", startedAt: "2026-10-25T07:00:00.000Z", archivedAt: "2026-10-25T08:00:00.000Z", finalSequence: 2 };
const conversation = { generation: 2, sequence: 0, messages: [], hasOlder: false, oldestSequence: null, currentTurn: null };
const request = (payload: unknown = body, origin = "https://coach.test") => new Request("https://coach.test/api/v1/coaching/chat/conversation/archive", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(payload) });
type Composition = NonNullable<Parameters<typeof handleCoachArchive>[2]>;

test("archive contracts validate identity, expected state and bounded history", () => {
  assert.equal(coachArchiveRequestSchema.safeParse(body).success, true);
  assert.equal(coachArchiveRequestSchema.safeParse({ ...body, requestId: "not-uuid" }).success, false);
  assert.equal(coachArchiveRequestSchema.safeParse({ ...body, expectedSequence: -1 }).success, false);
  assert.equal(coachArchiveRequestSchema.safeParse({ ...body, athleteId: "other" }).success, false);
  assert.equal(coachArchiveResultSchema.safeParse({ archive, conversation }).success, true);
  assert.equal(coachHistoryMessagesSchema.safeParse({ archive, messages: [], hasOlder: false, oldestSequence: null }).success, true);
});

test("discard contract validates expected state and the empty next conversation", () => {
  const expected = { expectedGeneration: 2, expectedSequence: 5 };
  assert.equal(coachDiscardRequestSchema.safeParse(expected).success, true);
  assert.equal(coachDiscardRequestSchema.safeParse({ ...expected, expectedSequence: -1 }).success, false);
  assert.equal(coachDiscardRequestSchema.safeParse({ ...expected, athleteId: "other" }).success, false);
  assert.equal(coachDiscardResultSchema.safeParse({ conversation: { ...conversation, generation: 3 } }).success, true);
});

test("discard route delegates authenticated scope, validates state and checks same origin", async () => {
  const expected = { expectedGeneration: 2, expectedSequence: 5 };
  const nextConversation = { ...conversation, generation: 3 };
  const composition = { coachChat: {
    discardConversation: async (scope: any, input: unknown) => { assert.equal(scope.athleteId, "athlete_test"); assert.deepEqual(input, expected); return { conversation: nextConversation }; },
  } } as unknown as Composition;
  const response = await handleCoachDiscard(security, request(expected), composition);
  assert.deepEqual((await response.json()).data, { conversation: nextConversation });
  await assert.rejects(handleCoachDiscard(security, request({ ...expected, expectedSequence: -1 }), composition), (error: any) => error.status === 400);
  await assert.rejects(handleCoachDiscard(security, request(expected, "https://other.test"), composition), (error: any) => error.status === 403);
});

test("archive route delegates authenticated scope and returns the persisted active generation", async () => {
  const composition = { coachChat: {
    archiveConversation: async (scope: any, input: unknown) => { assert.equal(scope.athleteId, "athlete_test"); assert.deepEqual(input, body); return { archive }; },
    getConversation: async () => conversation,
  } } as unknown as Composition;
  const response = await handleCoachArchive(security, request(), composition);
  assert.deepEqual((await response.json()).data, { archive, conversation });
  await assert.rejects(handleCoachArchive(security, request(body, "https://other.test"), composition), (error: any) => error.status === 403);
  await assert.rejects(handleCoachArchive(security, request({ ...body, expectedSequence: -1 }), composition), (error: any) => error.status === 400);
  const conflict = { coachChat: { archiveConversation: async () => { throw new CoachChatConflictError(); } } } as unknown as Composition;
  await assert.rejects(handleCoachArchive(security, request(), conflict), (error: any) => error.status === 409);
});

test("archive and history reject device credentials and unauthenticated runtime", async () => {
  const device = { mode: "authenticated" as const, actor: { ...actor, credentialKind: "device" as const } };
  for (const invoke of [
    () => handleCoachArchive(device as any, request()),
    () => handleCoachHistory(device as any, request()),
    () => handleCoachHistoryMessages(device as any, request(), archive.id),
    () => handleClearCoachHistory(device as any, request()),
    () => handleCoachDiscard(device as any, request()),
  ]) await assert.rejects(invoke, (error: any) => error.status === 403);
  await assert.rejects(handleCoachHistory({ mode: "local" } as any, request()), (error: any) => error.status === 503);
});

test("history routes validate cursors and archive identifiers before repository access", async () => {
  const composition = { coachChat: {
    listArchives: async (scope: any, input: any) => { assert.equal(scope.athleteId, "athlete_test"); assert.equal(input.beforeGeneration, 5); return { items: [archive], nextBefore: null }; },
    getArchive: async (scope: any, id: string, input: any) => { assert.equal(scope.athleteId, "athlete_test"); assert.equal(id, archive.id); assert.equal(input.beforeSequence, 2); return { archive, messages: [], hasOlder: false, oldestSequence: null }; },
  } } as unknown as Composition;
  assert.equal((await handleCoachHistory(security, new Request("https://coach.test/history?before=5"), composition)).status, 200);
  assert.equal((await handleCoachHistoryMessages(security, new Request("https://coach.test/history?before=2"), archive.id, composition)).status, 200);
  await assert.rejects(handleCoachHistory(security, new Request("https://coach.test/history?before=-1"), composition), (error: any) => error.status === 400);
  await assert.rejects(handleCoachHistoryMessages(security, request(), "../other", composition), (error: any) => error.status === 400);
});

test("permanent history deletion delegates only authenticated expected state", async () => {
  const expected = { expectedGeneration: 2, expectedSequence: 0 };
  const composition = { coachChat: { clearHistory: async (scope: any, input: unknown) => {
    assert.equal(scope.athleteId, "athlete_test"); assert.deepEqual(input, expected); return { generation: 3, sequence: 0 };
  } } } as unknown as Composition;
  const response = await handleClearCoachHistory(security, request(expected), composition);
  assert.deepEqual((await response.json()).data, { generation: 3, sequence: 0 });
  await assert.rejects(handleClearCoachHistory(security, request(expected, "https://other.test"), composition), (error: any) => error.status === 403);
});
