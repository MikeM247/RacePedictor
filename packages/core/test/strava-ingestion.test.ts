import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../src/contracts/auth.ts";
import {
  STRAVA_CANONICAL_STREAM_KEYS,
  projectStravaActivityDetail,
  projectStravaActivitySummaryPage,
  projectStravaLaps,
  projectStravaStreamSet,
  stravaActivityDetailSchema,
  stravaActivitySummaryPageSchema,
  stravaBackfillRequestSchema,
  stravaLapsSchema,
  stravaReconciliationRequestSchema,
  stravaStreamSetSchema,
  type StravaActivityDetail,
  type StravaActivitySummary,
  type StravaLap,
  type StravaStreamSet,
} from "../src/contracts/strava.ts";
import type { ActivityDetail } from "../src/contracts/activity.ts";
import type { AthleteScope } from "../src/contracts/auth.ts";
import type { RawObjectMetadata } from "../src/ports/cloud-sync.ts";
import {
  StravaActivityClientError,
  StravaActivityPayloadError,
  type ContentDigestPort,
  type StravaActivityClient,
  type StravaIngestionTransaction,
  type StravaPayload,
  type StravaReconciliationCandidate,
  type StravaReconciliationResolution,
} from "../src/ports/strava-ingestion.ts";
import {
  createStravaReconciliationCandidate,
  mapStravaActivity,
} from "../src/services/strava-activity-mapper.ts";
import {
  ProjectingStravaActivityClient,
  type StravaActivityTransport,
} from "../src/services/strava-activity-client.ts";
import { StravaIngestionService } from "../src/services/strava-ingestion-service.ts";

const fixtureRoot = new URL("./fixtures/strava/", import.meta.url);
const capturedAt = "2026-08-10T04:13:00.000Z";
const now = new Date("2026-08-10T04:15:00.000Z");
const digest: ContentDigestPort = {
  sha256(input) {
    return createHash("sha256").update(input).digest("hex");
  },
};
const actor = buildActorContext({
  userId: "owner_001",
  permittedAthleteIds: ["athlete_001"],
  activeAthleteId: "athlete_001",
  requestId: "request_001",
  credentialKind: "internal",
});
const scope = athleteScopeFor(actor);

const detailFixture = await fixture<StravaActivityDetail>("activity-detail.json");
const lapsFixture = await fixture<StravaLap[]>("activity-laps.json");
const streamsFixture = await fixture<StravaStreamSet>("activity-streams.json");
const summaryFixture = await fixture<StravaActivitySummary[]>("activity-summary-page.json");

test("strict minimized fixtures contain only canonical inputs and no credentials or social payloads", () => {
  assert.deepEqual(stravaActivityDetailSchema.parse(detailFixture), detailFixture);
  assert.deepEqual(stravaLapsSchema.parse(lapsFixture), lapsFixture);
  assert.deepEqual(stravaStreamSetSchema.parse(streamsFixture), streamsFixture);
  assert.deepEqual(stravaActivitySummaryPageSchema.parse(summaryFixture), summaryFixture);

  assert.equal(stravaActivityDetailSchema.safeParse({ ...detailFixture, description: "private prose" }).success, false);
  assert.equal(stravaLapsSchema.safeParse([{ ...lapsFixture[0], name: "personal lap name" }]).success, false);
  assert.equal(stravaStreamSetSchema.safeParse({ ...streamsFixture, watts: streamsFixture.cadence }).success, false);
  assert.equal(stravaActivitySummaryPageSchema.safeParse([{ ...summaryFixture[0], kudos_count: 42 }]).success, false);

  const serialized = JSON.stringify({ detailFixture, lapsFixture, streamsFixture, summaryFixture });
  assert.doesNotMatch(serialized, /access.?token|refresh.?token|email|description|segment_efforts|photos|kudos/i);
});

