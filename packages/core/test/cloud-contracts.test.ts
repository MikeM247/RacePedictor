import assert from "node:assert/strict";
import test from "node:test";
import {
  actorContextSchema,
  athleteScopeFor,
  buildActorContext,
} from "../src/contracts/auth.ts";
import { activityDetailSchema, sourceTypeSchema } from "../src/contracts/activity.ts";
import {
  providerConnectionStatusSchema,
  providerStatusApiResponseSchema,
} from "../src/contracts/providers.ts";
import {
  canonicalSecondBrainHashInput,
  SECOND_BRAIN_CONTEXT_MAX_BYTES,
  secondBrainContextSnapshotSchema,
} from "../src/contracts/second-brain-context.ts";
import {
  pairedDeviceSchema,
  syncChangeSchema,
  syncStatusSchema,
} from "../src/contracts/sync.ts";

const publishedAt = "2026-08-10T10:00:00.000+02:00";
const hash = "a".repeat(64);

const completeSnapshot = {
  schemaVersion: "second-brain-context.v1" as const,
  athleteId: "athlete_001",
  revision: 3,
  publishedAt,
  contentHash: hash,
  selectedFields: [
    "availability",
    "trainingPreferences",
    "constraints",
    "wellbeingCheckIns",
    "activityReflections",
  ] as const,
  context: {
    availability: {
      weeklyMinutesBudget: 360,
      availableWeekdays: ["monday", "wednesday", "saturday"] as const,
      preferredLongRunDay: "saturday" as const,
      unavailableDateRanges: [{ startDate: "2026-08-17", endDate: "2026-08-18" }],
    },
    trainingPreferences: {
      maxSessionsPerWeek: 5,
      maxSessionMinutes: 180,
      preferredSurfaces: ["road", "trail"] as const,
      avoidBackToBackHardDays: true,
    },
    constraints: [{
      startDate: "2026-08-20",
      endDate: "2026-08-22",
      category: "travel" as const,
      impact: "reduced_training" as const,
    }],
    wellbeingCheckIns: [{
      recordedOn: "2026-08-10",
      energy: 4,
      fatigue: 2,
      soreness: 1,
      sleepQuality: 4,
      stress: 2,
    }],
    activityReflections: [{
      activityId: "activity_001",
      perceivedEffort: 6,
      enjoyment: 5,
      pain: 0,
      outcome: "as_expected" as const,
    }],
  },
};

test("actor construction preserves an explicit two-athlete scope and denies a third athlete", () => {
  const actor = buildActorContext({
    userId: "user_owner",
    permittedAthleteIds: ["athlete_001", "athlete_002"],
    activeAthleteId: "athlete_002",
    requestId: "request_001",
    credentialKind: "session",
  });

  assert.deepEqual(actor.permittedAthleteIds, ["athlete_001", "athlete_002"]);
  assert.equal(athleteScopeFor(actor).athleteId, "athlete_002");
  assert.equal(athleteScopeFor(actor, "athlete_001").athleteId, "athlete_001");
  assert.throws(() => athleteScopeFor(actor, "athlete_003"), /not authorized/);
  assert.throws(() => actor.permittedAthleteIds.push("athlete_003"), TypeError);
});

test("actor contracts fail closed for duplicate grants and an ungranted active athlete", () => {
  const base = {
    userId: "user_owner",
    permittedAthleteIds: ["athlete_001"],
    activeAthleteId: "athlete_001",
    requestId: "request_001",
    credentialKind: "session",
  } as const;
  assert.equal(actorContextSchema.safeParse(base).success, true);
  assert.equal(actorContextSchema.safeParse({
    ...base,
    permittedAthleteIds: ["athlete_001", "athlete_001"],
  }).success, false);
  assert.equal(actorContextSchema.safeParse({ ...base, activeAthleteId: "athlete_002" }).success, false);
  assert.equal(actorContextSchema.safeParse({ ...base, isAdministrator: true }).success, false);
});

