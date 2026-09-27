import assert from "node:assert/strict";
import test from "node:test";
import { buildActorContext, athleteScopeFor } from "../../core/src/contracts/auth.ts";
import { PrismaActivityReviewRepository } from "../src/cloud/prisma-activity-review-repository.js";
import { RacePredictorSyncClient } from "../src/local-sync-client.js";

test("targeted review claim filters before acquiring a lease", async () => {
  const actor = buildActorContext({
    userId: "device:device_test",
    permittedAthleteIds: ["athlete-a"],
    activeAthleteId: "athlete-a",
    requestId: "request-test",
    credentialKind: "device",
  });
  let queriedWhere;
  const lockedIds = [];
  const repository = new PrismaActivityReviewRepository({
    prisma: {
      activityReviewRequest: {
        async findFirst() { return null; },
        async findMany({ where }) {
          queriedWhere = where;
          return [{ id: "request-target", activityId: "activity-target" }];
        },
        async updateMany({ where }) {
          lockedIds.push(where.id);
          return { count: 1 };
        },
      },
      activityCoachReview: {},
    },
  });
  const result = await repository.claim(athleteScopeFor(actor), "device_test", 1, "activity-target");
  assert.equal(queriedWhere.athleteId, "athlete-a");
  assert.equal(queriedWhere.activityId, "activity-target");
  assert.deepEqual(lockedIds, ["request-target"]);
  assert.deepEqual(result.items.map((item) => item.activityId), ["activity-target"]);
});

test("same device can resume its targeted processing lease without claiming another request", async () => {
  let searchedQueue = false;
  const repository = new PrismaActivityReviewRepository({
    prisma: {
      activityReviewRequest: {
        async findFirst({ where }) {
          assert.equal(where.activityId, "activity-target");
          assert.equal(where.lockedBy, "device_test");
          return { id: "request-target", activityId: "activity-target", leaseToken: "existing-lease" };
        },
        async findMany() { searchedQueue = true; return []; },
      },
      activityCoachReview: {},
    },
  });
  const actor = buildActorContext({
    userId: "device:device_test",
    permittedAthleteIds: ["athlete-a"],
    activeAthleteId: "athlete-a",
    requestId: "request-test",
    credentialKind: "device",
  });
  const result = await repository.claim(athleteScopeFor(actor), "device_test", 1, "activity-target");
  assert.equal(searchedQueue, false);
  assert.deepEqual(result.items, [{ requestId: "request-target", activityId: "activity-target", leaseToken: "existing-lease", status: "processing" }]);
});

test("local sync client requests only the selected activity review", async () => {
  let requestedUrl;
  const client = new RacePredictorSyncClient({
    baseUrl: "https://racepedictor.example",
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => ({ data: { items: [] } }) };
    },
  });
  await client.claimActivityReviews("device-token", 1, "activity_strava_123");
  assert.equal(requestedUrl.searchParams.get("limit"), "1");
  assert.equal(requestedUrl.searchParams.get("activityId"), "activity_strava_123");
});

test("local sync client validates and sends the full review artifact including its lease", async () => {
  let sent;
  const client = new RacePredictorSyncClient({
    baseUrl: "https://racepedictor.example",
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ data: { review: sent } }) };
    },
  });
  const artifact = {
    id: "review-1", athleteId: "athlete-a", activityId: "activity-target", revision: 1,
    inputFingerprint: "a".repeat(64), headline: "A good easy run", assessment: "Matched the plan.", nextStep: "Rest tomorrow.",
    comparison: {
      matchState: "confirmed", planId: "plan-1", sessionId: "session-1", planVersion: 1,
      sessionTitle: "Easy run", plannedDurationMinutes: 60, actualDurationMinutes: 62,
      plannedDistanceMeters: 8000, actualDistanceMeters: 8100, plannedIntensityRpe: 3,
      actualPerceivedEffort: 3, interpretation: "Within the planned effort.",
    },
    evidence: [{ source: "activity", label: "Recorded run" }], limitations: [],
    generatedAt: "2026-09-27T12:00:00.000Z", publishedAt: "2026-09-27T12:00:00.000Z",
    model: "manual review", promptVersion: "v1", requestId: "request-1", leaseToken: "lease-1",
    expectedActivityRevision: 1,
  };
  await client.publishActivityReview("device-token", artifact);
  assert.deepEqual(sent, artifact);
});