test("concrete client projects extra live fields while raw bytes remain untouched", async () => {
  const providerResponse = {
    ...detailFixture,
    id: Number(detailFixture.id),
    description: "provider-only private description",
    kudos_count: 7,
    segment_efforts: [{ id: 1 }],
    athlete: { id: Number(detailFixture.athlete.id), resource_state: 1, firstname: "Not retained" },
    splits_metric: detailFixture.splits_metric.map((split) => ({ ...split, pace_zone: 2 })),
    map: { ...detailFixture.map, id: "provider-map-id", resource_state: 2 },
  };
  const rawBody = bytes(providerResponse);
  const requests: Array<{ path: string; query?: Readonly<Record<string, string>> }> = [];
  const transport: StravaActivityTransport = {
    async request(input) {
      requests.push({ path: input.path, query: input.query });
      return { status: 200, headers: { "content-type": "application/json" }, body: rawBody };
    },
  };
  const client = new ProjectingStravaActivityClient({ transport, now: () => new Date(capturedAt) });
  const payload = await client.fetchActivityDetail({
    accessToken: "test-token",
    providerActivityId: detailFixture.id,
  });

  assert.deepEqual(payload.data, detailFixture);
  assert.equal(payload.rawBody, rawBody, "adapter retains the exact provider byte array");
  assert.match(new TextDecoder().decode(payload.rawBody), /provider-only private description/);
  assert.doesNotMatch(JSON.stringify(payload.data), /description|kudos|segment_efforts|firstname/);
  assert.deepEqual(requests, [{ path: `/activities/${detailFixture.id}`, query: undefined }]);

  assert.deepEqual(projectStravaActivityDetail(providerResponse), detailFixture);
  assert.deepEqual(projectStravaLaps(lapsFixture.map((lap) => ({ ...lap, name: "Provider lap" }))), lapsFixture);
  assert.deepEqual(projectStravaStreamSet({ ...streamsFixture, watts: streamsFixture.cadence }), streamsFixture);
  assert.deepEqual(projectStravaActivitySummaryPage(summaryFixture.map((item) => ({ ...item, kudos_count: 9 }))), summaryFixture);

  const malformedClient = new ProjectingStravaActivityClient({
    transport: { async request() { return { status: 200, headers: {}, body: bytes({ unknown: true }) }; } },
    now: () => new Date(capturedAt),
  });
  await assert.rejects(
    malformedClient.fetchActivityDetail({ accessToken: "test-token", providerActivityId: detailFixture.id }),
    StravaActivityPayloadError,
  );
});

test("mapper deterministically creates the existing canonical Activity shape and manual-import dedupe hash", () => {
  const input = {
    athleteId: scope.athleteId,
    activityId: "activity_strava_900000000001",
    canonicalCreatedAt: capturedAt,
    detail: detailFixture,
    laps: lapsFixture,
    streams: streamsFixture,
    digest,
  };
  const first = mapStravaActivity(input);
  const second = mapStravaActivity(input);
  assert.deepEqual(second, first);
  assert.equal(first.sourceType, "strava");
  assert.equal(first.sourceActivityId, detailFixture.id);
  assert.equal(first.sport, "run");
  assert.equal(first.avgPaceSecPerKm, 360);
  assert.equal(first.elevationLossM, 4);
  assert.equal(first.minHrBpm, 132);
  assert.equal(first.maxCadenceSpm, 90);
  assert.equal(first.lapCount, 1);
  assert.equal(first.splits.length, 2);
  assert.equal(first.splits[1].startOffsetS, 370);
  assert.equal(first.routeSignature?.bboxMinLat, -26.2041);
  assert.equal(first.routeSignature?.bboxMaxLon, 28.053);

  const candidate = createStravaReconciliationCandidate(scope.athleteId, detailFixture, digest);
  const expectedManualHash = digest.sha256([
    scope.athleteId,
    "run",
    "2026-08-10T04:00:00.000Z",
    "750",
    "2000",
    "18",
  ].join("|"));
  assert.equal(candidate.dedupeHash, expectedManualHash);
  assert.equal(first.dedupeHash, expectedManualHash);
});

test("create stores all raw responses before one atomic canonical, sync, and analytics mutation", async () => {
  const harness = createHarness();
  const outcome = await harness.service.ingest(scope, event());

  assert.equal(outcome.state, "applied");
  if (outcome.state !== "applied") return;
  assert.equal(outcome.created, true);
  assert.equal(outcome.revision, 1);
  assert.equal(harness.unit.state.activities.size, 1);
  assert.equal(harness.unit.state.sync.length, 1);
  assert.equal(harness.unit.state.analytics.length, 1);
  assert.equal(harness.unit.state.coachingPlanMutations, 0);
  assert.deepEqual(harness.client.streamKeyRequests[0], STRAVA_CANONICAL_STREAM_KEYS);
  assert.equal(harness.raw.objects.size, 3);
  assert.deepEqual(harness.timeline.slice(0, 4), ["raw:detail", "raw:laps", "raw:streams", "transaction:begin"]);
  assert.deepEqual(harness.unit.state.sync[0], {
    entityId: "activity_strava_900000000001",
    entityRevision: 1,
    operation: "upsert",
    changedAt: capturedAt,
    payload: harness.unit.state.activities.get("activity_strava_900000000001"),
  });
});

