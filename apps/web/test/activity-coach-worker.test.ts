import assert from "node:assert/strict";
import test from "node:test";
import { activityCoachReviewArtifactSchema, type ActivityCoachReviewArtifact } from "../../../packages/core/src/contracts/activity-review.ts";
import { PrismaActivityReviewRepository, PrismaCloudActivityRepository, PrismaCloudCoachingRepository, PrismaCalendarSessionAmendmentRepository } from "../../../packages/db/src/cloud/index.js";
import { runCloudCoachFeedbackBatch } from "../lib/server/activity-coach-worker.ts";

test("cloud coach worker publishes generated feedback under the review contract", async (context) => {
  const clientKey = "__racePredictorCloudPrismaClient";
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const previousClient = globals[clientKey];
  // Replace the existing client cache only in this test process. No DB connection is created.
  globals[clientKey] = {
    activityReviewRequest: { aggregate: async () => ({ _sum: { attemptCount: 0 } }) },
    activityCoachReview: {}, activity: {}, trainingPlanProjection: {},
    calendarSessionProjection: {}, calendarSessionAmendment: {}, $transaction: async () => {},
  };
  const athleteId = "athlete-worker-test";
  const activityId = "activity-worker-test";
  const timestamp = "2026-10-04T06:00:00.000Z";
  const published: ActivityCoachReviewArtifact[] = [];
  const failures: string[] = [];
  const scoped = (scope: { athleteId: string }) => assert.equal(scope.athleteId, athleteId);
  context.mock.method(PrismaActivityReviewRepository.prototype, "claim", async (scope: { athleteId: string }) => {
    scoped(scope);
    return { items: [{ requestId: "request-worker-test", activityId, leaseToken: "lease-worker-test", status: "processing" }] };
  });
  context.mock.method(PrismaActivityReviewRepository.prototype, "get", async () => ({ review: null }));
  context.mock.method(PrismaActivityReviewRepository.prototype, "recordInputSnapshot", async () => {});
  context.mock.method(PrismaActivityReviewRepository.prototype, "recordProviderResult", async () => {});
  context.mock.method(PrismaActivityReviewRepository.prototype, "markFailure", async (_scope: unknown, _request: string, _device: string, reason: string) => { failures.push(reason); });
  context.mock.method(PrismaActivityReviewRepository.prototype, "publish", async (scope: { athleteId: string }, artifact: unknown) => {
    scoped(scope);
    const parsed = activityCoachReviewArtifactSchema.parse(artifact);
    published.push(parsed);
    return parsed;
  });
  context.mock.method(PrismaCloudActivityRepository.prototype, "findById", async (scope: { athleteId: string }) => {
    scoped(scope);
    return { id: activityId, athleteId, sport: "run", occurredAt: timestamp, localOccurredAt: timestamp,
      distanceM: 5000, elapsedTimeS: 1800, elevationGainM: 0, elevationLossM: 0, splits: [] };
  });
  context.mock.method(PrismaCloudActivityRepository.prototype, "currentRevision", async () => 1);
  context.mock.method(PrismaCloudCoachingRepository.prototype, "getActivePlan", async () => ({ id: "plan-worker-test", version: 1 }));
  context.mock.method(PrismaCalendarSessionAmendmentRepository.prototype, "listActiveCalendar", async () => [{
    id: "session-worker-test", kind: "run", status: "upcoming", title: "Easy run", effectiveDate: "2026-10-04",
    durationMinutes: 30, distanceMeters: 5000, purpose: "Easy aerobic work", prescription: "Run comfortably.",
  }]);
  let providerCalls = 0;
  const fetchImpl: typeof fetch = async (_url, init) => {
    providerCalls += 1;
    assert.equal(init?.method, "POST");
    assert.equal(JSON.parse(String(init?.body)).store, false);
    return Response.json({ output_text: JSON.stringify({ headline: "An easy recorded run", assessment: "The recorded distance matches the suggested session.",
      nextStep: "Review the next planned session.", evidence: [{ source: "activity", label: "Recorded 5 km" }, { source: "plan", label: "Suggested 5 km" }], limitations: [] }) });
  };
  try {
    const result = await runCloudCoachFeedbackBatch({ athleteId, limit: 1, apiKey: "synthetic-provider-key-not-a-secret", model: "test-model", fetchImpl, now: () => new Date(timestamp) });
    assert.deepEqual(result, { status: "processed", processed: 1, results: [{ activityId, status: "ready" }] });
    assert.deepEqual(failures, []);
    assert.equal(providerCalls, 1);
    assert.equal(published.length, 1);
    assert.equal(published[0].promptVersion, "activity-coach-review.cloud-metrics.v1");
    assert.equal(published[0].provenance, "cloud_metrics_plan");
    assert.equal(published[0].expectedActivityRevision, 1);
    assert.equal(published[0].comparison.sessionId, "session-worker-test");
    assert.equal(published[0].requestId, "request-worker-test");
    assert.equal(published[0].leaseToken, "lease-worker-test");
  } finally {
    if (previousClient === undefined) delete globals[clientKey];
    else globals[clientKey] = previousClient;
  }
});
