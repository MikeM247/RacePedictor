import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { InMemoryDeviceCredentialStore, WindowsDpapiCredentialStore } from "../src/device-credential-store.js";
import { LocalCloudSyncAgent } from "../src/local-sync-agent.js";
import { createLocalCoachingRepository } from "../src/local-coaching-repository.js";
import { CLOUD_SYNC_END, CLOUD_SYNC_START, renderCloudSyncSummary, updateCloudSyncNote } from "../src/local-sync-note.js";
import { LocalSyncProjectionRepository } from "../src/local-sync-projection.js";

const athleteId = "athlete-a";
const token = "rpd1.device_local123.abcdefghijklmnopqrstuvwxyz_1234567890-ABCDE";
const NOW = "2026-08-10T10:00:00.000Z";

test("initial and incremental sync project activities/plans/calendar, preserve user bytes, and acknowledge after cursor commit", async () => {
  const fixture = await localFixture();
  const notePrefix = "# Personal dashboard\r\n\r\nMy private note stays byte-for-byte.\r\n";
  await mkdir(path.dirname(fixture.notePath), { recursive: true });
  await writeFile(fixture.notePath, notePrefix, "utf8");
  const pages = [
    response([
      change("1", "activity", "activity-a", 1, activity({ title: "First run" })),
      change("2", "plan", "plan-a", 1, { id: "plan-a", status: "active", title: "Approved plan" }),
      change("3", "calendar_session", "session-a", 1, { id: "session-a", scheduledDate: "2026-08-11" }),
    ], true),
    response([change("4", "activity_revision", "activity-a:2", 2, { activityId: "activity-a", reason: "provider_update" })], false),
  ];
  const acknowledgements = [];
  const agent = await agentFor(fixture, {
    getChanges: async (_token, { after }) => {
      assert.equal(_token, token);
      assert.equal(after, pages.length === 2 ? null : "3");
      return pages.shift();
    },
    acknowledge: async (_token, cursor) => { acknowledgements.push(cursor); },
  });
  const result = await agent.sync({ pageSize: 3 });
  assert.deepEqual(result, { athleteId, cursor: "4", applied: 4, status: "current" });
  assert.deepEqual(acknowledgements, ["3", "4"]);
  assert.equal(fixture.projection.getCursor(athleteId), "4");
  assert.deepEqual(fixture.projection.listEntities(athleteId).map((item) => item.entityType).sort(), [
    "activity", "activity_revision", "calendar_session", "plan",
  ]);
  const note = await readFile(fixture.notePath, "utf8");
  assert.equal(note.slice(0, notePrefix.length), notePrefix);
  assert.equal((note.match(new RegExp(CLOUD_SYNC_START, "g")) ?? []).length, 1);
  assert.equal((note.match(new RegExp(CLOUD_SYNC_END, "g")) ?? []).length, 1);
  assert.match(note, /Workouts available locally: 1/u);
  const database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT title FROM activities WHERE athlete_id = ?").get(athleteId).title, "First run");
  database.close();
});

test("local note failure leaves cursor unchanged and replay is idempotent before recovery", async () => {
  const fixture = await localFixture();
  const batch = response([change("1", "activity", "activity-a", 1, activity())], false);
  let failed = false;
  const failing = await agentFor(fixture, {
    getChanges: async () => batch,
    acknowledge: async () => { throw new Error("must not acknowledge"); },
  }, {
    noteWriter: async () => { failed = true; throw new Error("disk full"); },
  });
  await assert.rejects(() => failing.sync(), /disk full/u);
  assert.equal(failed, true);
  assert.equal(fixture.projection.getCursor(athleteId), null);
  assert.equal(fixture.projection.listEntities(athleteId).length, 1, "entity stage is replay-safe even though cursor is held");

  let acknowledged;
  const recovered = await agentFor(fixture, {
    getChanges: async () => batch,
    acknowledge: async (_token, cursor) => { acknowledged = cursor; },
  });
  const result = await recovered.sync();
  assert.equal(result.cursor, "1");
  assert.equal(acknowledged, "1");
  assert.equal(fixture.projection.listEntities(athleteId).length, 1);
});