test("webhook replay and backfill overlap reuse raw objects and emit no duplicate mutation", async () => {
  const harness = createHarness();
  const first = await harness.service.ingest(scope, event());
  const replay = await harness.service.ingest(scope, event({ source: "webhook" }));
  harness.client.pages.set(1, [summaryFixture[0]]);
  harness.client.pages.set(2, []);
  const backfill = await harness.service.runBackfill(scope, {
    after: "2026-08-01T00:00:00.000Z",
    before: "2026-08-11T00:00:00.000Z",
    pageSize: 1,
    maxPages: 2,
    maxActivities: 10,
  });

  assert.equal(first.state, "applied");
  assert.equal(replay.state, "applied");
  if (replay.state === "applied") assert.equal(replay.changed, false);
  assert.equal(backfill.outcomes[0]?.state, "applied");
  if (backfill.outcomes[0]?.state === "applied") assert.equal(backfill.outcomes[0].changed, false);
  assert.equal(harness.unit.state.activities.size, 1);
  assert.equal(harness.unit.state.sync.length, 1);
  assert.equal(harness.unit.state.analytics.length, 1);
  assert.equal(harness.raw.objects.size, 3);
});

test("manual-import overlap attaches Strava provenance to the existing canonical activity", async () => {
  const harness = createHarness();
  const candidate = createStravaReconciliationCandidate(scope.athleteId, detailFixture, digest);
  harness.unit.seedManual(candidate.dedupeHash, "activity_manual_001", capturedAt);

  const outcome = await harness.service.ingest(scope, event({ source: "backfill" }));
  assert.equal(outcome.state, "applied");
  if (outcome.state !== "applied") return;
  assert.equal(outcome.activityId, "activity_manual_001");
  assert.equal(harness.unit.state.activities.size, 1);
  assert.equal(harness.unit.state.activities.get("activity_manual_001")?.sourceType, "csv");
  assert.equal(harness.unit.state.providerReferences.get(detailFixture.id), "activity_manual_001");
  assert.equal(harness.unit.state.provenance.get(detailFixture.id)?.rawObjectKeys.length, 3);

  harness.client.details.set(detailFixture.id, { ...detailFixture, name: "Updated provider title" });
  await harness.service.ingest(scope, event({ aspect: "update" }));
  assert.equal(harness.unit.state.activities.get("activity_manual_001")?.sourceType, "csv");
  assert.equal(harness.unit.state.activities.get("activity_manual_001")?.title, "Updated provider title");
});

test("ambiguous manual overlap is reported without silently merging or duplicating", async () => {
  const harness = createHarness();
  const candidate = createStravaReconciliationCandidate(scope.athleteId, detailFixture, digest);
  harness.unit.seedManual(candidate.dedupeHash, "activity_manual_001", capturedAt);
  harness.unit.seedManual(candidate.dedupeHash, "activity_manual_002", capturedAt);

  const outcome = await harness.service.ingest(scope, event({ source: "backfill" }));
  assert.deepEqual(outcome, {
    state: "attention",
    diagnosticCode: "AMBIGUOUS_CROSS_SOURCE_MATCH",
    candidateCount: 2,
    rawObjectKeys: [...harness.raw.objects.keys()],
  });
  assert.equal(harness.unit.state.activities.size, 2);
  assert.equal(harness.unit.state.providerReferences.size, 0);
  assert.equal(harness.unit.state.sync.length, 0);
  assert.equal(harness.unit.state.analytics.length, 0);
});

