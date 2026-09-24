import assert from "node:assert/strict";
import test from "node:test";
import {
  activityCoachReviewSchema,
  activityReviewComparisonSchema,
} from "../src/contracts/activity-review.ts";
import {
  buildReviewComparison,
  buildReviewFacts,
  buildReviewPrompt,
  chooseSuggestedSession,
} from "../src/services/activity-coach-review.ts";

const activity = {
  id: "activity-1", athleteId: "athlete-1", sport: "run" as const,
  occurredAt: "2026-09-08T04:00:00.000Z", localOccurredAt: "2026-09-08T06:00:00+02:00",
  distanceM: 8200, elapsedTimeS: 2890, avgPaceSecPerKm: 352, elevationGainM: 70,
  avgHrBpm: null, splits: [],
};

test("suggests one same-day session and keeps multiple sessions ambiguous", () => {
  const session = { id: "session-1", planId: "plan-1", planVersion: 2, title: "Easy run", scheduledDate: "2026-09-08", durationMinutes: 45, distanceMeters: 8000, intensityRpe: 3 };
  assert.equal(chooseSuggestedSession(activity, [session]).state, "suggested");
  assert.equal(chooseSuggestedSession(activity, [session, { ...session, id: "session-2" }]).state, "ambiguous");
});

test("comparison uses measured facts and exposes missing evidence", () => {
  const facts = buildReviewFacts({ activity, sessions: [{ id: "session-1", planId: "plan-1", planVersion: 2, title: "Easy run", scheduledDate: "2026-09-08", durationMinutes: 45, distanceMeters: 8000, intensityRpe: 3 }] });
  const comparison = buildReviewComparison(facts);
  assert.equal(comparison.actualDurationMinutes, 48.2);
  assert.equal(comparison.plannedDistanceMeters, 8000);
  assert.match(comparison.interpretation, /over/u);
  assert.ok(facts.limitations.some((item) => /heart-rate/iu.test(item)));
  assert.match(buildReviewPrompt(facts), /Use only the supplied facts/u);
  assert.doesNotThrow(() => activityReviewComparisonSchema.parse(comparison));
});

test("review contract rejects invented identity and malformed hashes", () => {
  assert.throws(() => activityCoachReviewSchema.parse({
    id: "review-1", athleteId: "athlete-1", activityId: "activity-1", revision: 1,
    inputFingerprint: "bad", headline: "A review", assessment: "Assessment", nextStep: "Next",
    comparison: {}, evidence: [], limitations: [], generatedAt: "2026-09-08T06:00:00+02:00", publishedAt: "2026-09-08T06:00:00+02:00", model: "model", promptVersion: "v1",
  }));
});