test("cloud outage after local commit resumes from the cursor and repairs acknowledgement", async () => {
  const fixture = await localFixture();
  let first = true;
  const initial = await agentFor(fixture, {
    getChanges: async () => response([change("1", "activity", "activity-a", 1, activity())], false),
    acknowledge: async () => { throw new Error("offline"); },
  });
  await assert.rejects(() => initial.sync(), /offline/u);
  assert.equal(fixture.projection.getCursor(athleteId), "1");

  const acknowledgements = [];
  const resumed = await agentFor(fixture, {
    getChanges: async (_token, { after }) => {
      assert.equal(after, "1");
      first = false;
      return response([], false, "1");
    },
    acknowledge: async (_token, cursor) => { acknowledgements.push(cursor); },
  });
  const result = await resumed.sync();
  assert.equal(first, false);
  assert.equal(result.applied, 0);
  assert.deepEqual(acknowledgements, ["1"]);
});

test("corrections replace structured activity fields and tombstones remove the local projection", async () => {
  const fixture = await localFixture();
  fixture.projection.applyChanges(athleteId, [change("1", "activity", "activity-a", 1, activity({ title: "Old title" }))]);
  fixture.projection.applyChanges(athleteId, [change("2", "activity", "activity-a", 2, activity({ title: "Corrected title" }))]);
  let database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT title FROM activities WHERE id = ?").get("activity-a").title, "Corrected title");
  database.close();
  fixture.projection.applyChanges(athleteId, [change("3", "activity", "activity-a", 3, null, "delete")]);
  database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM activities WHERE id = ?").get("activity-a").count, 0);
  database.close();
  assert.equal(fixture.projection.listEntities(athleteId)[0].operation, "delete");
});