test("provider update creates one revision, sync upsert, and affected analytics request", async () => {
  const harness = createHarness();
  await harness.service.ingest(scope, event());
  harness.client.details.set(detailFixture.id, {
    ...detailFixture,
    name: "Synthetic renamed run",
    distance: 2010,
  });

  const update = await harness.service.ingest(scope, event({ aspect: "update" }));
  assert.equal(update.state, "applied");
  if (update.state !== "applied") return;
  assert.equal(update.created, false);
  assert.equal(update.changed, true);
  assert.equal(update.revision, 2);
  assert.equal(harness.unit.state.revisions.get(update.activityId), 2);
  assert.equal(harness.unit.state.sync.length, 2);
  assert.equal(harness.unit.state.analytics.length, 2);
  assert.equal(harness.unit.state.activities.get(update.activityId)?.title, "Synthetic renamed run");
});

test("delete and privacy-style not-found create an auditable tombstone without touching plans", async () => {
  const harness = createHarness();
  await harness.service.ingest(scope, event());
  const deleted = await harness.service.ingest(scope, event({ aspect: "delete" }));
  const replay = await harness.service.ingest(scope, event({ aspect: "delete" }));

  assert.equal(deleted.state, "deleted");
  assert.equal(replay.state, "deleted");
  if (deleted.state === "deleted") assert.equal(deleted.revision, 2);
  if (replay.state === "deleted") assert.equal(replay.changed, false);
  assert.equal(harness.unit.state.deleted.has("activity_strava_900000000001"), true);
  assert.equal(harness.unit.state.sync.length, 2);
  assert.equal(harness.unit.state.sync[1].operation, "delete");
  assert.equal(harness.unit.state.sync[1].payload, null);
  assert.equal(harness.unit.state.coachingPlanMutations, 0);

  const privacyHarness = createHarness();
  await privacyHarness.service.ingest(scope, event());
  privacyHarness.client.failures.detail.push(new StravaActivityClientError("hidden", { status: 404 }));
  const privacyRemoval = await privacyHarness.service.ingest(scope, event({ aspect: "update" }));
  assert.equal(privacyRemoval.state, "deleted");
  assert.equal(privacyHarness.unit.state.deleted.size, 1);
});

test("401 refreshes once, while repeated 401 becomes a terminal reconnect requirement", async () => {
  const refreshed = createHarness();
  refreshed.client.failures.detail.push(new StravaActivityClientError("expired", { status: 401 }));
  const recovered = await refreshed.service.ingest(scope, event());
  assert.equal(recovered.state, "applied");
  assert.equal(refreshed.credentials.refreshCalls, 1);
  assert.deepEqual(refreshed.client.tokens.slice(0, 2), ["access-old", "access-new"]);

  const rejected = createHarness();
  rejected.client.failures.detail.push(
    new StravaActivityClientError("expired", { status: 401 }),
    new StravaActivityClientError("still expired", { status: 401 }),
  );
  const terminal = await rejected.service.ingest(scope, event());
  assert.deepEqual(terminal, {
    state: "terminal",
    diagnosticCode: "STRAVA_REAUTH_REQUIRED",
    retryAt: null,
  });
  assert.equal(rejected.unit.state.activities.size, 0);
});

test("429, 5xx, partial fetch, malformed payload, and raw storage failures are classified safely", async () => {
  const limited = createHarness();
  limited.client.failures.detail.push(new StravaActivityClientError("limited", {
    status: 429,
    retryAt: "2026-08-10T04:30:00.000Z",
  }));
  assert.deepEqual(await limited.service.ingest(scope, event()), {
    state: "retry",
    diagnosticCode: "STRAVA_RATE_LIMITED",
    retryAt: "2026-08-10T04:30:00.000Z",
  });

  const limitedWithoutHeader = createHarness();
  limitedWithoutHeader.client.failures.detail.push(new StravaActivityClientError("limited", { status: 429 }));
  assert.deepEqual(await limitedWithoutHeader.service.ingest(scope, event()), {
    state: "retry",
    diagnosticCode: "STRAVA_RATE_LIMITED",
    retryAt: "2026-08-10T04:30:05.000Z",
  });

  const unavailable = createHarness();
  unavailable.client.failures.detail.push(new StravaActivityClientError("down", { status: 503 }));
  assert.deepEqual(await unavailable.service.ingest(scope, event({ attempt: 3 })), {
    state: "retry",
    diagnosticCode: "STRAVA_UNAVAILABLE",
    retryAt: "2026-08-10T04:19:00.000Z",
  });

  const partial = createHarness();
  partial.client.failures.laps.push(new StravaActivityClientError("down", { status: 503 }));
  const partialOutcome = await partial.service.ingest(scope, event());
  assert.equal(partialOutcome.state, "retry");
  assert.equal(partial.raw.objects.size, 1, "detail remains replayable but canonical state is untouched");
  assert.equal(partial.unit.state.activities.size, 0);

  const malformed = createHarness();
  malformed.client.details.set(detailFixture.id, { ...detailFixture, elapsed_time: -1 } as StravaActivityDetail);
  assert.deepEqual(await malformed.service.ingest(scope, event()), {
    state: "terminal",
    diagnosticCode: "STRAVA_PAYLOAD_INVALID",
    retryAt: null,
  });

  const storage = createHarness();
  storage.raw.failNextPut = true;
  const storageFailure = await storage.service.ingest(scope, event());
  assert.equal(storageFailure.state, "retry");
  if (storageFailure.state === "retry") assert.equal(storageFailure.diagnosticCode, "RAW_OBJECT_STORE_UNAVAILABLE");
  assert.equal(storage.unit.state.activities.size, 0);
});

