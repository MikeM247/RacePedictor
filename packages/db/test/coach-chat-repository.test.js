import assert from "node:assert/strict";
import test from "node:test";
import { buildActorContext, athleteScopeFor } from "../../core/src/contracts/auth.ts";
import { CoachChatConflictError, CoachChatRateLimitError, PrismaCoachChatRepository } from "../src/cloud/prisma-coach-chat-repository.js";

function matches(row, where, store) {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (key === "conversationId_generation_clientTurnId") {
      if (!matches(row, expected, store)) return false;
      continue;
    }
    if (key === "turn" && expected?.is) {
      const turn = store.turns.find((candidate) => candidate.id === row.turnId);
      if (!matches(turn, expected.is, store)) return false;
      continue;
    }
    const actual = row?.[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if ("lt" in expected && !(actual < expected.lt)) return false;
      if ("in" in expected && !expected.in.includes(actual)) return false;
      if ("increment" in expected) continue;
      if ("is" in expected) { if (!matches(actual, expected.is, store)) return false; continue; }
      if ("lt" in expected || "in" in expected) continue;
    }
    if (actual instanceof Date && expected instanceof Date) {
      if (actual.valueOf() !== expected.valueOf()) return false;
    } else if (actual !== expected) return false;
  }
  return true;
}

function applyData(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) row[key] = typeof row[key] === "bigint" ? row[key] + BigInt(value.increment) : row[key] + value.increment;
    else row[key] = value;
  }
  return row;
}

function sorted(rows, orderBy = []) {
  const sorters = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((left, right) => {
    for (const sorter of sorters) {
      for (const [key, direction] of Object.entries(sorter ?? {})) {
        const a = left[key] instanceof Date ? left[key].valueOf() : left[key];
        const b = right[key] instanceof Date ? right[key].valueOf() : right[key];
        if (a < b) return direction === "desc" ? 1 : -1;
        if (a > b) return direction === "desc" ? -1 : 1;
      }
    }
    return 0;
  });
}

