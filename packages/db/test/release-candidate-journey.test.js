import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import { StravaIngestionService } from "../../core/src/services/strava-ingestion-service.ts";
import { StravaWebhookReceiptService } from "../../core/src/use-cases/strava-webhook-receipt.ts";
import {
  InMemoryRawObjectStore,
  InMemorySecondBrainSnapshotRepository,
  InMemoryWebhookReceiptRepository,
  PrismaCloudDashboardRepository,
} from "../src/cloud/index.js";
import { InMemoryDeviceCredentialStore } from "../src/device-credential-store.js";
import { createLocalCoachingRepository } from "../src/local-coaching-repository.js";
import { LocalCloudSyncAgent } from "../src/local-sync-agent.js";
import { LocalSyncProjectionRepository } from "../src/local-sync-projection.js";

const NOW = "2026-08-10T04:15:00.000Z";
const CAPTURED_AT = "2026-08-10T04:13:00.000Z";
const ATHLETE_ID = "athlete_001";
const PROVIDER_ATHLETE_ID = "700000001";
const SUBSCRIPTION_ID = 99001;
const DEVICE_TOKEN = `rpd1.device_release.${"a".repeat(48)}`;
const fixtureRoot = new URL("../../core/test/fixtures/strava/", import.meta.url);
const detail = await fixture("activity-detail.json");
const laps = await fixture("activity-laps.json");
const streams = await fixture("activity-streams.json");
const scope = athleteScopeFor(buildActorContext({
  userId: "owner_release",
  permittedAthleteIds: [ATHLETE_ID],
  activeAthleteId: ATHLETE_ID,
  requestId: "release_candidate_journey",
  credentialKind: "internal",
}));

