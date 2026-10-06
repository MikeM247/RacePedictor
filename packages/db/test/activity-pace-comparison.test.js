import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { activity, artifact, plan } from "../../core/test/fixtures/pace-comparison.ts";
import { paceArtifactSchema } from "../../core/src/contracts/activity-pace-comparison.ts";
import { publishedComparison } from "../../core/src/services/activity-pace-comparison.ts";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import { PrismaActivityPaceComparisonRepository } from "../src/cloud/prisma-activity-pace-comparison-repository.js";
import { cachePaceComparison, getLocalPaceComparison } from "../src/local-activity-pace-comparison.js";
import { LocalSyncProjectionRepository } from "../src/local-sync-projection.js";
import { openLocalDatabase, LOCAL_DATABASE_SCHEMA_VERSION } from "../src/local-database.js";

const scope = athleteScopeFor(buildActorContext({ userId: "device:device-a", permittedAthleteIds: [activity.athleteId], activeAthleteId: activity.athleteId, requestId: "pace-request", credentialKind: "device" }));
function fake() {
  const rows = [], state = { revision: 3, plan: structuredClone(plan), device: "active", activity: structuredClone(activity) };
  const prisma = {
    activity: { findFirst: async ({ where }) => where.athleteId === state.activity.athleteId && where.id === state.activity.id ? state.activity : null },
    activityRevision: { findFirst: async () => ({ revisionNumber: state.revision }) },
    pairedDevice: { findUnique: async () => ({ status: state.device }) },
    trainingPlanProjection: { findUnique: async ({ where }) => where.athleteId_planId.planId === state.plan.id ? { plan: state.plan } : null },
    calendarSessionAmendment: { findMany: async () => [] },
    activityPaceComparison: {
      findFirst: async ({ where }) => rows.filter(r => r.activityId === where.activityId && r.athleteId === where.athleteId).at(-1) ?? null,
      findUnique: async ({ where }) => rows.find(r => r.artifactId === where.athleteId_activityId_artifactId.artifactId) ?? null,
      create: async ({ data }) => { rows.push(data); return data; },
    },
    $transaction: async (action, options) => { assert.equal(options.isolationLevel, "Serializable"); return action(prisma); },
  };
  return { prisma, rows, state, repository: new PrismaActivityPaceComparisonRepository({ prisma }) };
}
test("publication is immutable, idempotent, source checked and revision fenced", async () => {
  const { repository, rows, state } = fake();
  assert.equal((await repository.read(scope, activity.id)).data.status, "none");
  assert.equal((await repository.context(scope, activity.id, plan.id, "race-session")).activityRevision, 3);
  const saved = await repository.publish(scope, artifact(), "device-a");
  assert.equal(saved.revision, 1);
  assert.deepEqual(await repository.publish(scope, artifact(), "device-a"), saved); assert.equal(rows.length, 1);
  await assert.rejects(repository.publish(scope, artifact({ blocks: [] }), "device-a"), /different/);
  await assert.rejects(repository.publish(scope, artifact({ artifactId: "new" }), "device-a"), /changed/);
  assert.equal((await repository.publish(scope, artifact({ artifactId: "new", expectedComparisonRevision: 1 }), "device-a")).revision, 2);
  assert.equal(rows.length, 2);
  state.activity.splits[0].paceSecPerKm = 400;
  assert.equal((await repository.read(scope, activity.id)).data.status, "stale");
  state.device = "revoked";
  await assert.rejects(repository.publish(scope, artifact(), "device-a"), /unavailable/);
});
test("cross-athlete, stale activity and mismatched source are rejected", async () => {
  const { repository } = fake();
  await assert.rejects(repository.publish(scope, artifact({ athleteId: "other" }), "device-a"), /scope/);
  await assert.rejects(repository.publish(scope, artifact({ expectedActivityRevision: 2 }), "device-a"), /changed/);
  await assert.rejects(repository.publish(scope, artifact({ source: { ...artifact().source, prescription: "fabricated" } }), "device-a"), /source/);
});
test("serializable conflicts surface as reload/review outcomes", async () => {
  const { prisma, repository } = fake();
  prisma.$transaction = async () => { throw { code: "P2034" }; };
  await assert.rejects(repository.publish(scope, artifact(), "device-a"), /Concurrent/);
});
test("SQLite migration and accepted-receipt cache preserve revisions", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rp-pace-")), databasePath = path.join(directory, "test.sqlite");
  const saved = publishedComparison(paceArtifactSchema.parse(artifact()), "2026-10-06T09:00:00.000Z");
  cachePaceComparison({ databasePath, comparison: saved }); cachePaceComparison({ databasePath, comparison: saved });
  assert.throws(() => cachePaceComparison({ databasePath, comparison: { ...saved, artifactHash: "f".repeat(64) } }), /different/);
  const db = openLocalDatabase({ databasePath });
  try { assert.equal(db.prepare("SELECT COUNT(*) AS count FROM local_activity_pace_comparisons").get().count, 1); assert.equal(db.prepare("SELECT MAX(version) AS version FROM local_schema_migrations").get().version, LOCAL_DATABASE_SCHEMA_VERSION); } finally { db.close(); }
});

test("local projections read the same approved comparison and detect provider corrections", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rp-pace-local-")), databasePath = path.join(directory, "test.sqlite");
  const projection = new LocalSyncProjectionRepository({ databasePath });
  const change = (revision, payload) => ({ cursor: String(revision), athleteId: activity.athleteId, entityType: "activity", entityId: activity.id, entityRevision: revision, operation: "upsert", changedAt: "2026-10-06T10:00:00.000Z", payload });
  projection.applyChanges(activity.athleteId, [change(1, activity)]);
  const db = openLocalDatabase({ databasePath });
  const localId = db.prepare("SELECT local_activity_id AS id FROM cloud_activity_mappings WHERE cloud_activity_id = ?").get(activity.id).id;
  db.close();
  const options = { databasePath, athleteId: activity.athleteId, activityId: localId };
  assert.equal(getLocalPaceComparison(options).data.status, "none");
  cachePaceComparison({ databasePath, comparison: publishedComparison(paceArtifactSchema.parse(artifact()), "2026-10-06T10:00:00.000Z") });
  assert.equal(getLocalPaceComparison(options).data.status, "ready");
  assert.throws(() => getLocalPaceComparison({ ...options, athleteId: "foreign" }), /not found/);
  const corrected = structuredClone(activity); corrected.splits[0].paceSecPerKm = 360;
  projection.applyChanges(activity.athleteId, [change(2, corrected)]);
  assert.equal(getLocalPaceComparison(options).data.status, "stale");
});
