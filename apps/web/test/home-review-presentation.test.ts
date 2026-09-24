import assert from "node:assert/strict";
import test from "node:test";
import type { ActivityCoachReview } from "../../../packages/core/src/contracts/activity-review.ts";
import { presentHomeReview } from "../lib/home-review-presentation.ts";

const review = (overrides: Partial<ActivityCoachReview> = {}): ActivityCoachReview => ({
  id: "review-1", athleteId: "athlete-1", activityId: "activity-1", revision: 4,
  inputFingerprint: "a".repeat(64), headline: "A controlled session.",
  assessment: "Your pace stayed even. The recorded effort remained controlled.",
  nextStep: "If your legs feel normal tomorrow, keep the approved easy session.",
  comparison: { matchState: "ambiguous", planId: "plan-older", sessionId: null, planVersion: 2, sessionTitle: null, plannedDurationMinutes: null, actualDurationMinutes: 45, plannedDistanceMeters: null, actualDistanceMeters: 8_000, plannedIntensityRpe: null, actualPerceivedEffort: null, interpretation: "The plan match is uncertain because no session was linked." },
  evidence: [], limitations: ["Heart-rate data was not supplied."],
  generatedAt: "2026-09-15T08:00:00.000Z", publishedAt: "2026-09-15T08:01:00.000Z", model: "test-model", promptVersion: "test.v1",
  ...overrides,
});

test("Home presenter retains short source text, provenance, and conditional advice without rewriting it", () => {
  const source = review();
  const presentation = presentHomeReview(source);
  assert.equal(presentation.reviewId, source.id);
  assert.equal(presentation.revision, source.revision);
  assert.equal(presentation.headline, source.headline);
  assert.equal(presentation.assessment, source.assessment);
  assert.equal(presentation.advice, source.nextStep);
  assert.equal(presentation.isFullPassageFallback, false);
  assert.ok(presentation.commentaryWordCount <= 80);
});

test("Home presenter keeps a trailing qualification instead of making an unsafe excerpt", () => {
  const assessment = "The pace was steady. Do not treat this one session as evidence of a race-time improvement.";
  const presentation = presentHomeReview(review({ assessment, nextStep: "Keep the approved plan." }));
  assert.equal(presentation.assessment, assessment);
  assert.match(presentation.assessment, /Do not treat/);
  assert.equal(presentation.advice, "Keep the approved plan.");
});

test("Home presenter omits rather than clips advice when its condition would exceed the normal budget", () => {
  const conditionalAdvice = `If soreness increases after the warm-up, ${Array.from({ length: 75 }, () => "recover").join(" ")} before resuming harder work.`;
  const presentation = presentHomeReview(review({
    headline: "A steady run.",
    assessment: "The recorded pace was controlled. The session did not establish a target-race change.",
    nextStep: conditionalAdvice,
  }));
  assert.equal(presentation.advice, null);
  assert.equal(presentation.assessment, "The recorded pace was controlled. The session did not establish a target-race change.");
  assert.ok(presentation.commentaryWordCount <= 80);
});

test("Home presenter uses the documented full-passage fallback for long text", () => {
  const longAssessment = Array.from({ length: 85 }, (_, index) => `word${index + 1}`).join(" ") + ".";
  const presentation = presentHomeReview(review({ assessment: longAssessment }));
  assert.equal(presentation.assessment, longAssessment);
  assert.equal(presentation.headline, null);
  assert.equal(presentation.advice, null);
  assert.equal(presentation.isFullPassageFallback, true);
  assert.equal(presentation.fallbackReason, "over-budget");
  assert.ok(presentation.commentaryWordCount > 80);
});

test("Home presenter uses the full-passage fallback for unpunctuated text", () => {
  const unpunctuated = "Keep the effort easy if fatigue remains noticeable after the warm up";
  const presentation = presentHomeReview(review({ assessment: unpunctuated }));
  assert.equal(presentation.assessment, unpunctuated);
  assert.equal(presentation.isFullPassageFallback, true);
  assert.equal(presentation.fallbackReason, "unpunctuated");
});

test("Home presenter preserves all distinct material limitations verbatim", () => {
  const presentation = presentHomeReview(review({ limitations: ["GPS coverage was incomplete.", "GPS coverage was incomplete.", "No planned session was linked."] }));
  assert.deepEqual(presentation.limitations, ["GPS coverage was incomplete.", "No planned session was linked."]);
});
