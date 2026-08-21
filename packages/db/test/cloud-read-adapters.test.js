import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import { projectOnlineStatus } from "../../core/src/services/online-status.ts";
import {
  CloudActivityCursorError,
  CloudSyncCursorError,
  PrismaCloudActivityRepository,
  PrismaCloudDashboardRepository,
  PrismaCloudCoachingRepository,
  PrismaOnlineStatusRepository,
  PrismaSyncChangeRepository,
} from "../src/cloud/index.js";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const scopeA = scope("athlete-a");
const scopeB = scope("athlete-b");

test("cloud activities are athlete-scoped, deterministically paged, and omit tombstones", async () => {
  const prisma = activityPrisma();
  const repository = new PrismaCloudActivityRepository({ prisma });
  const first = await repository.list(scopeA, { limit: 1 });
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].athleteId, "athlete-a");
  assert.equal(first.nextCursor, "activity-a-2");
  const second = await repository.list(scopeA, { limit: 1, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((row) => row.id), ["activity-a-1"]);
  assert.equal(second.nextCursor, undefined);

  await assert.rejects(
    repository.list(scopeA, { cursor: "activity-b-1" }),
    (error) => error instanceof CloudActivityCursorError,
  );
  assert.equal((await repository.list(scopeB)).items[0].athleteId, "athlete-b");
});

test("cloud activity detail returns only the actor athlete's structured canonical projection", async () => {
  const repository = new PrismaCloudActivityRepository({ prisma: activityPrisma() });
  const detail = await repository.findById(scopeA, "activity-a-2");
  assert.equal(detail.id, "activity-a-2");
  assert.equal(detail.splits.length, 1);
  assert.equal(detail.routeSignature.routeHash, "route-a");
  assert.equal(await repository.findById(scopeA, "activity-b-1"), null);
  assert.doesNotMatch(JSON.stringify(detail), /storageKey|rawBody|credential/u);
});

test("cloud dashboard computes only from the actor athlete and never reads a local snapshot", async () => {
  const rows = [
    row("athlete-a", "activity-a-2", "2026-08-10T10:00:00.000Z"),
    row("athlete-a", "activity-a-1", "2026-08-03T10:00:00.000Z", { distanceM: 10_000, elapsedTimeS: 3_600 }),
    row("athlete-b", "foreign-fast", "2026-08-10T11:00:00.000Z", { distanceM: 5_000, elapsedTimeS: 900 }),
  ];
  const repository = new PrismaCloudDashboardRepository({ prisma: {
    activity: { findMany: async ({ where }) => rows.filter((item) => item.athleteId === where.athleteId) },
    import: { findFirst: async () => null },
  } });
  const overview = await repository.getOverview(scopeA, NOW);
  assert.equal(overview.fetchStatus, "success");
  assert.equal(overview.data.predictionSummary.athleteId, "athlete-a");
  assert.equal(overview.data.importProgress.normalizedCount, 2);
  assert.doesNotMatch(JSON.stringify(overview), /foreign-fast|local|storageKey/u);
});

test("cloud coaching returns only approved structured projections for the actor athlete", async () => {
  const rows = [planProjection("athlete-a"), planProjection("athlete-b")];
  const repository = new PrismaCloudCoachingRepository({ prisma: coachingPrisma(rows) });
  const active = await repository.getActivePlan(scopeA);
  assert.equal(active.athleteId, "athlete-a");
  assert.deepEqual((await repository.listHistory(scopeA)).map((plan) => plan.id), ["plan-athlete-a"]);
  assert.equal(await repository.findPlan(scopeA, "plan-athlete-b"), null);
  assert.doesNotMatch(JSON.stringify(active), /relativePath|vault|storageKey|credential/u);
});

test("sync changes support empty, pagination, replay, tombstones, and foreign cursor denial", async () => {
  const repository = new PrismaSyncChangeRepository({ prisma: syncPrisma() });
  const first = await repository.list(scopeA, { after: null, limit: 1 });
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor, "1");
  const replay = await repository.list(scopeA, { after: null, limit: 1 });
  assert.deepEqual(replay, first);
  const second = await repository.list(scopeA, { after: "1", limit: 10 });
  assert.equal(second.changes[0].operation, "delete");
  assert.equal(second.changes[0].payload, null);
  assert.equal((await repository.list(scopeB, { after: null, limit: 10 })).changes.length, 0);
  await assert.rejects(
    repository.list(scopeB, { after: "2", limit: 10 }),
    (error) => error instanceof CloudSyncCursorError,
  );
});