test("Second Brain selectedFields exactly equal the strict context sections", () => {
  assert.equal(secondBrainContextSnapshotSchema.safeParse(completeSnapshot).success, true);
  assert.equal(secondBrainContextSnapshotSchema.safeParse({
    ...completeSnapshot,
    selectedFields: completeSnapshot.selectedFields.slice(0, 4),
  }).success, false);
  assert.equal(secondBrainContextSnapshotSchema.safeParse({
    ...completeSnapshot,
    selectedFields: [...completeSnapshot.selectedFields, "availability"],
  }).success, false);
  assert.equal(secondBrainContextSnapshotSchema.safeParse({
    ...completeSnapshot,
    selectedFields: ["availability"],
    context: {},
  }).success, false);
});

test("Second Brain v1 rejects free text, unknown keys, vault paths, and plan mutations", () => {
  const prohibited = [
    { ...completeSnapshot, note: "private prose" },
    { ...completeSnapshot, sourcePath: "C:/Users/owner/Obsidian/private.md" },
    { ...completeSnapshot, plan: { operation: "activate" } },
    {
      ...completeSnapshot,
      context: { ...completeSnapshot.context, goal: { target: "Sub-90" } },
    },
    {
      ...completeSnapshot,
      context: {
        ...completeSnapshot.context,
        activityReflections: [{ ...completeSnapshot.context.activityReflections[0], notes: "Felt strong" }],
      },
    },
    {
      ...completeSnapshot,
      context: {
        ...completeSnapshot.context,
        constraints: [{ ...completeSnapshot.context.constraints[0], description: "Personal travel details" }],
      },
    },
  ];

  for (const value of prohibited) {
    assert.equal(secondBrainContextSnapshotSchema.safeParse(value).success, false);
  }
});

test("Second Brain bounds, dates, revision, version, and hash envelope are enforced", () => {
  const invalidSnapshots = [
    { ...completeSnapshot, schemaVersion: "second-brain-context.v2" },
    { ...completeSnapshot, revision: 0 },
    { ...completeSnapshot, revision: 1.5 },
    { ...completeSnapshot, contentHash: "A".repeat(64) },
    { ...completeSnapshot, contentHash: "a".repeat(63) },
    {
      ...completeSnapshot,
      context: { ...completeSnapshot.context, availability: { weeklyMinutesBudget: 10_081 } },
    },
    {
      ...completeSnapshot,
      context: { ...completeSnapshot.context, trainingPreferences: { maxSessionsPerWeek: 0 } },
    },
    {
      ...completeSnapshot,
      context: { ...completeSnapshot.context, trainingPreferences: { maxSessionMinutes: 361 } },
    },
    {
      ...completeSnapshot,
      context: {
        ...completeSnapshot.context,
        wellbeingCheckIns: [{ ...completeSnapshot.context.wellbeingCheckIns[0], energy: 6 }],
      },
    },
    {
      ...completeSnapshot,
      context: {
        ...completeSnapshot.context,
        activityReflections: [{ ...completeSnapshot.context.activityReflections[0], pain: 11 }],
      },
    },
    {
      ...completeSnapshot,
      context: {
        ...completeSnapshot.context,
        constraints: [{ ...completeSnapshot.context.constraints[0], endDate: "2026-08-19" }],
      },
    },
  ];

  for (const value of invalidSnapshots) {
    assert.equal(secondBrainContextSnapshotSchema.safeParse(value).success, false);
  }
  assert.ok(new TextEncoder().encode(JSON.stringify(completeSnapshot)).byteLength < SECOND_BRAIN_CONTEXT_MAX_BYTES);
});

test("canonical Second Brain hash input excludes revision and publication time", () => {
  const first = canonicalSecondBrainHashInput(completeSnapshot);
  const second = canonicalSecondBrainHashInput({
    ...completeSnapshot,
    revision: 99,
    publishedAt: "2027-01-01T00:00:00.000Z",
    selectedFields: [...completeSnapshot.selectedFields].reverse(),
  });
  assert.equal(first, second);
  assert.match(first, /"schemaVersion":"second-brain-context.v1"/);
  assert.doesNotMatch(first, /publishedAt|revision/);
});

