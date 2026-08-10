import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import {
  PrismaStravaIngestionUnitOfWork,
  StravaCredentialAdapter,
} from "../src/cloud/index.js";

const NOW = "2026-08-10T10:00:00.000Z";
const athleteA = "athlete-a";
const athleteB = "athlete-b";
const scopeA = scope(athleteA);
const scopeB = scope(athleteB);

test("credential adapter refreshes at the one-hour boundary and reloads every rotated token", async () => {
  let credentials = grant("access-1", "refresh-1", "2026-08-10T11:00:00.000Z");
  const refreshTokens = [];
  const connections = {
    async getCredentials() { return { ...credentials }; },
  };
  const connectionService = {
    async refresh() {
      refreshTokens.push(credentials.refreshToken);
      const revision = refreshTokens.length + 1;
      credentials = grant(`access-${revision}`, `refresh-${revision}`, `2026-08-10T13:00:00.000Z`);
    },
  };
  const adapter = new StravaCredentialAdapter({
    connections,
    connectionService,
    now: () => new Date(NOW),
  });

  assert.equal(await adapter.getAccessToken(scopeA), "access-2");
  assert.equal(await adapter.refreshAccessToken(scopeA), "access-3");
  assert.deepEqual(refreshTokens, ["refresh-1", "refresh-2"]);

  credentials = grant("access-future", "refresh-future", "2026-08-10T11:00:00.001Z");
  assert.equal(await adapter.getAccessToken(scopeA), "access-future");
  assert.deepEqual(refreshTokens, ["refresh-1", "refresh-2"]);
});

test("canonical transaction creates, updates, and idempotently replays with sync and analytics", async () => {
  const prisma = new MemoryPrisma();
  prisma.addConnection(athleteA);
  const unitOfWork = new PrismaStravaIngestionUnitOfWork({ prisma });
  const firstActivity = activity(athleteA);

  const first = await applyUpsert(unitOfWork, scopeA, firstActivity, rawObjects(athleteA));
  const replay = await applyUpsert(unitOfWork, scopeA, firstActivity, rawObjects(athleteA));
  const updatedActivity = { ...firstActivity, title: "Updated run" };
  const updatedRaw = rawObjects(athleteA, "b");
  const updated = await applyUpsert(unitOfWork, scopeA, updatedActivity, updatedRaw, "update");

  assert.deepEqual(first, { revision: 1, created: true, changed: true });
  assert.deepEqual(replay, { revision: 1, created: false, changed: false });
  assert.deepEqual(updated, { revision: 2, created: false, changed: true });
  assert.equal(prisma.state.activities.get(`${athleteA}|activity_strava_101`).title, "Updated run");
  assert.equal(prisma.state.splits.length, 1);
  assert.equal(prisma.state.routes.size, 1);
  assert.equal(prisma.state.rawObjects.size, 6);
  assert.equal(prisma.state.revisions.length, 2);
  assert.deepEqual(prisma.state.sync.map((change) => [change.cursor, change.entityVersion]), [[1n, 1], [2n, 2]]);
  assert.equal(prisma.state.markers.size, 1);
});

test("resolution merges exact manual overlap and reports ambiguous fuzzy overlap", async () => {
  const prisma = new MemoryPrisma();
  const unitOfWork = new PrismaStravaIngestionUnitOfWork({ prisma });
  prisma.addActivity(manualActivity(athleteA, "manual-exact", "dedupe-101", NOW));

  const exact = await unitOfWork.run(scopeA, ({ activities }) => activities.resolveTarget(candidate("dedupe-101")));
  assert.equal(exact.kind, "manual_match");
  assert.equal(exact.activityId, "manual-exact");
  assert.equal(exact.canonicalSource.sourceType, "manual");

  prisma.addActivity(manualActivity(athleteA, "manual-fuzzy-1", "other-1", "2026-08-10T10:02:00.000Z"));
  prisma.addActivity(manualActivity(athleteA, "manual-fuzzy-2", "other-2", "2026-08-10T09:58:00.000Z"));
  const ambiguous = await unitOfWork.run(scopeA, ({ activities }) => activities.resolveTarget(candidate("no-exact")));
  assert.deepEqual(ambiguous, { kind: "ambiguous", candidateCount: 3 });
});

