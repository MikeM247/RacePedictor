import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import {
  CoachVoiceBudgetError,
  CoachVoiceBusyError,
  CoachVoiceConflictError,
  CoachVoiceRateLimitError,
  PrismaCoachVoiceRepository,
} from "../src/cloud/prisma-coach-voice-repository.js";

function actor(athleteId) {
  return athleteScopeFor(buildActorContext({ userId: `user_${athleteId}`, activeAthleteId: athleteId, permittedAthleteIds: [athleteId], requestId: "request_voice_test", credentialKind: "session" }));
}

function matches(row, where) {
  for (const [key, value] of Object.entries(where ?? {})) {
    if (key === "athleteId_operationId" || key === "athleteId_windowKind_windowStart") {
      if (!matches(row, value)) return false;
      continue;
    }
    const actual = row[key];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("lte" in value && !(actual <= value.lte)) return false;
      if ("gt" in value && !(actual > value.gt)) return false;
      continue;
    }
    if (actual instanceof Date && value instanceof Date) { if (actual.valueOf() !== value.valueOf()) return false; }
    else if (actual !== value) return false;
  }
  return true;
}

function apply(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) row[key] = typeof row[key] === "bigint" ? row[key] + BigInt(value.increment) : row[key] + value.increment;
    else row[key] = value;
  }
}