function createFakePrisma() {
  const store = { conversations: [], turns: [], messages: [], archives: [], usage: [], id: 0 };
  let queue = Promise.resolve();
  const id = (prefix) => `${prefix}_${++store.id}`;
  const prisma = {
    coachConversation: {
      findUnique: async ({ where }) => store.conversations.find((row) => matches(row, where, store)) ?? null,
      findFirst: async ({ where }) => store.conversations.find((row) => matches(row, where, store)) ?? null,
      upsert: async ({ where, create }) => store.conversations.find((row) => matches(row, where, store)) ?? (() => {
        const row = { id: id("conversation"), generation: 1, sequence: 0, lastReflectedActivityId: null, lastReflectedActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...create };
        store.conversations.push(row); return row;
      })(),
      update: async ({ where, data }) => {
        const row = store.conversations.find((candidate) => matches(candidate, where, store));
        if (!row) throw new Error("conversation not found");
        return applyData(row, data);
      },
    },
    coachTurn: {
      updateMany: async ({ where, data }) => {
        const rows = store.turns.filter((row) => matches(row, where, store));
        rows.forEach((row) => applyData(row, data)); return { count: rows.length };
      },
      findUnique: async ({ where }) => store.turns.find((row) => matches(row, where, store)) ?? null,
      findFirst: async ({ where, orderBy, include }) => {
        const row = sorted(store.turns.filter((candidate) => matches(candidate, where, store)), orderBy)[0] ?? null;
        if (!row || !include?.messages) return row;
        const messages = store.messages.filter((message) => message.turnId === row.id && matches(message, include.messages.where, store));
        return { ...row, messages: sorted(messages, include.messages.orderBy).slice(0, include.messages.take ?? messages.length) };
      },
      create: async ({ data }) => {
        const row = { id: id("turn"), createdAt: new Date(), updatedAt: new Date(), ...data };
        store.turns.push(row); return row;
      },
      update: async ({ where, data }) => {
        const row = store.turns.find((candidate) => matches(candidate, where, store));
        if (!row) throw new Error("turn not found");
        return applyData(row, data);
      },
      deleteMany: async ({ where }) => {
        const ids = new Set(store.turns.filter((row) => matches(row, where, store)).map((row) => row.id));
        store.turns = store.turns.filter((row) => !ids.has(row.id));
        store.messages = store.messages.filter((row) => !ids.has(row.turnId));
        return { count: ids.size };
      },
    },
    coachConversationArchive: {
      findFirst: async ({ where }) => store.archives.find((row) => matches(row, where, store)) ?? null,
      findMany: async ({ where, orderBy, take }) => sorted(store.archives.filter((row) => matches(row, where, store)), orderBy).slice(0, take),
      create: async ({ data }) => { const row = { id: id("archive"), ...data }; store.archives.push(row); return row; },
      deleteMany: async ({ where }) => { const before = store.archives.length; store.archives = store.archives.filter((row) => !matches(row, where, store)); return { count: before - store.archives.length }; },
    },
    coachMessage: {
      findMany: async ({ where, orderBy, take, include }) => sorted(store.messages.filter((row) => matches(row, where, store)), orderBy).slice(0, take).map((row) => include?.turn ? { ...row, turn: { state: store.turns.find((turn) => turn.id === row.turnId)?.state } } : row),
      findFirst: async ({ where, orderBy }) => sorted(store.messages.filter((row) => matches(row, where, store)), orderBy)[0] ?? null,
      create: async ({ data }) => { const row = { id: id("message"), createdAt: new Date(), ...data }; store.messages.push(row); return row; },
    },
    coachUsageBucket: {
      upsert: async ({ where, create, update }) => {
        const unique = where.athleteId_windowKind_windowStart;
        const row = store.usage.find((item) => item.athleteId === unique.athleteId && item.windowKind === unique.windowKind && item.windowStart.valueOf() === unique.windowStart.valueOf());
        if (row) return applyData(row, update);
        const created = { id: id("usage"), inputTokens: 0n, outputTokens: 0n, ...create };
        store.usage.push(created); return created;
      },
      updateMany: async ({ where, data }) => {
        const rows = store.usage.filter((row) => matches(row, where, store));
        for (const row of rows) applyData(row, data);
        return { count: rows.length };
      },
    },
    async $queryRaw(_query, ...values) {
      const conversation = store.conversations.find((row) => row.athleteId === values[0] && (!values[1] || row.id === values[1]));
      return conversation ? [{ id: conversation.id }] : [];
    },
    async $transaction(work) {
      let release;
      const previous = queue;
      queue = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = structuredClone(store);
      try { return await work(prisma); }
      catch (error) { Object.assign(store, snapshot); throw error; }
      finally { release(); }
    },
    store,
  };
  return prisma;
}

const actor = buildActorContext({ userId: "owner_test", permittedAthleteIds: ["athlete_test"], activeAthleteId: "athlete_test", requestId: "request_test", credentialKind: "session" });
const scope = athleteScopeFor(actor);
const fingerprint = "a".repeat(64);
let now;
let leaseCounter;
function setup() {
  const prisma = createFakePrisma();
  now = new Date("2026-10-22T12:34:15.000Z"); leaseCounter = 0;
  const repository = new PrismaCoachChatRepository({ prisma, now: () => new Date(now), newLeaseToken: () => `lease_${++leaseCounter}` });
  return { prisma, repository };
}
function turnInput(sequence, clientTurnId = `client_${sequence}`, text = `Message ${sequence}`) {
  return { clientTurnId, expectedGeneration: 1, expectedSequence: sequence, text, topic: "reflect", selectedRecord: { type: "activity", id: "activity_12345678" }, requestHash: `${sequence}`.padStart(64, "0"), contextFingerprint: fingerprint, contextSnapshot: { localDate: "2026-10-22" }, reflectedActivityAt: now.toISOString(), model: "gpt-5-mini" };
}
async function complete(repository, result, text = "A complete answer.") {
  return repository.completeTurn(scope, { turnId: result.turn.id, attempt: result.turn.attemptCount, leaseToken: result.leaseToken, text, currentFingerprint: fingerprint, selectedRecordType: "activity", selectedRecordId: "activity_12345678", metadata: { requestId: "request_123", inputTokens: 12, outputTokens: 8, latencyMs: 100 } });
}