test("a downstream failure rolls back canonical, raw, revision, sync, and analytics state", async () => {
  const prisma = new MemoryPrisma();
  prisma.addConnection(athleteA);
  prisma.failAnalytics = true;
  const unitOfWork = new PrismaStravaIngestionUnitOfWork({ prisma });

  await assert.rejects(
    applyUpsert(unitOfWork, scopeA, activity(athleteA), rawObjects(athleteA)),
    /synthetic analytics failure/,
  );
  assert.equal(prisma.state.activities.size, 0);
  assert.equal(prisma.state.rawObjects.size, 0);
  assert.equal(prisma.state.sources.size, 0);
  assert.equal(prisma.state.revisions.length, 0);
  assert.equal(prisma.state.sync.length, 0);
  assert.equal(prisma.state.markers.size, 0);
});

test("delete is tombstoned once and emits athlete-local sync plus analytics marker", async () => {
  const prisma = new MemoryPrisma();
  prisma.addConnection(athleteA);
  const unitOfWork = new PrismaStravaIngestionUnitOfWork({ prisma });
  await applyUpsert(unitOfWork, scopeA, activity(athleteA), rawObjects(athleteA));

  const first = await applyDelete(unitOfWork, scopeA);
  const replay = await applyDelete(unitOfWork, scopeA);
  assert.deepEqual(first, { revision: 2, changed: true });
  assert.deepEqual(replay, { revision: 2, changed: false });
  assert.ok(prisma.state.activities.get(`${athleteA}|activity_strava_101`).deletedAt instanceof Date);
  assert.deepEqual(prisma.state.sync.map((change) => [change.cursor, change.operation]), [[1n, "upsert"], [2n, "delete"]]);
  assert.equal(prisma.state.markers.get(`${athleteA}|activity_strava_101`).reason, "activity_delete");
});

test("deleting a matched Strava source preserves the manual canonical activity and can reactivate the source", async () => {
  const prisma = new MemoryPrisma();
  prisma.addConnection(athleteA);
  prisma.addActivity(manualActivity(athleteA, "manual-exact", "dedupe-101", NOW));
  const unitOfWork = new PrismaStravaIngestionUnitOfWork({ prisma });
  const manualCanonical = {
    ...activity(athleteA),
    id: "manual-exact",
    sourceType: "manual",
    sourceActivityId: "manual-exact",
  };

  await applyUpsert(unitOfWork, scopeA, manualCanonical, rawObjects(athleteA));
  const deletion = await applyDelete(unitOfWork, scopeA);

  assert.deepEqual(deletion, { revision: 1, changed: false });
  assert.equal(prisma.state.activities.get(`${athleteA}|manual-exact`).deletedAt, null);
  assert.ok(prisma.state.sources.get(`${athleteA}|strava|101`).deletedAt instanceof Date);
  assert.deepEqual(prisma.state.sync.map((change) => change.operation), ["upsert"]);
  assert.equal(prisma.state.markers.get(`${athleteA}|manual-exact`).reason, "activity_upsert");

  await applyUpsert(unitOfWork, scopeA, manualCanonical, rawObjects(athleteA, "b"), "update");
  assert.equal(prisma.state.sources.get(`${athleteA}|strava|101`).deletedAt, null);
  assert.equal(prisma.state.activities.get(`${athleteA}|manual-exact`).sourceType, "manual");
});

