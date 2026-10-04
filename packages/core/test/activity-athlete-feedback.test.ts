import assert from "node:assert/strict";
import test from "node:test";
import { activityAthleteFeedbackArtifactSchema } from "../src/contracts/activity-review.ts";
import { hashAthleteFeedbackArtifact, validateAthleteFeedbackArtifact } from "../src/services/activity-athlete-feedback.ts";

function artifact() {
  const base = {
    id: "feedback_1",
    athleteId: "athlete_1",
    activityId: "activity_1",
    revision: 1,
    activityRevision: 3,
    headline: "The effort matched the plan",
    summary: "The recorded metrics support the planned session.",
    model: "local-codex",
    artifactId: "artifact_1",
    approvedAt: "2026-10-01T10:00:00.000Z",
    publishedAt: "2026-10-01T10:00:00.000Z",
    expectedActivityRevision: 3,
    expectedFeedbackRevision: 0,
  };
  return { ...base, artifactHash: hashAthleteFeedbackArtifact(base) };
}

test("athlete feedback artifacts require a matching content hash", () => {
  const parsed = validateAthleteFeedbackArtifact(artifact());
  assert.equal(parsed.activityId, "activity_1");
  assert.throws(() => validateAthleteFeedbackArtifact({ ...artifact(), summary: "changed" }), /hash is invalid/);
});

test("athlete feedback artifact contract keeps the expected revisions explicit", () => {
  const parsed = activityAthleteFeedbackArtifactSchema.parse(artifact());
  assert.deepEqual({ activity: parsed.expectedActivityRevision, feedback: parsed.expectedFeedbackRevision }, { activity: 3, feedback: 0 });
});