test("durable turns deduplicate by client identity, single-flight, and persist completed history", async () => {
  const { repository } = setup();
  const first = await repository.beginTurn(scope, turnInput(0, "client_first"));
  assert.equal(first.kind, "started");
  assert.equal(first.userMessage.sequence, 1);
  assert.equal((await repository.getConversationMarker(scope)).lastReflectedActivityId, "activity_12345678");

  const replay = await repository.beginTurn(scope, turnInput(0, "client_first"));
  assert.equal(replay.kind, "replay");
  assert.equal(replay.userMessage.id, first.userMessage.id);
  await assert.rejects(repository.beginTurn(scope, { ...turnInput(0, "client_first"), requestHash: "x".repeat(64) }), CoachChatConflictError);
  await assert.rejects(repository.beginTurn(scope, turnInput(1, "client_competing")), /already being generated/u);

  const completed = await complete(repository, first, "A response grounded in the approved session.");
  assert.equal(completed.kind, "completed");
  const state = await repository.getConversation(scope);
  assert.equal(state.sequence, 2);
  assert.deepEqual(state.messages.map((message) => message.role), ["user", "assistant"]);
  assert.equal(state.messages[1].text, "A response grounded in the approved session.");
  assert.deepEqual(await repository.getCompletedHistory(scope), [
    { role: "user", text: "Message 0", topic: "reflect" },
    { role: "assistant", text: "A response grounded in the approved session.", topic: "reflect" },
  ]);
});

test("spoken reply lookup is limited to completed messages in the active generation", async () => {
  const { repository } = setup();
  const pending = await repository.beginTurn(scope, turnInput(0, "voice_lookup"));
  assert.equal(await repository.getCurrentAssistantMessage(scope, 1, "message_pending"), null);
  await complete(repository, pending, "Saved reply for playback.");
  const conversation = await repository.getConversation(scope);
  const assistant = conversation.messages.find((message) => message.role === "assistant");
  assert.ok(assistant);
  const savedReply = await repository.getCurrentAssistantMessage(scope, 1, assistant.id);
  assert.equal(savedReply.id, assistant.id);
  assert.equal(savedReply.text, "Saved reply for playback.");
  assert.equal(await repository.getCurrentAssistantMessage(scope, 2, assistant.id), null);
});

test("failed turns retain the user message, retry with a fenced lease, and clear history without late publication", async () => {
  const { prisma, repository } = setup();
  const first = await repository.beginTurn(scope, turnInput(0, "client_first"));
  const failed = await repository.failTurn(scope, { turnId: first.turn.id, attempt: 1, leaseToken: first.leaseToken, safeErrorCode: "PROVIDER_TIMEOUT" });
  assert.equal(failed.turn.state, "failed");
  assert.equal((await repository.getConversation(scope)).messages[0].text, "Message 0");

  const retried = await repository.retryTurn(scope, { turnId: first.turn.id, expectedGeneration: 1, expectedAttempt: 1, retryId: "retry_1", retryRequestHash: fingerprint, contextFingerprint: fingerprint, contextSnapshot: { localDate: "2026-10-22" }, model: "gpt-5-mini" });
  assert.equal(retried.turn.attemptCount, 2);
  assert.equal(retried.userMessage.id, first.userMessage.id);
  assert.equal((await complete(repository, { ...retried, turn: retried.turn, userMessage: retried.userMessage }, "Retried answer.")).kind, "completed");
  assert.equal((await repository.getConversation(scope)).messages.length, 2);

  const pending = await repository.beginTurn(scope, { ...turnInput(2, "client_pending", "One more question"), expectedSequence: 2 });
  const beforeUsage = prisma.store.usage.map((bucket) => bucket.attemptCount);
  const cleared = await repository.clearHistory(scope, { expectedGeneration: 1, expectedSequence: 3 });
  assert.deepEqual(cleared, { generation: 2, sequence: 0 });
  assert.equal((await repository.getConversation(scope)).messages.length, 0);
  assert.deepEqual(prisma.store.usage.map((bucket) => bucket.attemptCount), beforeUsage);
  assert.deepEqual(await complete(repository, pending), { kind: "stale" });
});