test("the same provider id and sync cursor remain isolated between athletes", async () => {
  const prisma = new MemoryPrisma();
  prisma.addConnection(athleteA);
  prisma.addConnection(athleteB);
  const unitOfWork = new PrismaStravaIngestionUnitOfWork({ prisma });

  await applyUpsert(unitOfWork, scopeA, activity(athleteA), rawObjects(athleteA));
  await applyUpsert(unitOfWork, scopeB, activity(athleteB), rawObjects(athleteB));
  const targetA = await unitOfWork.run(scopeA, ({ activities }) => activities.resolveTarget(candidate("dedupe-101")));
  const targetB = await unitOfWork.run(scopeB, ({ activities }) => activities.resolveTarget(candidate("dedupe-101")));

  assert.equal(targetA.activityId, "activity_strava_101");
  assert.equal(targetB.activityId, "activity_strava_101");
  assert.deepEqual(prisma.state.sync.map((change) => [change.athleteId, change.cursor]), [[athleteA, 1n], [athleteB, 1n]]);
  assert.equal(prisma.state.activities.size, 2);
  await assert.rejects(
    unitOfWork.run(scopeA, ({ activities }) => activities.upsert({
      providerActivityId: "101",
      activity: activity(athleteB),
      rawObjects: rawObjects(athleteB),
      source: "webhook",
      aspect: "update",
      providerObservedAt: NOW,
      providerCapturedAt: NOW,
    })),
    /athlete scope/,
  );
});

async function applyUpsert(unitOfWork, athleteScope, canonical, raw, aspect = "create") {
  return unitOfWork.run(athleteScope, async ({ activities, sync, analytics }) => {
    const result = await activities.upsert({
      providerActivityId: "101",
      activity: canonical,
      rawObjects: raw,
      source: "webhook",
      aspect,
      providerObservedAt: NOW,
      providerCapturedAt: NOW,
    });
    if (result.changed) {
      await sync.append({
        entityId: canonical.id,
        entityRevision: result.revision,
        operation: "upsert",
        changedAt: NOW,
        payload: canonical,
      });
      await analytics.requestActivityRecompute({
        activityId: canonical.id,
        occurredAt: canonical.occurredAt,
        reason: "activity_upsert",
      });
    }
    return { revision: result.revision, created: result.created, changed: result.changed };
  });
}

async function applyDelete(unitOfWork, athleteScope) {
  return unitOfWork.run(athleteScope, async ({ activities, sync, analytics }) => {
    const result = await activities.tombstone({
      providerActivityId: "101",
      changedAt: "2026-08-10T12:00:00.000Z",
      reason: "provider_delete",
    });
    if (result.changed) {
      await sync.append({
        entityId: result.activityId,
        entityRevision: result.revision,
        operation: "delete",
        changedAt: "2026-08-10T12:00:00.000Z",
        payload: null,
      });
      await analytics.requestActivityRecompute({
        activityId: result.activityId,
        occurredAt: result.occurredAt,
        reason: "activity_delete",
      });
    }
    return { revision: result.revision, changed: result.changed };
  });
}

function activity(athleteId) {
  return {
    id: "activity_strava_101",
    athleteId,
    title: "Morning run",
    occurredAt: NOW,
    localOccurredAt: "2026-08-10T12:00:00",
    endedAt: "2026-08-10T10:30:00.000Z",
    sport: "run",
    distanceM: 5_000,
    elapsedTimeS: 1_800,
    movingTimeS: 1_750,
    avgPaceSecPerKm: 350,
    elevationGainM: 50,
    elevationLossM: 45,
    hrAvailable: true,
    cadenceAvailable: true,
    avgHrBpm: 150,
    maxHrBpm: 170,
    avgCadenceSpm: 172,
    calories: 400,
    avgPowerW: 260,
    maxPowerW: 420,
    lapCount: 1,
    sourceType: "strava",
    sourceActivityId: "101",
    dedupeHash: "dedupe-101",
    createdAt: NOW,
    splits: [{
      id: "split-1",
      activityId: "activity_strava_101",
      athleteId,
      splitIndex: 0,
      startOffsetS: 0,
      endOffsetS: 350,
      durationS: 350,
      distanceM: 1_000,
      paceSecPerKm: 350,
      elevGainM: 10,
      elevLossM: 8,
      createdAt: NOW,
    }],
    routeSignature: {
      id: "route-1",
      activityId: "activity_strava_101",
      athleteId,
      startLat: -33.9,
      startLon: 18.4,
      endLat: -33.91,
      endLon: 18.41,
      bboxMinLat: -33.91,
      bboxMinLon: 18.4,
      bboxMaxLat: -33.9,
      bboxMaxLon: 18.41,
      routeHash: "route-hash",
      createdAt: NOW,
    },
  };
}