test("unit-of-work rollback leaves no partial canonical, sync, or analytics state", async () => {
  const harness = createHarness();
  harness.unit.failAnalytics = true;
  const outcome = await harness.service.ingest(scope, event());

  assert.equal(outcome.state, "retry");
  if (outcome.state === "retry") assert.equal(outcome.diagnosticCode, "CANONICAL_TRANSACTION_UNAVAILABLE");
  assert.equal(harness.unit.state.activities.size, 0);
  assert.equal(harness.unit.state.providerReferences.size, 0);
  assert.equal(harness.unit.state.sync.length, 0);
  assert.equal(harness.unit.state.analytics.length, 0);
  assert.equal(harness.raw.objects.size, 3, "immutable raw evidence remains safe to replay");
});

test("backfill and periodic reconciliation enforce independent bounded windows, pages, and activity counts", async () => {
  assert.equal(stravaBackfillRequestSchema.safeParse({
    after: "2025-01-01T00:00:00.000Z",
    before: "2026-08-10T00:00:00.000Z",
  }).success, false);
  assert.equal(stravaReconciliationRequestSchema.safeParse({
    after: "2026-01-01T00:00:00.000Z",
    before: "2026-08-10T00:00:00.000Z",
  }).success, false);
  assert.equal(stravaBackfillRequestSchema.safeParse({
    after: "2026-08-01T00:00:00.000Z",
    before: "2026-08-10T00:00:00.000Z",
    maxActivities: 301,
  }).success, false);

  const harness = createHarness();
  harness.client.pages.set(1, summaryFixture);
  harness.client.details.set(summaryFixture[1].id, {
    ...detailFixture,
    id: summaryFixture[1].id,
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1860,
    total_elevation_gain: 35,
    sport_type: "TrailRun",
    start_date: "2026-08-09T04:00:00.000Z",
    start_date_local: "2026-08-09T06:00:00.000+02:00",
  });
  const backfill = await harness.service.runBackfill(scope, {
    after: "2026-08-01T00:00:00.000Z",
    before: "2026-08-11T00:00:00.000Z",
    pageSize: 2,
    maxPages: 1,
    maxActivities: 1,
  });
  assert.equal(backfill.pagesFetched, 1);
  assert.equal(backfill.activitiesDiscovered, 1);
  assert.equal(backfill.outcomes.length, 1);
  assert.equal(backfill.truncated, true);

  const reconciliation = await harness.service.runReconciliation(scope, {
    after: "2026-08-08T00:00:00.000Z",
    before: "2026-08-11T00:00:00.000Z",
    pageSize: 2,
    maxPages: 1,
    maxActivities: 2,
  });
  assert.equal(reconciliation.activitiesDiscovered, 2);
  assert.equal(reconciliation.outcomes.length, 2);
  assert.equal(harness.client.listCalls.length, 2);
  assert.equal(harness.unit.state.activities.size, 2);
});

test("Strava work is deferred before a provider call when the shared read budget is unavailable", async () => {
  const harness = createHarness();
  harness.budget.deferredAt = 1;

  assert.deepEqual(await harness.service.ingest(scope, event()), {
    state: "deferred",
    diagnosticCode: "STRAVA_RATE_WINDOW_DEFERRED",
    retryAt: "2026-08-10T04:30:05.000Z",
  });
  assert.equal(harness.client.tokens.length, 0);
  assert.deepEqual(harness.budget.reservations.map((entry) => entry.units), [3]);
});

