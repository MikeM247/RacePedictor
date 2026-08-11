import assert from "node:assert/strict";
import test from "node:test";
import {
  PrismaOperationalUsageRepository,
  PrismaReconciliationScopeRepository,
} from "../src/cloud/index.js";

const NOW = new Date("2026-08-10T12:34:56.000Z");

test("operational usage records durable daily/quarter-hour counters and measures raw/database storage", async () => {
  const prisma = fakePrisma();
  const repository = new PrismaOperationalUsageRepository({ prisma });
  await repository.recordInvocation(NOW);
  await repository.recordProviderResponse(1_024, NOW);
  await repository.recordBandwidth(512, NOW);
  const usage = await repository.readUsage(NOW);
  assert.deepEqual(usage, {
    rawStorageBytes: 4_096,
    databaseBytes: 8_192,
    invocationsDaily: 1,
    bandwidthBytesDaily: 1_536,
    providerRequests15Minutes: 1,
    providerRequestsDaily: 1,
  });
  assert.deepEqual(prisma.rawAggregateInput, { _sum: { byteSize: true } });
  const quarter = [...prisma.rows.values()].find((row) => row.metric === "provider_requests_15m");
  assert.equal(quarter.windowStart.toISOString(), "2026-08-10T12:30:00.000Z");
  assert.equal(quarter.windowEnd.toISOString(), "2026-08-10T12:45:00.000Z");
});

test("reconciliation scope is connected-Strava-only, deterministic, and bounded", async () => {
  let query;
  const repository = new PrismaReconciliationScopeRepository({ prisma: {
    providerConnection: { findMany: async (value) => { query = value; return [{ athleteId: "athlete-a" }, { athleteId: "athlete-b" }]; } },
  } });
  assert.deepEqual(await repository.listConnectedAthleteIds(2), ["athlete-a", "athlete-b"]);
  assert.deepEqual(query, {
    where: { provider: "strava", status: "connected" },
    select: { athleteId: true }, orderBy: { athleteId: "asc" }, take: 2,
  });
  await assert.rejects(repository.listConnectedAthleteIds(26), /limit/u);
});

function fakePrisma() {
  const rows = new Map();
  const operationalUsageBucket = {
    upsert: async ({ where, create, update }) => {
      const key = `${where.metric_windowStart.metric}:${where.metric_windowStart.windowStart.toISOString()}`;
      const existing = rows.get(key);
      const row = existing
        ? { ...existing, amount: existing.amount + BigInt(update.amount.increment), windowEnd: update.windowEnd }
        : { ...create, amount: BigInt(create.amount) };
      rows.set(key, row);
      return row;
    },
    findMany: async ({ where }) => [...rows.values()].filter((row) => row.windowStart.getTime() === where.windowStart.getTime() && where.metric.in.includes(row.metric)),
    findUnique: async ({ where }) => rows.get(`${where.metric_windowStart.metric}:${where.metric_windowStart.windowStart.toISOString()}`) ?? null,
  };
  const prisma = {
    rows,
    operationalUsageBucket,
    rawObject: { aggregate: async (input) => {
      prisma.rawAggregateInput = input;
      return { _sum: { byteSize: 4_096 } };
    } },
    $queryRawUnsafe: async () => [{ bytes: 8_192n }],
    $transaction: async (operation) => operation({ operationalUsageBucket }),
  };
  return prisma;
}