test("expired work is recoverable and concurrent first sends cannot both claim a conversation", async () => {
  const { repository } = setup();
  const [a, b] = await Promise.allSettled([
    repository.beginTurn(scope, turnInput(0, "client_a")),
    repository.beginTurn(scope, turnInput(0, "client_b")),
  ]);
  assert.equal([a, b].filter((item) => item.status === "fulfilled").length, 1);
  assert.equal([a, b].filter((item) => item.status === "rejected").length, 1);

  const started = a.status === "fulfilled" ? a.value : b.status === "fulfilled" ? b.value : null;
  assert.ok(started);
  now = new Date(now.valueOf() + 91_000);
  const recovered = await repository.retryTurn(scope, { turnId: started.turn.id, expectedGeneration: 1, expectedAttempt: 1, retryId: "retry_after_expiry", retryRequestHash: fingerprint, contextFingerprint: fingerprint, contextSnapshot: { localDate: "2026-10-22" }, model: "gpt-5-mini" });
  assert.equal(recovered.kind, "started");
  assert.equal(recovered.turn.state, "processing");
  assert.equal(recovered.turn.attemptCount, 2);
  assert.equal(recovered.userMessage.id, started.userMessage.id);
  assert.deepEqual(await complete(repository, started), { kind: "stale" }, "a late result from the expired lease cannot publish");
});

test("minute quota reservation is rolled back when a provider attempt exceeds the limit", async () => {
  const { repository, prisma } = setup();
  let sequence = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await repository.beginTurn(scope, { ...turnInput(sequence, `client_${attempt}`), expectedSequence: sequence });
    assert.equal(result.kind, "started");
    sequence += 1;
    await complete(repository, result);
    sequence += 1;
  }
  const savedAttempts = prisma.store.usage.filter((bucket) => bucket.windowKind === "minute")[0].attemptCount;
  await assert.rejects(repository.beginTurn(scope, { ...turnInput(sequence, "client_over_limit"), expectedSequence: sequence }), CoachChatRateLimitError);
  assert.equal(prisma.store.usage.find((bucket) => bucket.windowKind === "minute").attemptCount, savedAttempts, "the rejected transaction must roll back its over-limit reservation");
});

test("replay lookup stays athlete and generation scoped and disappears after clear", async () => {
  const { repository } = setup();
  const started = await repository.beginTurn(scope, turnInput(0, "replay_lookup"));
  assert.equal((await repository.getTurnReplay(scope, { expectedGeneration: 1, clientTurnId: "replay_lookup" })).userMessage.id, started.userMessage.id);
  const other = athleteScopeFor(buildActorContext({ userId: "other_owner", permittedAthleteIds: ["other_athlete"], activeAthleteId: "other_athlete", requestId: "other_request", credentialKind: "session" }));
  assert.equal(await repository.getTurnReplay(other, { expectedGeneration: 1, clientTurnId: "replay_lookup" }), null);
  await repository.clearHistory(scope, { expectedGeneration: 1, expectedSequence: 1 });
  assert.equal(await repository.getTurnReplay(scope, { expectedGeneration: 1, clientTurnId: "replay_lookup" }), null);
});

const archiveInput = { expectedGeneration: 1, expectedSequence: 2, requestId: "archive_request_1" };

test("archive retains every page, starts an empty generation and excludes archived AI context", async () => {
  const { repository, prisma } = setup();
  const first = await repository.beginTurn(scope, turnInput(0, "archive_first", "How should I approach next week?"));
  await complete(repository, first);
  // Seed additional persisted messages to exercise pagination independently of provider quotas.
  for (let sequence = 3; sequence <= 65; sequence++) prisma.store.messages.push({ ...prisma.store.messages[0], id: `older_${sequence}`, sequence, text: `Saved message ${sequence}` });
  prisma.store.conversations[0].sequence = 65;
  const saved = await repository.archiveConversation(scope, { ...archiveInput, expectedSequence: 65 });
  assert.equal(saved.archive.finalSequence, 65);
  assert.equal(saved.archive.title, "How should I approach next week?");
  assert.equal(prisma.store.messages.length, 65);
  assert.deepEqual((await repository.getConversation(scope)).messages, []);
  assert.equal((await repository.getConversation(scope)).generation, 2);
  assert.equal((await repository.getConversationMarker(scope)).lastReflectedActivityId, null);
  assert.deepEqual(await repository.getCompletedHistory(scope), []);
  const latest = await repository.getArchive(scope, saved.archive.id);
  assert.equal(latest.messages.length, 40);
  assert.equal(latest.hasOlder, true);
  const older = await repository.getArchive(scope, saved.archive.id, { beforeSequence: latest.oldestSequence });
  assert.equal(older.messages.length, 25);
  assert.equal(older.hasOlder, false);
  assert.deepEqual([...older.messages, ...latest.messages].map((item) => item.sequence), Array.from({ length: 65 }, (_, index) => index + 1));
});