test("a deferred batch does not refresh or list before its first reserved provider call", async () => {
  const harness = createHarness();
  harness.budget.deferredAt = 1;

  const paused = await harness.service.runBackfill(scope, {
    after: "2026-08-01T00:00:00.000Z",
    before: "2026-08-11T00:00:00.000Z",
    pageSize: 2,
    maxPages: 1,
    maxActivities: 2,
  });

  assert.equal(paused.failure?.state, "deferred");
  assert.equal(harness.credentials.getCalls, 0);
  assert.equal(harness.client.listCalls.length, 0);
});

test("a deferred backfill retains its listed checkpoint and resumes without re-listing or reprocessing committed activities", async () => {
  const initial = createHarness();
  initial.client.pages.set(1, summaryFixture);
  initial.client.details.set(summaryFixture[1].id, {
    ...detailFixture,
    id: summaryFixture[1].id,
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1860,
    total_elevation_gain: 35,
    sport_type: "TrailRun",
    start_date: "2026-08-09T04:00:00.000Z",
    start_date_local: "2026-08-09T06:00:00.000+02:00",
  });
  initial.budget.deferredAt = 3;

  const paused = await initial.service.runBackfill(scope, {
    after: "2026-08-01T00:00:00.000Z",
    before: "2026-08-11T00:00:00.000Z",
    pageSize: 2,
    maxPages: 1,
    maxActivities: 2,
  });
  assert.equal(paused.failure?.state, "deferred");
  assert.equal(paused.checkpoint.pendingActivityIds.length, 1);
  assert.equal(paused.checkpoint.completedActivityIds.length, 1);
  assert.equal(initial.client.listCalls.length, 1);

  initial.budget.deferredAt = null;
  const resumed = await initial.service.runBackfill(scope, {
    after: "2026-08-01T00:00:00.000Z",
    before: "2026-08-11T00:00:00.000Z",
    pageSize: 2,
    maxPages: 1,
    maxActivities: 2,
  }, paused.checkpoint);
  assert.equal(resumed.failure, null);
  assert.equal(resumed.checkpoint.completedActivityIds.length, 2);
  assert.equal(initial.client.listCalls.length, 1);
  assert.equal(initial.unit.state.activities.size, 2);
});

function event(overrides: Partial<{
  providerActivityId: string;
  aspect: "create" | "update" | "delete";
  source: "webhook" | "backfill" | "reconciliation";
  occurredAt: string;
  attempt: number;
}> = {}) {
  return {
    providerActivityId: detailFixture.id,
    aspect: "create" as const,
    source: "webhook" as const,
    occurredAt: capturedAt,
    attempt: 1,
    ...overrides,
  };
}

function createHarness() {
  const timeline: string[] = [];
  const client = new FakeStravaClient();
  const credentials = new FakeCredentials();
  const budget = new FakeStravaRequestBudget();
  const raw = new MemoryRawObjectStore(timeline);
  const unit = new MemoryUnitOfWork(timeline);
  const service = new StravaIngestionService({
    client,
    credentials,
    requestBudget: budget,
    rawObjects: raw,
    unitOfWork: unit,
    digest,
    now: () => new Date(now),
  });
  return { service, client, credentials, budget, raw, unit, timeline };
}

class FakeStravaRequestBudget {
  reservations: Array<{ units: number; occurredAt: string }> = [];
  deferredAt: number | null = null;

  async reserve(input: { units: number; occurredAt: string }) {
    this.reservations.push({ ...input });
    if (this.deferredAt !== null && this.reservations.length >= this.deferredAt) {
      return { state: "deferred" as const, retryAt: "2026-08-10T04:30:05.000Z" };
    }
    return { state: "granted" as const };
  }
}

class FakeStravaClient implements StravaActivityClient {
  details = new Map<string, StravaActivityDetail>([[detailFixture.id, detailFixture]]);
  pages = new Map<number, readonly StravaActivitySummary[]>();
  failures = {
    detail: [] as Error[],
    laps: [] as Error[],
    streams: [] as Error[],
    list: [] as Error[],
  };
  streamKeyRequests: Array<readonly string[]> = [];
  listCalls: Array<Record<string, unknown>> = [];
  tokens: string[] = [];