test("status facts and projection keep local device and Second Brain staleness separate from cloud activities", async () => {
  const repository = new PrismaOnlineStatusRepository({ prisma: statusPrisma() });
  const facts = await repository.getFacts(scopeA);
  const status = projectOnlineStatus(facts, NOW);
  assert.equal(status.providerConnection.state, "current");
  assert.equal(status.ingestion.state, "retrying");
  assert.equal(status.activityData.state, "current");
  assert.equal(status.localDevice.state, "stale");
  assert.equal(status.secondBrain.state, "stale");
  assert.equal(status.secondBrain.latestRevision, 7);
  assert.doesNotMatch(JSON.stringify(status), /errorCode|credential|storageKey/u);
});

function scope(athleteId) {
  return athleteScopeFor(buildActorContext({
    userId: `user-${athleteId}`,
    permittedAthleteIds: [athleteId],
    activeAthleteId: athleteId,
    requestId: `request-${athleteId}`,
    credentialKind: "internal",
  }));
}

function row(athleteId, id, occurredAt, overrides = {}) {
  return {
    id,
    athleteId,
    sourceType: "strava",
    sourceFileId: null,
    sourceActivityId: id,
    title: "Synthetic run",
    occurredAt: new Date(occurredAt),
    localOccurredAt: occurredAt.slice(0, 19),
    endedAt: new Date(new Date(occurredAt).getTime() + 1800_000),
    elapsedTimeS: 1800,
    movingTimeS: 1750,
    sport: "run",
    distanceM: 5000,
    avgPaceSecPerKm: 350,
    elevationGainM: 50,
    elevationLossM: 45,
    minElevationM: 10,
    maxElevationM: 60,
    avgHrBpm: 150,
    maxHrBpm: 170,
    minHrBpm: 100,
    hrAvailable: true,
    avgCadenceSpm: 172,
    maxCadenceSpm: 180,
    cadenceAvailable: true,
    calories: 400,
    avgPowerW: 260,
    maxPowerW: 420,
    lapCount: 1,
    paceVariability: null,
    hrDriftPct: null,
    hillDifficulty: null,
    dedupeHash: `dedupe-${id}`,
    deletedAt: null,
    createdAt: new Date(occurredAt),
    splits: [{
      id: `split-${id}`,
      activityId: id,
      athleteId,
      splitIndex: 0,
      startOffsetS: 0,
      endOffsetS: 350,
      durationS: 350,
      distanceM: 1000,
      paceSecPerKm: 350,
      elevGainM: 10,
      elevLossM: 8,
      avgHrBpm: 150,
      maxHrBpm: 160,
      avgCadenceSpm: 172,
      createdAt: new Date(occurredAt),
    }],
    routeSignature: {
      id: `route-${id}`,
      activityId: id,
      athleteId,
      startLat: -33.9,
      startLon: 18.4,
      endLat: -33.91,
      endLon: 18.41,
      bboxMinLat: -33.91,
      bboxMinLon: 18.4,
      bboxMaxLat: -33.9,
      bboxMaxLon: 18.41,
      polyline: null,
      elevProfile: null,
      routeHash: "route-a",
      createdAt: new Date(occurredAt),
    },
    ...overrides,
  };
}

function activityPrisma() {
  const rows = [
    row("athlete-a", "activity-a-2", "2026-08-10T10:00:00.000Z"),
    row("athlete-a", "activity-a-1", "2026-08-09T10:00:00.000Z"),
    row("athlete-a", "activity-a-deleted", "2026-08-11T10:00:00.000Z", { deletedAt: NOW }),
    row("athlete-b", "activity-b-1", "2026-08-10T11:00:00.000Z"),
  ];
  return { activity: {
    findFirst: async ({ where, include, select }) => {
      const matches = rows.filter((item) => item.athleteId === where.athleteId
        && (!where.id || item.id === where.id)
        && (!where.deletedAt || item.deletedAt === null));
      const ordered = matches.sort((a, b) => b.occurredAt - a.occurredAt || b.id.localeCompare(a.id));
      const found = ordered[0] ?? null;
      if (!found) return null;
      if (select) return Object.fromEntries(Object.keys(select).map((key) => [key, found[key]]));
      return include ? found : found;
    },
    findMany: async ({ where, take }) => rows
      .filter((item) => item.athleteId === where.athleteId && item.deletedAt === null)
      .filter((item) => !where.OR || item.occurredAt < where.OR[0].occurredAt.lt
        || (item.occurredAt.getTime() === where.OR[1].occurredAt.getTime() && item.id < where.OR[1].id.lt))
      .sort((a, b) => b.occurredAt - a.occurredAt || b.id.localeCompare(a.id))
      .slice(0, take),
  } };
}