test("archive abandons processing, fences late replies and rejects old-generation replays", async () => {
  const { repository, prisma } = setup();
  const pending = await repository.beginTurn(scope, turnInput(0, "pending_archive"));
  const saved = await repository.archiveConversation(scope, { ...archiveInput, expectedSequence: 1 });
  assert.equal(prisma.store.turns[0].state, "abandoned");
  assert.equal(prisma.store.turns[0].leaseToken, null);
  assert.equal((await complete(repository, pending)).kind, "stale");
  assert.equal((await repository.getArchive(scope, saved.archive.id)).messages.length, 1);
  await assert.rejects(repository.beginTurn(scope, turnInput(0, "pending_archive")), CoachChatConflictError);
  await assert.rejects(repository.retryTurn(scope, { turnId: pending.turn.id, expectedGeneration: 1 }), CoachChatConflictError);
});

test("archive retries are idempotent, competing clears conflict, and empty chats make no archive", async () => {
  const { repository, prisma } = setup();
  assert.equal((await repository.archiveConversation(scope, { ...archiveInput, expectedSequence: 0 })).archive, null);
  const first = await repository.beginTurn(scope, turnInput(0)); await complete(repository, first);
  const [a, b] = await Promise.all([repository.archiveConversation(scope, archiveInput), repository.archiveConversation(scope, archiveInput)]);
  assert.equal(a.archive.id, b.archive.id);
  assert.equal(prisma.store.archives.length, 1);
  await assert.rejects(repository.archiveConversation(scope, { ...archiveInput, requestId: "competing" }), CoachChatConflictError);
  await assert.rejects(repository.archiveConversation(scope, { ...archiveInput, expectedSequence: 1 }), CoachChatConflictError);
  assert.equal((await repository.getConversation(scope)).generation, 2);
});

test("a failed archive transaction retains the complete active discussion", async () => {
  const { repository, prisma } = setup();
  const first = await repository.beginTurn(scope, turnInput(0)); await complete(repository, first);
  prisma.coachConversation.update = async () => { throw new Error("synthetic database failure"); };
  await assert.rejects(repository.archiveConversation(scope, archiveInput), /synthetic database failure/u);
  assert.equal(prisma.store.archives.length, 0);
  assert.equal((await repository.getConversation(scope)).sequence, 2);
  assert.equal((await repository.getCompletedHistory(scope)).length, 2);
});

test("archives are athlete-scoped and permanent deletion removes all generations", async () => {
  const { repository, prisma } = setup();
  const first = await repository.beginTurn(scope, turnInput(0)); await complete(repository, first);
  const { archive } = await repository.archiveConversation(scope, archiveInput);
  const other = athleteScopeFor(buildActorContext({ userId: "other_owner", permittedAthleteIds: ["other_athlete"], activeAthleteId: "other_athlete", requestId: "other_request", credentialKind: "session" }));
  assert.deepEqual((await repository.listArchives(other)).items, []);
  await assert.rejects(repository.getArchive(other, archive.id), /not found/u);
  assert.equal((await repository.listArchives(scope)).items.length, 1);
  await repository.clearHistory(scope, { expectedGeneration: 2, expectedSequence: 0 });
  assert.equal(prisma.store.messages.length, 0);
  assert.equal(prisma.store.turns.length, 0);
  assert.equal(prisma.store.archives.length, 0);
  await assert.rejects(repository.getArchive(scope, archive.id), /not found/u);
});

test("history listing pages by generation without duplicates", async () => {
  const { repository, prisma } = setup();
  for (let generation = 1; generation <= 25; generation++) prisma.store.archives.push({
    id: `archive_${generation}`, athleteId: "athlete_test", conversationId: "conversation_test", generation,
    requestId: `request_${generation}`, title: `Discussion ${generation}`, startedAt: now, archivedAt: now, finalSequence: 1,
  });
  const first = await repository.listArchives(scope);
  assert.equal(first.items.length, 20); assert.equal(first.nextBefore, 6);
  const second = await repository.listArchives(scope, { beforeGeneration: first.nextBefore });
  assert.equal(second.items.length, 5); assert.equal(second.nextBefore, null);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 25);
});