  async fetchActivityDetail(input: { accessToken: string; providerActivityId: string }) {
    this.tokens.push(input.accessToken);
    throwNext(this.failures.detail);
    const data = this.details.get(input.providerActivityId) ?? { ...detailFixture, id: input.providerActivityId };
    return payload(data);
  }

  async fetchActivityLaps(input: { accessToken: string; providerActivityId: string }) {
    this.tokens.push(input.accessToken);
    throwNext(this.failures.laps);
    return payload(lapsFixture);
  }

  async fetchActivityStreams(input: {
    accessToken: string;
    providerActivityId: string;
    keys: readonly (typeof STRAVA_CANONICAL_STREAM_KEYS[number])[];
  }) {
    this.tokens.push(input.accessToken);
    this.streamKeyRequests.push([...input.keys]);
    throwNext(this.failures.streams);
    return payload(streamsFixture);
  }

  async listActivities(input: {
    accessToken: string;
    afterEpochSeconds: number;
    beforeEpochSeconds: number;
    page: number;
    perPage: number;
  }) {
    this.tokens.push(input.accessToken);
    this.listCalls.push({ ...input, accessToken: "[redacted]" });
    throwNext(this.failures.list);
    return this.pages.get(input.page) ?? [];
  }
}

class FakeCredentials {
  getCalls = 0;
  refreshCalls = 0;
  async getAccessToken() {
    this.getCalls += 1;
    return "access-old";
  }
  async refreshAccessToken() {
    this.refreshCalls += 1;
    return "access-new";
  }
}

class MemoryRawObjectStore {
  objects = new Map<string, { metadata: RawObjectMetadata; body: Uint8Array }>();
  failNextPut = false;
  readonly timeline: string[];

  constructor(timeline: string[]) {
    this.timeline = timeline;
  }

  async head(_scope: AthleteScope, key: string) {
    return this.objects.get(key)?.metadata ?? null;
  }

  async put(_scope: AthleteScope, input: { metadata: RawObjectMetadata; body: Uint8Array }) {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("synthetic storage failure");
    }
    const kind = input.metadata.key.split("/").at(-2);
    this.timeline.push(`raw:${kind}`);
    this.objects.set(input.metadata.key, {
      metadata: structuredClone(input.metadata),
      body: new Uint8Array(input.body),
    });
    return structuredClone(input.metadata);
  }

  async createPresignedGet() {
    throw new Error("not used by ingestion tests");
  }
}

type MemoryState = {
  activities: Map<string, ActivityDetail>;
  providerReferences: Map<string, string>;
  dedupeCandidates: Map<string, string[]>;
  revisions: Map<string, number>;
  provenance: Map<string, { rawObjectKeys: string[] }>;
  deleted: Set<string>;
  sync: Array<{
    entityId: string;
    entityRevision: number;
    operation: "upsert" | "delete";
    changedAt: string;
    payload: ActivityDetail | null;
  }>;
  analytics: Array<{ activityId: string; occurredAt: string; reason: string }>;
  coachingPlanMutations: number;
};

class MemoryUnitOfWork {
  state: MemoryState = emptyState();
  failAnalytics = false;
  readonly timeline: string[];

  constructor(timeline: string[]) {
    this.timeline = timeline;
  }

  seedManual(dedupeHash: string, activityId: string, createdAt: string) {
    const placeholder = {
      ...mapStravaActivity({
        athleteId: scope.athleteId,
        activityId,
        canonicalCreatedAt: createdAt,
        detail: detailFixture,
        laps: lapsFixture,
        streams: streamsFixture,
        digest,
      }),
      sourceType: "csv" as const,
      sourceActivityId: null,
    };
    this.state.activities.set(activityId, placeholder);
    this.state.revisions.set(activityId, 1);
    const candidates = this.state.dedupeCandidates.get(dedupeHash) ?? [];
    candidates.push(activityId);
    this.state.dedupeCandidates.set(dedupeHash, candidates);
  }

  async run<T>(_scope: AthleteScope, operation: (transaction: StravaIngestionTransaction) => Promise<T>) {
    this.timeline.push("transaction:begin");
    const draft = structuredClone(this.state);
    const transaction = this.transaction(draft);
    const result = await operation(transaction);
    this.state = draft;
    this.timeline.push("transaction:commit");
    return result;
  }