function manualActivity(athleteId, id, dedupeHash, occurredAt) {
  return {
    ...activity(athleteId),
    id,
    sourceType: "manual",
    sourceActivityId: id,
    dedupeHash,
    occurredAt: new Date(occurredAt),
    createdAt: new Date(NOW),
    deletedAt: null,
  };
}

function candidate(dedupeHash) {
  return {
    providerActivityId: "101",
    occurredAt: NOW,
    sport: "run",
    elapsedTimeS: 1_800,
    distanceM: 5_000,
    elevationGainM: 50,
    dedupeHash,
  };
}

function rawObjects(athleteId, checksumPrefix = "a") {
  return Object.fromEntries(["detail", "laps", "streams"].map((kind, index) => [kind, {
    athleteId,
    provider: "strava",
    key: `athletes/${athleteId}/strava/101/${kind}-${checksumPrefix}.json`,
    checksumSha256: String.fromCharCode(checksumPrefix.charCodeAt(0) + index).repeat(64),
    contentType: "application/json",
    sizeBytes: 100 + index,
    capturedAt: NOW,
  }]));
}

function grant(accessToken, refreshToken, expiresAt) {
  return { providerAthleteId: "123", accessToken, refreshToken, expiresAt, scopes: ["activity:read_all"] };
}

function scope(athleteId) {
  return athleteScopeFor(buildActorContext({
    userId: `user-${athleteId}`,
    permittedAthleteIds: [athleteId],
    activeAthleteId: athleteId,
    requestId: `request-${athleteId}`,
    credentialKind: "internal",
  }));
}

class MemoryPrisma {
  state = emptyState();
  failAnalytics = false;
  nextId = 1;

  addConnection(athleteId) {
    this.state.connections.set(athleteId, { id: `connection-${athleteId}`, athleteId, provider: "strava" });
  }

  addActivity(value) {
    this.state.activities.set(`${value.athleteId}|${value.id}`, { ...value });
  }