test("synthetic release journey reaches cloud and local projections while selected context and offline coaching remain safe", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-release-candidate-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const notePath = path.join(directory, "vault", "Dashboards", "Cloud Sync.md");

  const rawObjects = new InMemoryRawObjectStore({ now: () => new Date(NOW) });
  const receipts = new InMemoryWebhookReceiptRepository({ connections: [{
    id: "connection_release",
    athleteId: ATHLETE_ID,
    providerAthleteId: PROVIDER_ATHLETE_ID,
    status: "connected",
  }] });
  const receiptService = new StravaWebhookReceiptService({
    receiptRepository: receipts,
    rawObjectStore: rawObjects,
    expectedSubscriptionId: SUBSCRIPTION_ID,
    now: () => new Date(NOW),
  });
  const webhookBody = bytes({
    aspect_type: "create",
    event_time: 1786334400,
    object_id: Number(detail.id),
    object_type: "activity",
    owner_id: Number(PROVIDER_ATHLETE_ID),
    subscription_id: SUBSCRIPTION_ID,
    updates: {},
  });
  const receipt = await receiptService.receive(webhookBody);
  const queuedJob = await receipts.inspectJob(scope, receipt.jobId);
  assert.equal(queuedJob.status, "queued");
  const durableEvent = await receipts.inspectEvent(scope, receipt.providerEventKey);
  assert.deepEqual(await rawObjects.readImmutableForReplay(scope, durableEvent.rawObject.key), webhookBody);

  const canonical = new ReleaseCandidateUnitOfWork();
  const ingestion = new StravaIngestionService({
    client: fixtureClient(),
    credentials: {
      getAccessToken: async () => "synthetic-access-token",
      refreshAccessToken: async () => "synthetic-rotated-token",
    },
    rawObjects,
    unitOfWork: canonical,
    digest: { sha256: (value) => createHash("sha256").update(value).digest("hex") },
    now: () => new Date(NOW),
  });
  const ingestionOutcome = await ingestion.ingest(scope, {
    providerActivityId: detail.id,
    aspect: "create",
    source: "webhook",
    occurredAt: CAPTURED_AT,
    attempt: 1,
  });
  assert.equal(ingestionOutcome.state, "applied");
  assert.equal(canonical.analyticsRequests, 1);
  assert.equal(canonical.rawObjectKeys.length, 3);
  const activity = canonical.activity;
  assert.equal(activity.sourceType, "strava");

  const dashboardRows = [0, 7, 14].map((daysAgo, index) => ({
    id: index === 0 ? activity.id : `${activity.id}-history-${index}`,
    athleteId: activity.athleteId,
    occurredAt: new Date(Date.parse(activity.occurredAt) - daysAgo * 86_400_000),
    distanceM: 5_000 + index * 2_500,
    elapsedTimeS: 1_800 + index * 900,
  }));
  const cloudDashboard = new PrismaCloudDashboardRepository({ prisma: {
    activity: { findMany: async () => dashboardRows },
    import: { findFirst: async () => null },
  } });
  const overview = await cloudDashboard.getOverview(scope, new Date(NOW));
  assert.equal(overview.fetchStatus, "success");
  assert.equal(overview.data.predictionSummary.athleteId, ATHLETE_ID);
  assert.equal(overview.data.importProgress.normalizedCount, 3);

  const coaching = createLocalCoachingRepository({
    databasePath,
    athleteId: ATHLETE_ID,
    clock: () => new Date(NOW),
    idFactory: deterministicIds(),
  });
  const goal = coaching.settleGoal(coaching.createGoal({
    goalType: "race",
    title: "Synthetic half marathon",
    targetDate: "2026-09-06",
    details: { targetDistanceM: 21097.5 },
  }).id);
  const plan = coaching.activatePlan(coaching.saveValidatedPlan({
    goalId: goal.id,
    title: "Synthetic release plan",
    startDate: "2026-08-10",
    endDate: "2026-09-06",
    summary: { phase: "base" },
    workouts: [{
      localDate: "2026-08-10",
      title: "Easy run",
      workoutType: "easy",
      durationMinutes: 45,
      distanceM: 7000,
      intensity: "RPE 3",
    }],
  }).id);
  coaching.saveReminderPreferences({ enabled: true, localTime: "06:30", externalStatus: "prepared" });
  coaching.storeDailyBrief({
    localDate: "2026-08-10",
    planId: plan.id,
    workoutId: plan.workouts[0].id,
    message: "Keep today easy.",
    payload: { goalId: goal.id },
  });
  coaching.close();

  const projection = new LocalSyncProjectionRepository({ databasePath, now: () => new Date(NOW) });
  const credentialStore = new InMemoryDeviceCredentialStore();
  await credentialStore.save(DEVICE_TOKEN);
  let acknowledgedCursor = null;
  const snapshots = new InMemorySecondBrainSnapshotRepository();
  const onlineClient = {
    getChanges: async () => ({ data: {
      changes: [{
        cursor: "1",
        athleteId: ATHLETE_ID,
        entityType: "activity",
        entityId: activity.id,
        entityRevision: 1,
        operation: "upsert",
        changedAt: CAPTURED_AT,
        payload: activity,
      }],
      nextCursor: "1",
      hasMore: false,
    } }),
    acknowledge: async (_token, cursor) => { acknowledgedCursor = cursor; },
    reportFailure: async () => {},
    publishSecondBrain: async (_token, snapshot) => ({
      data: await snapshots.storeImmutable(scope, snapshot),
    }),
  };
  const localAgent = new LocalCloudSyncAgent({
    athleteId: ATHLETE_ID,
    credentialStore,
    client: onlineClient,
    projection,
    notePath,
    now: () => new Date(NOW),
  });
  const syncResult = await localAgent.sync();
  assert.deepEqual(syncResult, { athleteId: ATHLETE_ID, cursor: "1", applied: 1, status: "current" });
  assert.equal(acknowledgedCursor, "1");
  assert.match(await readFile(notePath, "utf8"), /Synthetic morning run/u);

  const published = await localAgent.publishSelectedSecondBrain({
    selectedFields: ["availability", "wellbeingCheckIns"],
    sourceContext: {
      availability: { weeklyMinutesBudget: 300 },
      wellbeingCheckIns: [{ recordedOn: "2026-08-10", energy: 4, fatigue: 2, soreness: 1, sleepQuality: 4, stress: 2 }],
    },
    logicalSourceRefs: ["weekly-availability", "morning-check-in"],
  });
  assert.equal(published.snapshot.revision, 1);
  assert.deepEqual(Object.keys(published.snapshot.context), ["availability", "wellbeingCheckIns"]);
  assert.doesNotMatch(JSON.stringify(published.snapshot), /vault|path|markdown|weekly-availability|morning-check-in|notes/iu);

  const offlineAgent = new LocalCloudSyncAgent({
    athleteId: ATHLETE_ID,
    credentialStore,
    client: {
      getChanges: async () => { throw new Error("synthetic cloud outage"); },
      acknowledge: async () => {},
      reportFailure: async () => {},
    },
    projection,
    notePath,
    now: () => new Date(NOW),
  });
  await assert.rejects(offlineAgent.sync(), /synthetic cloud outage/u);

  const localDatabase = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(localDatabase.prepare("SELECT title FROM activities WHERE athlete_id = ? AND id = ?").get(ATHLETE_ID, activity.id).title, "Synthetic morning run");
  localDatabase.close();
  const reopenedCoaching = createLocalCoachingRepository({ databasePath, athleteId: ATHLETE_ID, clock: () => new Date(NOW) });
  assert.equal(reopenedCoaching.loadActivePlan().id, plan.id);
  assert.equal(reopenedCoaching.getDailyBrief("2026-08-10").workoutId, plan.workouts[0].id);
  assert.equal(reopenedCoaching.loadReminderPreferences().localTime, "06:30");
  reopenedCoaching.close();

  const restoredPath = path.join(directory, "racepredictor-restored.sqlite");
  await copyFile(databasePath, restoredPath);
  const restoredCoaching = createLocalCoachingRepository({ databasePath: restoredPath, athleteId: ATHLETE_ID, clock: () => new Date(NOW) });
  assert.equal(restoredCoaching.loadActivePlan().id, plan.id, "the rehearsed local backup restores the approved plan");
  assert.equal(restoredCoaching.getDailyBrief("2026-08-10").message, "Keep today easy.");
  assert.equal(restoredCoaching.loadReminderPreferences().enabled, true);
  restoredCoaching.close();
});