  private transaction(draft: MemoryState): StravaIngestionTransaction {
    return {
      activities: {
        resolveTarget: async (candidate: StravaReconciliationCandidate): Promise<StravaReconciliationResolution> => {
          const providerActivity = draft.providerReferences.get(candidate.providerActivityId);
          if (providerActivity) {
            const existing = draft.activities.get(providerActivity);
            return {
              kind: "existing_provider",
              activityId: providerActivity,
              canonicalCreatedAt: existing?.createdAt ?? capturedAt,
              canonicalSource: {
                sourceType: existing?.sourceType ?? "strava",
                sourceFileId: existing?.sourceFileId,
                sourceActivityId: existing?.sourceActivityId,
              },
            };
          }
          const candidates = draft.dedupeCandidates.get(candidate.dedupeHash) ?? [];
          if (candidates.length > 1) return { kind: "ambiguous", candidateCount: candidates.length };
          if (candidates.length === 1) {
            const activityId = candidates[0];
            return {
              kind: "manual_match",
              activityId,
              canonicalCreatedAt: draft.activities.get(activityId)?.createdAt ?? capturedAt,
              canonicalSource: {
                sourceType: draft.activities.get(activityId)?.sourceType ?? "manual",
                sourceFileId: draft.activities.get(activityId)?.sourceFileId,
                sourceActivityId: draft.activities.get(activityId)?.sourceActivityId,
              },
            };
          }
          return { kind: "new" };
        },
        upsert: async (input) => {
          const current = draft.activities.get(input.activity.id);
          const created = current === undefined;
          const changed = current === undefined || JSON.stringify(current) !== JSON.stringify(input.activity) || draft.deleted.has(input.activity.id);
          const revision = changed
            ? (draft.revisions.get(input.activity.id) ?? 0) + 1
            : draft.revisions.get(input.activity.id) ?? 1;
          draft.activities.set(input.activity.id, structuredClone(input.activity));
          draft.providerReferences.set(input.providerActivityId, input.activity.id);
          draft.deleted.delete(input.activity.id);
          draft.revisions.set(input.activity.id, revision);
          const candidates = draft.dedupeCandidates.get(input.activity.dedupeHash) ?? [];
          if (!candidates.includes(input.activity.id)) candidates.push(input.activity.id);
          draft.dedupeCandidates.set(input.activity.dedupeHash, candidates);
          draft.provenance.set(input.providerActivityId, {
            rawObjectKeys: Object.values(input.rawObjects).map((metadata) => metadata.key),
          });
          return { activity: structuredClone(input.activity), revision, created, changed };
        },
        tombstone: async (input) => {
          const activityId = draft.providerReferences.get(input.providerActivityId)
            ?? `activity_strava_${input.providerActivityId}`;
          const activity = draft.activities.get(activityId);
          const changed = activity !== undefined && !draft.deleted.has(activityId);
          const revision = changed
            ? (draft.revisions.get(activityId) ?? 0) + 1
            : draft.revisions.get(activityId) ?? 1;
          if (changed) draft.deleted.add(activityId);
          draft.revisions.set(activityId, revision);
          return {
            activityId,
            occurredAt: activity?.occurredAt ?? input.changedAt,
            revision,
            changed,
          };
        },
      },
      sync: {
        append: async (change) => {
          draft.sync.push(structuredClone(change));
        },
      },
      analytics: {
        requestActivityRecompute: async (request) => {
          draft.analytics.push(structuredClone(request));
          if (this.failAnalytics) throw new Error("synthetic analytics outbox failure");
        },
      },
    };
  }
}

function emptyState(): MemoryState {
  return {
    activities: new Map(),
    providerReferences: new Map(),
    dedupeCandidates: new Map(),
    revisions: new Map(),
    provenance: new Map(),
    deleted: new Set(),
    sync: [],
    analytics: [],
    coachingPlanMutations: 0,
  };
}

function payload<T>(data: T): StravaPayload<T> {
  return {
    data: structuredClone(data),
    rawBody: bytes(data),
    capturedAt,
    contentType: "application/json",
  };
}

function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function throwNext(errors: Error[]) {
  const error = errors.shift();
  if (error) throw error;
}

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(name, fixtureRoot), "utf8")) as T;
}