  async $transaction(operation) {
    const snapshot = structuredClone(this.state);
    const nextId = this.nextId;
    try {
      return await operation(this.#client());
    } catch (error) {
      this.state = snapshot;
      this.nextId = nextId;
      throw error;
    }
  }

  #client() {
    const db = this;
    return {
      providerConnection: {
        findUnique: async ({ where }) => db.state.connections.get(where.athleteId_provider.athleteId) ?? null,
      },
      activity: {
        findUnique: async ({ where }) => {
          if (where.id_athleteId) return db.state.activities.get(`${where.id_athleteId.athleteId}|${where.id_athleteId.id}`) ?? null;
          const { athleteId, dedupeHash } = where.athleteId_dedupeHash;
          return [...db.state.activities.values()].find((row) => row.athleteId === athleteId && row.dedupeHash === dedupeHash) ?? null;
        },
        findMany: async ({ where }) => [...db.state.activities.values()].filter((row) => {
          return row.athleteId === where.athleteId
            && where.sourceType.in.includes(row.sourceType)
            && row.sport === where.sport
            && !row.deletedAt
            && new Date(row.occurredAt) >= where.occurredAt.gte
            && new Date(row.occurredAt) <= where.occurredAt.lte;
        }),
        create: async ({ data }) => {
          const row = { ...data };
          db.state.activities.set(`${data.athleteId}|${data.id}`, row);
          return row;
        },
        update: async ({ where, data }) => {
          const key = `${where.id_athleteId.athleteId}|${where.id_athleteId.id}`;
          const row = { ...db.state.activities.get(key), ...data };
          db.state.activities.set(key, row);
          return row;
        },
      },
      activitySourceReference: {
        findUnique: async ({ where, include }) => {
          const key = sourceKey(where.athleteId_sourceType_sourceObjectId);
          const source = db.state.sources.get(key);
          if (!source) return null;
          return include?.activity
            ? { ...source, activity: db.state.activities.get(`${source.athleteId}|${source.activityId}`) ?? null }
            : source;
        },
        upsert: async ({ where, create, update }) => {
          const key = sourceKey(where.athleteId_sourceType_sourceObjectId);
          const row = db.state.sources.has(key)
            ? { ...db.state.sources.get(key), ...update }
            : { id: db.id("source"), ...create };
          db.state.sources.set(key, row);
          return row;
        },
        update: async ({ where, data }) => {
          const key = sourceKey(where.athleteId_sourceType_sourceObjectId);
          const row = { ...db.state.sources.get(key), ...data };
          db.state.sources.set(key, row);
          return row;
        },
      },
      rawObject: {
        findUnique: async ({ where }) => [...db.state.rawObjects.values()].find((row) => {
          const key = where.storageProvider_storageKey;
          return row.storageProvider === key.storageProvider && row.storageKey === key.storageKey;
        }) ?? null,
        findFirst: async ({ where }) => [...db.state.rawObjects.values()]
          .filter((row) => row.athleteId === where.athleteId
            && row.provider === where.provider
            && row.kind === where.kind
            && row.providerObjectId === where.providerObjectId)
          .sort((left, right) => right.objectVersion - left.objectVersion)[0] ?? null,
        create: async ({ data }) => {
          const row = { id: db.id("raw"), ...data };
          db.state.rawObjects.set(row.id, row);
          return row;
        },
      },
      activitySplitKm: {
        deleteMany: async ({ where }) => {
          db.state.splits = db.state.splits.filter((row) => row.athleteId !== where.athleteId || row.activityId !== where.activityId);
        },
        createMany: async ({ data }) => { db.state.splits.push(...data.map((row) => ({ ...row }))); },
      },
      routeSignature: {
        deleteMany: async ({ where }) => { db.state.routes.delete(`${where.athleteId}|${where.activityId}`); },
        upsert: async ({ where, create, update }) => {
          const key = `${where.activityId_athleteId.athleteId}|${where.activityId_athleteId.activityId}`;
          const row = db.state.routes.has(key) ? { ...db.state.routes.get(key), ...update } : { ...create };
          db.state.routes.set(key, row);
          return row;
        },
      },
      activityRevision: {
        findFirst: async ({ where }) => db.state.revisions
          .filter((row) => row.athleteId === where.athleteId && row.activityId === where.activityId)
          .sort((left, right) => right.revisionNumber - left.revisionNumber)[0] ?? null,
        create: async ({ data }) => {
          const row = { id: db.id("revision"), ...data };
          db.state.revisions.push(row);
          return row;
        },
      },
      syncChange: {
        aggregate: async ({ where }) => ({
          _max: {
            cursor: db.state.sync.filter((row) => row.athleteId === where.athleteId)
              .reduce((max, row) => row.cursor > max ? row.cursor : max, 0n) || null,
          },
        }),
        create: async ({ data }) => {
          const row = { id: db.id("sync"), ...data };
          db.state.sync.push(row);
          return row;
        },
      },
      analyticsRecomputeMarker: {
        upsert: async ({ where, create, update }) => {
          if (db.failAnalytics) throw new Error("synthetic analytics failure");
          const key = `${where.athleteId_activityId.athleteId}|${where.athleteId_activityId.activityId}`;
          const row = db.state.markers.has(key) ? { ...db.state.markers.get(key), ...update } : { id: db.id("marker"), ...create };
          db.state.markers.set(key, row);
          return row;
        },
      },
    };
  }

  id(prefix) {
    return `${prefix}-${this.nextId++}`;
  }
}

function emptyState() {
  return {
    connections: new Map(),
    activities: new Map(),
    sources: new Map(),
    rawObjects: new Map(),
    splits: [],
    routes: new Map(),
    revisions: [],
    sync: [],
    markers: new Map(),
  };
}

function sourceKey(value) {
  return `${value.athleteId}|${value.sourceType}|${value.sourceObjectId}`;
}