test("approved cloud plan selection updates the local active plan and settled goal on the next pull", async () => {
  const fixture = await localFixture();
  const coaching = createLocalCoachingRepository({ databasePath: fixture.databasePath, athleteId, clock: () => new Date(NOW) });
  const firstGoal = coaching.settleGoal(coaching.createGoal({ goalType: "race", title: "First goal", targetDate: "2026-09-06" }).id);
  const firstPlan = coaching.activatePlan(coaching.saveValidatedPlan({
    goalId: firstGoal.id,
    title: "First approved plan",
    startDate: "2026-08-10",
    endDate: "2026-08-16",
    workouts: [{ localDate: "2026-08-10", title: "First run", workoutType: "run", durationMinutes: 30 }],
  }).id);
  const secondGoal = coaching.settleGoal(coaching.createGoal({ goalType: "race", title: "Second goal", targetDate: "2026-10-04" }).id);
  const secondPlan = coaching.activatePlan(coaching.saveValidatedPlan({
    goalId: secondGoal.id,
    title: "Second approved plan",
    startDate: "2026-08-10",
    endDate: "2026-08-16",
    workouts: [{ localDate: "2026-08-11", title: "Second run", workoutType: "run", durationMinutes: 35 }],
  }).id);
  coaching.close();

  const selectedAt = "2026-08-11T12:00:00.000Z";
  fixture.projection.applyChanges(athleteId, [
    change("1", "plan", secondPlan.id, 3, structuredPlan(secondPlan, "retired", selectedAt)),
    change("2", "plan", firstPlan.id, 4, structuredPlan(firstPlan, "active", selectedAt)),
  ]);

  const database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  const activePlan = database.prepare("SELECT id, revision FROM coaching_plans WHERE athlete_id = ? AND lifecycle = 'active'").get(athleteId);
  const settledGoal = database.prepare("SELECT id FROM coaching_goals WHERE athlete_id = ? AND lifecycle = 'settled' AND is_primary = 1").get(athleteId);
  database.close();
  assert.equal(activePlan.id, firstPlan.id);
  assert.equal(activePlan.revision, 4);
  assert.equal(settledGoal.id, firstGoal.id);

  fixture.projection.applyChanges(athleteId, [
    change("3", "calendar_session", firstPlan.workouts[0].id, 4, structuredPlan(firstPlan, "active", selectedAt).workouts[0]),
  ]);
  const rendered = renderCloudSyncSummary({
    cursor: "3",
    entities: fixture.projection.getCloudSyncNoteProjection(athleteId),
  });
  assert.match(rendered, new RegExp(`Plan: ${firstPlan.id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"));
  assert.match(rendered, /Calendar sessions[\s\S]*First run \(upcoming\)/u);
});

test("selected Second Brain publication sends only allow-listed structured fields while source references remain local", async () => {
  const fixture = await localFixture();
  let sent;
  let publishCalls = 0;
  const client = {
    getChanges: async () => response([], false), acknowledge: async () => {},
    publishSecondBrain: async (_token, snapshot) => { publishCalls += 1; sent = snapshot; return { data: { snapshot, reused: false } }; },
  };
  const agent = await agentFor(fixture, client);
  const result = await agent.publishSelectedSecondBrain({
    selectedFields: ["availability", "wellbeingCheckIns"],
    sourceContext: {
      availability: { weeklyMinutesBudget: 300 },
      wellbeingCheckIns: [{ recordedOn: "2026-08-10", energy: 4, fatigue: 2, soreness: 1, sleepQuality: 4, stress: 2 }],
    },
    logicalSourceRefs: ["weekly-availability", "morning-check-in"],
  });
  assert.equal(result.snapshot.revision, 1);
  assert.deepEqual(Object.keys(sent.context), ["availability", "wellbeingCheckIns"]);
  assert.doesNotMatch(JSON.stringify(sent), /weekly-availability|morning-check-in|vault|path|notes/u);
  const database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  const local = database.prepare("SELECT logical_source_refs_json AS refs FROM local_second_brain_publications").get();
  database.close();
  assert.deepEqual(JSON.parse(local.refs), ["weekly-availability", "morning-check-in"]);
  const unchanged = await agent.publishSelectedSecondBrain({
    selectedFields: ["availability", "wellbeingCheckIns"],
    sourceContext: {
      availability: { weeklyMinutesBudget: 300 },
      wellbeingCheckIns: [{ recordedOn: "2026-08-10", energy: 4, fatigue: 2, soreness: 1, sleepQuality: 4, stress: 2 }],
    },
    logicalSourceRefs: ["weekly-availability", "morning-check-in"],
  });
  assert.equal(unchanged.skipped, true);
  assert.equal(publishCalls, 1, "unchanged content does not create another immutable revision");
  await assert.rejects(() => agent.publishSelectedSecondBrain({
    selectedFields: ["availability"],
    sourceContext: { availability: { weeklyMinutesBudget: 300 } },
    logicalSourceRefs: ["Vault/Private.md"],
  }), /must not contain paths/u);
  assert.equal(publishCalls, 1, "invalid local source metadata is rejected before a cloud write");
});

test("scheduled sync runner invokes the combined pull-and-publish command", async () => {
  const runnerPath = path.resolve(import.meta.dirname, "..", "scripts", "run-local-sync-task.ps1");
  const runner = await readFile(runnerPath, "utf8");
  assert.match(runner, /npm\.cmd run sync:local -- sync-and-publish/u);
});

test("explicit approved-plan publication attempts verified goal context after the plan and reports pending separately", async () => {
  const fixture = await localFixture();
  const calls = [];
  const plan = { id: "plan-a", status: "active" };
  const context = { planId: "plan-a", contextHash: "a".repeat(64) };
  const agent = await agentFor(fixture, {
    publishApprovedPlan: async (_token, value) => { calls.push(["plan", value]); return { data: { plan: value } }; },
    publishPlanGoalContext: async (_token, value) => { calls.push(["goal-context", value]); return { data: { contextHash: value.contextHash, publishedAt: NOW, reused: false } }; },
  });

  const published = await agent.publishApprovedPlan(plan, context);
  assert.equal(published.goalContext.state, "ready");
  assert.deepEqual(calls.map(([kind]) => kind), ["plan", "goal-context"]);

  const unavailable = await agent.publishApprovedPlan(plan);
  assert.equal(unavailable.goalContext.state, "unavailable");
  assert.equal(calls.length, 3, "an unverified source never triggers sidecar publication");
});

test("explicit approved-plan publication preserves the plan and reports sidecar failure as pending", async () => {
  const fixture = await localFixture();
  const agent = await agentFor(fixture, {
    publishApprovedPlan: async (_token, plan) => ({ data: { plan } }),
    publishPlanGoalContext: async () => { throw Object.assign(new Error("synthetic unavailable"), { code: "CLOUD_UNAVAILABLE" }); },
  });
  const result = await agent.publishApprovedPlan({ id: "plan-a", status: "active" }, { planId: "plan-a" });
  assert.equal(result.data.plan.id, "plan-a");
  assert.deepEqual(result.goalContext, { state: "pending", reasonCode: "CLOUD_UNAVAILABLE" });
});

test("selected Second Brain publication persists an exact immutable retry payload before the API call", async () => {
  const fixture = await localFixture();
  const accepted = [];
  let firstAttempt = true;
  const client = {
    getChanges: async () => response([], false), acknowledge: async () => {},
    publishSecondBrain: async (_token, snapshot) => {
      accepted.push(snapshot);
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error("connection dropped after cloud acceptance");
      }
      return { data: { snapshot, reused: true } };
    },
  };
  const agent = await agentFor(fixture, client);
  const input = {
    selectedFields: ["availability"],
    sourceContext: { availability: { weeklyMinutesBudget: 300 } },
    logicalSourceRefs: ["running-context"],
  };
  await assert.rejects(() => agent.publishSelectedSecondBrain(input), /connection dropped/u);

  let database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  const pending = database.prepare(`
    SELECT snapshot_json AS snapshotJson, attempt_count AS attempts
    FROM local_second_brain_publication_outbox
  `).get();
  database.close();
  assert.equal(pending.attempts, 1);
  assert.deepEqual(JSON.parse(pending.snapshotJson), accepted[0]);

  const recovered = await agent.publishSelectedSecondBrain(input);
  assert.equal(recovered.snapshot.revision, 1);
  assert.equal(recovered.reused, true);
  assert.equal(accepted.length, 2);
  assert.deepEqual(accepted[1], accepted[0], "a retry sends the original immutable snapshot exactly");
  database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM local_second_brain_publication_outbox").get().count, 0);
  assert.equal(database.prepare("SELECT second_brain_revision AS revision FROM local_sync_state WHERE athlete_id = ?").get(athleteId).revision, 1);
  database.close();
});

test("selected Second Brain context can return to earlier content after an intervening revision", async () => {
  const fixture = await localFixture();
  const published = [];
  const agent = await agentFor(fixture, {
    getChanges: async () => response([], false), acknowledge: async () => {},
    publishSecondBrain: async (_token, snapshot) => {
      published.push(snapshot);
      return { data: { snapshot, reused: false } };
    },
  });
  const source = (weeklyMinutesBudget) => ({
    selectedFields: ["availability"],
    sourceContext: { availability: { weeklyMinutesBudget } },
    logicalSourceRefs: ["running-context"],
  });

  await agent.publishSelectedSecondBrain(source(240));
  await agent.publishSelectedSecondBrain(source(300));
  const restored = await agent.publishSelectedSecondBrain(source(240));

  assert.equal(restored.snapshot.revision, 3);
  assert.deepEqual(published.map((snapshot) => snapshot.revision), [1, 2, 3]);
  assert.equal(published[0].contentHash, published[2].contentHash);
  const database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM local_second_brain_publications WHERE athlete_id = ?").get(athleteId).count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM local_second_brain_publications WHERE athlete_id = ? AND content_hash = ?").get(athleteId, published[0].contentHash).count, 2);
  database.close();
});

test("local schema migration removes historical content-hash uniqueness without losing v3 publication rows", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-local-sync-v3-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  await mkdir(path.dirname(databasePath), { recursive: true });
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE local_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL);
    INSERT INTO local_schema_migrations VALUES (1, 'coaching_foundation', '${NOW}');
    INSERT INTO local_schema_migrations VALUES (2, 'cloud_sync_projection', '${NOW}');
    INSERT INTO local_schema_migrations VALUES (3, 'second_brain_publication_outbox', '${NOW}');
    CREATE TABLE local_second_brain_publications (
      athlete_id TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL,
      selected_fields_json TEXT NOT NULL, logical_source_refs_json TEXT NOT NULL, published_at TEXT NOT NULL,
      PRIMARY KEY (athlete_id, revision), UNIQUE (athlete_id, content_hash)
    );
    INSERT INTO local_second_brain_publications VALUES ('${athleteId}', 1, '${"a".repeat(64)}', '["availability"]', '["running-context"]', '${NOW}');
    CREATE TABLE local_second_brain_publication_outbox (
      athlete_id TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL,
      snapshot_json TEXT NOT NULL, logical_source_refs_json TEXT NOT NULL, created_at TEXT NOT NULL,
      last_attempted_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (athlete_id, revision), UNIQUE (athlete_id, content_hash)
    );
  `);
  legacy.close();

  new LocalSyncProjectionRepository({ databasePath, now: () => new Date(NOW) });
  const migrated = new DatabaseSync(databasePath);
  assert.equal(migrated.prepare("SELECT COUNT(*) AS count FROM local_second_brain_publications").get().count, 1);
  migrated.prepare(`
    INSERT INTO local_second_brain_publications (
      athlete_id, revision, content_hash, selected_fields_json, logical_source_refs_json, published_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(athleteId, 2, "a".repeat(64), '["availability"]', '["running-context"]', NOW);
  migrated.close();
});

test("sync-and-publish attempts the selected-context publication after a failed cloud pull", async () => {
  const fixture = await localFixture();
  let published = false;
  const agent = await agentFor(fixture, {
    getChanges: async () => { throw new Error("cloud pull unavailable"); },
    acknowledge: async () => {},
    publishSecondBrain: async (_token, snapshot) => {
      published = true;
      return { data: { snapshot, reused: false } };
    },
  });
  const result = await agent.syncAndPublish(async () => ({
    selectedFields: ["availability"],
    sourceContext: { availability: { weeklyMinutesBudget: 300 } },
    logicalSourceRefs: ["running-context"],
  }));
  assert.equal(result.sync.status, "rejected");
  assert.equal(result.publication.status, "fulfilled");
  assert.equal(published, true);
  assert.equal(result.publication.value.snapshot.revision, 1);
});

test("sync-and-publish drains a valid pending outbox even when the current source is malformed", async () => {
  const fixture = await localFixture();
  let failFirstAttempt = true;
  const agent = await agentFor(fixture, {
    getChanges: async () => response([], false), acknowledge: async () => {},
    publishSecondBrain: async (_token, snapshot) => {
      if (failFirstAttempt) {
        failFirstAttempt = false;
        throw new Error("offline");
      }
      return { data: { snapshot, reused: true } };
    },
  });
  await assert.rejects(() => agent.publishSelectedSecondBrain({
    selectedFields: ["availability"],
    sourceContext: { availability: { weeklyMinutesBudget: 300 } },
    logicalSourceRefs: ["running-context"],
  }), /offline/u);

  const result = await agent.syncAndPublish(async () => { throw new Error("source JSON is malformed"); });
  assert.equal(result.source.status, "rejected");
  assert.equal(result.publication.status, "fulfilled");
  assert.equal(result.publication.value.snapshot.revision, 1);
  const database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM local_second_brain_publication_outbox").get().count, 0);
  database.close();
});

test("DPAPI store passes the token only through the protection input and never embeds it in the fixed script", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-credential-"));
  const inputs = [];
  const store = new WindowsDpapiCredentialStore({
    credentialPath: path.join(directory, "device.dpapi"),
    run: async (script, input) => {
      inputs.push({ script, input });
      return input === token ? "protected-value" : token;
    },
  });
  await store.save(token);
  assert.equal(await store.load(), token);
  assert.equal(inputs[0].input, token);
  assert.doesNotMatch(inputs[0].script, new RegExp(token, "u"));
  assert.equal(await readFile(path.join(directory, "device.dpapi"), "utf8"), "protected-value\n");
  await store.clear();
  assert.equal(await store.load(), null);
});

async function localFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-local-sync-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const notePath = path.join(directory, "vault", "Dashboards", "Cloud Sync.md");
  return {
    directory,
    databasePath,
    notePath,
    projection: new LocalSyncProjectionRepository({ databasePath, now: () => new Date(NOW) }),
  };
}

async function agentFor(fixture, client, overrides = {}) {
  const credentialStore = new InMemoryDeviceCredentialStore();
  await credentialStore.save(token);
  return new LocalCloudSyncAgent({
    athleteId,
    credentialStore,
    client,
    projection: fixture.projection,
    notePath: fixture.notePath,
    now: () => new Date(NOW),
    ...overrides,
  });
}

function response(changes, hasMore, nextCursor = changes.at(-1)?.cursor ?? null) {
  return { data: { changes, nextCursor, hasMore } };
}

function change(cursor, entityType, entityId, entityRevision, payload, operation = "upsert") {
  return { cursor, athleteId, entityType, entityId, entityRevision, operation, changedAt: NOW, payload };
}

function activity(overrides = {}) {
  return {
    id: "activity-a", athleteId, title: "Cloud run", occurredAt: "2026-08-10T06:00:00.000Z",
    localOccurredAt: "2026-08-10 08:00:00", sport: "run", distanceM: 5000, elapsedTimeS: 1800,
    avgPaceSecPerKm: 360, elevationGainM: 50, hrAvailable: true, cadenceAvailable: true,
    endedAt: "2026-08-10T06:30:00.000Z", sourceType: "strava", sourceFileId: null,
    sourceActivityId: "strava-123", movingTimeS: 1750, elevationLossM: 45,
    avgHrBpm: 150, maxHrBpm: 170, minHrBpm: 100, avgCadenceSpm: 172, maxCadenceSpm: 180,
    calories: 400, aerobicTrainingEffect: null, avgStrideLengthM: null, avgVerticalRatioPct: null,
    avgVerticalOscillationCm: null, avgGroundContactTimeMs: null, normalizedPowerW: null,
    trainingStressScore: null, avgPowerW: null, maxPowerW: null, steps: null, bodyBatteryDrain: null,
    lapCount: 1, minElevationM: 10, maxElevationM: 60, paceVariability: null, hrDriftPct: null,
    hillDifficulty: null, dedupeHash: "dedupe-activity-a", createdAt: NOW, splits: [], routeSignature: null,
    ...overrides,
  };
}

function structuredPlan(stored, status, changedAt) {
  const workout = stored.workouts[0];
  const active = status === "active";
  return {
    id: stored.id,
    athleteId,
    goalId: stored.goalId,
    goalRevision: 1,
    routineRevision: 1,
    version: stored.version,
    revision: active ? 4 : 3,
    startsOn: stored.startDate,
    endsOn: stored.endDate,
    timezone: "Africa/Johannesburg",
    weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Approved week", sessionIds: [workout.id] }],
    workouts: [{ id: workout.id, kind: "run", scheduledDate: workout.prescribedLocalDate, title: workout.title, purpose: "Approved purpose", prescription: "Follow the approved session.", cautions: [], durationMinutes: workout.durationMinutes }],
    contextArtifactId: "context-a",
    createdAt: stored.createdAt,
    approval: { goalRationale: "Approved goal", rationale: "Approved plan", summary: "Approved plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash: (active ? "b" : "c").repeat(64) },
    status,
    ...(active ? { activatedAt: changedAt, activatedBy: "user" } : { retiredAt: changedAt }),
  };
}
