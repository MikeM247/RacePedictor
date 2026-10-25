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
  const store = { conversations: [], turns: [], messages: [], usage: [], id: 0 };
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