class ReleaseCandidateUnitOfWork {
  activity = null;
  revision = 0;
  analyticsRequests = 0;
  rawObjectKeys = [];

  async run(_scope, operation) {
    return operation({
      activities: {
        resolveTarget: async () => ({ kind: "new" }),
        upsert: async (input) => {
          this.activity = structuredClone(input.activity);
          this.revision += 1;
          this.rawObjectKeys = Object.values(input.rawObjects).map((item) => item.key);
          return { activity: structuredClone(this.activity), revision: this.revision, created: true, changed: true };
        },
        tombstone: async () => { throw new Error("not used in the release candidate create journey"); },
      },
      sync: { append: async () => {} },
      analytics: { requestActivityRecompute: async () => { this.analyticsRequests += 1; } },
    });
  }
}

function fixtureClient() {
  return {
    fetchActivityDetail: async () => payload(detail),
    fetchActivityLaps: async () => payload(laps),
    fetchActivityStreams: async () => payload(streams),
    listActivities: async () => [],
  };
}

function payload(data) {
  return { data: structuredClone(data), rawBody: bytes(data), capturedAt: CAPTURED_AT, contentType: "application/json" };
}

function bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

async function fixture(name) {
  return JSON.parse(await readFile(new URL(name, fixtureRoot), "utf8"));
}

function deterministicIds() {
  let value = 0;
  return () => `release-id-${String(++value).padStart(3, "0")}`;
}
