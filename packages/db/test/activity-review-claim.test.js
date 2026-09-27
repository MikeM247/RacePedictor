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