test("provider connection/status contracts remain provider-neutral and never expose tokens", () => {
  const connection = {
    athleteId: "athlete_001",
    provider: "strava" as const,
    status: "connected" as const,
    displayStatus: "connected" as const,
    connectedAt: publishedAt,
    lastSuccessfulProviderContactAt: publishedAt,
    lastSuccessfulSyncAt: publishedAt,
    lastEventReceivedAt: null,
    lastErrorCode: null,
    updatedAt: publishedAt,
  };
  assert.equal(providerConnectionStatusSchema.safeParse(connection).success, true);
  assert.equal(providerStatusApiResponseSchema.safeParse({ data: { connection } }).success, true);
  assert.equal(providerConnectionStatusSchema.safeParse({ ...connection, accessToken: "secret" }).success, false);
  assert.equal(providerConnectionStatusSchema.safeParse({ ...connection, provider: "garmin" }).success, false);
});

test("sync contracts scope every change/device/status to an athlete and enforce tombstones", () => {
  const change = {
    cursor: "42",
    athleteId: "athlete_001",
    entityType: "activity" as const,
    entityId: "activity_001",
    entityRevision: 2,
    operation: "upsert" as const,
    changedAt: publishedAt,
    payload: { distanceM: 10_000 },
  };
  assert.equal(syncChangeSchema.safeParse(change).success, true);
  assert.equal(syncChangeSchema.safeParse({ ...change, athleteId: undefined }).success, false);
  assert.equal(syncChangeSchema.safeParse({ ...change, cursor: "0" }).success, false);
  assert.equal(syncChangeSchema.safeParse({ ...change, operation: "delete", payload: {} }).success, false);
  assert.equal(syncChangeSchema.safeParse({ ...change, payload: null }).success, false);
  assert.equal(syncChangeSchema.safeParse({ ...change, operation: "delete", payload: null }).success, true);

  assert.equal(pairedDeviceSchema.safeParse({
    id: "device_001", athleteId: "athlete_001", displayName: "Home workstation",
    status: "active", lastAcknowledgedCursor: null, lastSeenAt: null,
    createdAt: publishedAt, revokedAt: null,
  }).success, true);
  assert.equal(syncStatusSchema.safeParse({
    athleteId: "athlete_001",
    workoutIngestion: { state: "current", lastSuccessfulAt: publishedAt, staleAfter: null, diagnosticCode: null },
    secondBrainContext: { state: "never", lastSuccessfulAt: null, staleAfter: null, diagnosticCode: null },
    localProjection: { state: "stale", lastSuccessfulAt: publishedAt, staleAfter: publishedAt, diagnosticCode: "DEVICE_OFFLINE" },
    pendingJobs: 0,
    failedJobs: 0,
    updatedAt: publishedAt,
  }).success, true);
});

test("Strava is additive to existing activity sources", () => {
  assert.equal(sourceTypeSchema.safeParse("strava").success, true);
  assert.equal(sourceTypeSchema.safeParse("gpx").success, true);

  const result = activityDetailSchema.safeParse({
    id: "activity_001",
    athleteId: "athlete_001",
    title: "Synthetic run",
    occurredAt: "2026-08-10T06:00:00.000Z",
    sport: "run",
    distanceM: 5_000,
    elapsedTimeS: 1_800,
    avgPaceSecPerKm: 360,
    elevationGainM: 20,
    hrAvailable: false,
    cadenceAvailable: false,
    endedAt: "2026-08-10T06:30:00.000Z",
    sourceType: "strava",
    elevationLossM: 20,
    dedupeHash: hash,
    createdAt: "2026-08-10T06:31:00.000Z",
    splits: [],
  });
  assert.equal(result.success, true);
});
