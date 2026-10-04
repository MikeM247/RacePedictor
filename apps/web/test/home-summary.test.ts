import test from "node:test";
import assert from "node:assert/strict";
import { compactHomeTakeaway, shortCompleteNarrative, approvedPlanSupport } from "../lib/home-summary.ts";
import type { ActivityCoachReview } from "../../../packages/core/src/contracts/activity-review.ts";
import type { GoalContextRouteData, TrainingPlan } from "../../../packages/core/src/contracts/coaching.ts";

test("compact takeaway preserves conditions and all distinct material limitations", () => {
  const review = { assessment: "If recovery remains normal, this measured effort supports the planned easy workload.", limitations: ["Plan link is unconfirmed.", "Heart rate was unavailable.", "Plan link is unconfirmed."] } as ActivityCoachReview;
  assert.deepEqual(compactHomeTakeaway(review), { assessment: review.assessment, limitations: ["Plan link is unconfirmed.", "Heart rate was unavailable."] });
  assert.equal(compactHomeTakeaway({ ...review, assessment: "A qualified passage. ".repeat(30) }), null);
  assert.equal(compactHomeTakeaway({ ...review, assessment: "Unpunctuated conditional advice if" }), null);
  assert.equal(compactHomeTakeaway({ ...review, limitations: ["Material evidence limits ".repeat(80)] }), null);
  assert.equal(shortCompleteNarrative("Build gradually."), "Build gradually.");
  assert.equal(shortCompleteNarrative("Long approved rationale ".repeat(40)), null);
});

test("plan rationale requires the exact approved goal and plan identity", () => {
  const context = { plan: { id: "p1", version: 2, approvalContentHash: "a".repeat(64) }, goal: { id: "g1", revision: 3 } } as GoalContextRouteData;
  const plan = { id: "p1", version: 2, status: "active", goalId: "g1", goalRevision: 3, approval: { contentHash: "a".repeat(64), rationale: "Build endurance gradually." } } as TrainingPlan;
  assert.equal(approvedPlanSupport(context, plan), plan.approval.rationale);
  assert.equal(approvedPlanSupport(context, { ...plan, version: 4 }), null);
  assert.equal(approvedPlanSupport(context, { ...plan, goalRevision: 4 }), null);
  assert.equal(approvedPlanSupport(context, { ...plan, approval: { ...plan.approval, contentHash: "b".repeat(64) } }), null);
});