function syncPrisma() {
  const rows = [
    { cursor: 1n, athleteId: "athlete-a", entityType: "activity", entityId: "activity-a", entityVersion: 1, operation: "upsert", occurredAt: NOW, selectedFields: { id: "activity-a" } },
    { cursor: 2n, athleteId: "athlete-a", entityType: "activity", entityId: "activity-a", entityVersion: 2, operation: "delete", occurredAt: NOW, selectedFields: null },
  ];
  return { syncChange: {
    aggregate: async ({ where }) => {
      const scoped = rows.filter((item) => item.athleteId === where.athleteId);
      return { _min: { cursor: scoped[0]?.cursor ?? null }, _max: { cursor: scoped.at(-1)?.cursor ?? null } };
    },
    findMany: async ({ where, take }) => rows
      .filter((item) => item.athleteId === where.athleteId && item.cursor > where.cursor.gt)
      .slice(0, take),
  } };
}

function statusPrisma() {
  return {
    providerConnection: { findUnique: async () => ({ status: "connected", connectedAt: new Date("2026-08-01T00:00:00Z"), lastProviderContactAt: new Date("2026-08-10T11:00:00Z"), lastErrorCode: null }) },
    ingestionJob: { count: async ({ where }) => where.status.in.includes("queued") ? 1 : 0 },
    providerWebhookEvent: { findFirst: async () => ({ receivedAt: new Date("2026-08-10T10:00:00Z") }) },
    activityRevision: { findFirst: async () => ({ recordedAt: new Date("2026-08-10T11:00:00Z") }) },
    activity: { findFirst: async () => ({ occurredAt: new Date("2026-08-10T09:00:00Z") }) },
    pairedDevice: { findFirst: async () => ({ name: "Home computer", status: "active", createdAt: new Date("2026-08-01T00:00:00Z"), lastSeenAt: new Date("2026-08-08T00:00:00Z"), lastErrorCode: null }) },
    secondBrainSnapshot: { findFirst: async () => ({ sourceRevision: 7, publishedAt: new Date("2026-08-07T00:00:00Z") }) },
  };
}

function planProjection(athleteId) {
  const contentHash = athleteId === "athlete-a" ? "a".repeat(64) : "b".repeat(64);
  const plan = {
    id: `plan-${athleteId}`,
    athleteId,
    goalId: `goal-${athleteId}`,
    goalRevision: 1,
    routineRevision: 1,
    version: 1,
    revision: 1,
    startsOn: "2026-08-10",
    endsOn: "2026-08-16",
    timezone: "Africa/Johannesburg",
    weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Synthetic week", sessionIds: ["run-1"] }],
    workouts: [{ id: "run-1", kind: "run", scheduledDate: "2026-08-10", title: "Easy run", purpose: "Aerobic base", prescription: "Run easily for 30 minutes.", cautions: [], durationMinutes: 30 }],
    contextArtifactId: `context-${athleteId}`,
    createdAt: "2026-08-09T08:00:00.000Z",
    approval: { goalRationale: "Synthetic rationale", rationale: "Synthetic rationale", summary: "Synthetic plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "c".repeat(64), contentHash },
    status: "active",
    activatedAt: "2026-08-09T09:00:00.000Z",
    activatedBy: "user",
  };
  return { athleteId, planId: plan.id, planVersion: 1, planStatus: "active", active: true, contentHash, plan };
}

function coachingPrisma(rows) {
  return { trainingPlanProjection: {
    findMany: async ({ where, take }) => rows
      .filter((row) => row.athleteId === where.athleteId)
      .filter((row) => where.active === undefined || row.active === where.active)
      .filter((row) => !where.planStatus || where.planStatus.in.includes(row.planStatus))
      .slice(0, take),
    findUnique: async ({ where }) => rows.find((row) => row.athleteId === where.athleteId_planId.athleteId
      && row.planId === where.athleteId_planId.planId) ?? null,
  } };
}