function fakePrisma() {
  const store = { attempts: [], buckets: [], id: 0 };
  let lock = Promise.resolve();
  const prisma = {
    coachVoiceAttempt: {
      findUnique: async ({ where }) => store.attempts.find((row) => matches(row, where)) ?? null,
      findFirst: async ({ where }) => store.attempts.find((row) => matches(row, where)) ?? null,
      create: async ({ data }) => { const row = { id: `attempt_${++store.id}`, ...data }; store.attempts.push(row); return row; },
      updateMany: async ({ where, data }) => {
        const rows = store.attempts.filter((row) => matches(row, where));
        rows.forEach((row) => apply(row, data));
        return { count: rows.length };
      },
    },
    coachVoiceUsageBucket: {
      findUnique: async ({ where }) => store.buckets.find((row) => matches(row, where)) ?? null,
      upsert: async ({ where, create, update }) => {
        const existing = store.buckets.find((row) => matches(row, where));
        if (existing) { apply(existing, update); return existing; }
        const row = { id: `bucket_${++store.id}`, ...create }; store.buckets.push(row); return row;
      },
      update: async ({ where, data }) => { const row = store.buckets.find((item) => matches(item, where)); if (!row) throw new Error("bucket missing"); apply(row, data); return row; },
    },
    async $executeRaw() { return 1; },
    async $transaction(work) {
      const previous = lock;
      let release;
      lock = new Promise((resolve) => { release = resolve; });
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

const reservation = (operationId, amount = 10_000) => ({ operationId, kind: "transcription", model: "whisper-1", inputUnits: 30, reservedMicroUsd: amount });

test("real PostgreSQL voice admissions execute the lock and serialize separate Prisma clients", {
  skip: !process.env.COACH_VOICE_TEST_DATABASE_URL,
}, async () => {
  const url = process.env.COACH_VOICE_TEST_DATABASE_URL;
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname), "use a migrated, disposable loopback database");
  const { PrismaClient } = await import("@prisma/client");
  const clients = [new PrismaClient({ datasources: { db: { url } } }), new PrismaClient({ datasources: { db: { url } } })];
  const id = `voice_regression_${randomUUID()}`;
  const scope = actor(id);
  const now = new Date();
  const repositories = clients.map((prisma) => new PrismaCoachVoiceRepository({ prisma, now: () => now }));
  try {
    await clients[0].athlete.create({ data: { id } });
    const results = await Promise.allSettled(repositories.map((repository, index) => repository.reserve(scope, reservation(`concurrent-${index}`))));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected?.reason instanceof CoachVoiceBusyError);
    assert.equal(await repositories[0].remainingAllowance(scope, now), 4_990_000);
    const admitted = results.find((result) => result.status === "fulfilled").value;
    assert.equal(await repositories[0].complete(scope, admitted.operationId, { state: "completed", now }), true);
    await assert.rejects(repositories[1].reserve(scope, reservation(admitted.operationId)), CoachVoiceConflictError);
    await repositories[1].reserve(scope, reservation("next-recording"));
    assert.equal(await repositories[1].complete(scope, "next-recording", { state: "completed", now }), true);
    assert.equal(await repositories[0].remainingAllowance(scope, now), 4_980_000);
  } finally {
    await clients[0].athlete.deleteMany({ where: { id } });
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
});

test("voice usage admission is owner-scoped, content-free and deduplicates provider operations", async () => {
  const prisma = fakePrisma();
  const repository = new PrismaCoachVoiceRepository({ prisma, now: () => new Date("2026-10-28T12:00:00.000Z"), newId: () => "synthetic-id" });
  const scope = actor("athlete_voice_a");
  await repository.reserve(scope, reservation("operation-one"));
  assert.equal(await repository.remainingAllowance(scope), 4_990_000);
  assert.equal(prisma.store.attempts[0].operationId, "operation-one");
  assert.equal("transcript" in prisma.store.attempts[0], false);
  assert.equal("recordId" in prisma.store.attempts[0], false);
  await assert.rejects(repository.reserve(scope, reservation("operation-one")), CoachVoiceConflictError);
  assert.equal(await repository.remainingAllowance(actor("athlete_voice_b")), 5_000_000);
});

test("voice usage serializes concurrent admissions and permits one live lease per athlete", async () => {
  const prisma = fakePrisma();
  const repository = new PrismaCoachVoiceRepository({ prisma, now: () => new Date("2026-10-28T12:00:00.000Z") });
  const scope = actor("athlete_voice_parallel");
  const results = await Promise.allSettled([
    repository.reserve(scope, reservation("parallel-one")),
    repository.reserve(scope, reservation("parallel-two")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason instanceof CoachVoiceBusyError).length, 1);
  const active = prisma.store.attempts[0];
  assert.equal(await repository.complete(scope, active.operationId, { state: "completed", latencyMs: 42 }), true);
});

test("voice request and budget ceilings apply at UTC windows and leases expire", async () => {
  const now = new Date("2026-10-28T12:00:00.000Z");
  const prisma = fakePrisma();
  const repository = new PrismaCoachVoiceRepository({ prisma, now: () => now });
  const scope = actor("athlete_voice_limits");
  for (let index = 0; index < 6; index += 1) {
    const operationId = `minute-${index}`;
    await repository.reserve(scope, reservation(operationId));
    await repository.complete(scope, operationId, { state: "completed", now });
  }
  await assert.rejects(repository.reserve(scope, reservation("minute-seven")), CoachVoiceRateLimitError);

  const budgetPrisma = fakePrisma();
  const budgetRepository = new PrismaCoachVoiceRepository({ prisma: budgetPrisma, now: () => now });
  const budgetScope = actor("athlete_voice_budget");
  await budgetRepository.reserve(budgetScope, reservation("almost-all", 4_999_999));
  await budgetRepository.complete(budgetScope, "almost-all", { state: "completed", now });
  assert.equal(await budgetRepository.remainingAllowance(budgetScope, now), 1);
  await assert.rejects(budgetRepository.reserve(budgetScope, reservation("over-budget", 2)), CoachVoiceBudgetError);

  const leasePrisma = fakePrisma();
  const leaseRepository = new PrismaCoachVoiceRepository({ prisma: leasePrisma, now: () => now });
  const leaseScope = actor("athlete_voice_lease");
  await leaseRepository.reserve(leaseScope, reservation("stale-lease"));
  await leaseRepository.reserve(leaseScope, { ...reservation("after-expiry"), now: new Date(now.valueOf() + 30_001) });
  assert.equal(leasePrisma.store.attempts.find((row) => row.operationId === "stale-lease").state, "expired");
});
