import assert from "node:assert/strict";
import test from "node:test";
import { trainingPlanSchema } from "../../core/src/contracts/coaching.ts";
import { calculatePlanProposalContentHash } from "../../core/src/services/plan-proposal-hash.ts";
import { buildVerifiedLocalPlanGoalContext } from "../src/local-plan-goal-context.js";

const athleteId = "athlete-local-goal-context";
const timestamps = {
  createdAt: "2026-08-01T08:00:00.000Z",
  draftUpdatedAt: "2026-08-01T08:00:00.000Z",
  settledAt: "2026-08-02T08:00:00.000Z",
};

function fixture({ version = 1, withMilestone = false, unverifiable = false, changedGoal = false } = {}) {
  const target = { kind: "performance", distanceMeters: 42_195, targetDate: "2026-11-01", targetTimeSeconds: 14_400 };
  const proposalGoal = {
    id: "goal-local", athleteId, revision: 2, title: "Marathon target", why: "Synthetic approved goal",
    target, status: "draft", createdAt: timestamps.createdAt, updatedAt: timestamps.draftUpdatedAt,
  };
  const proposalBody = {
    id: "proposal-local", athleteId, goalId: proposalGoal.id, goalRevision: proposalGoal.revision,
    routineRevision: 1, version, revision: 1, startsOn: "2026-08-03", endsOn: "2026-08-09",
    timezone: "Africa/Johannesburg",
    weeklyStructure: [{ weekStartsOn: "2026-08-03", focus: "Synthetic approved week", sessionIds: ["run-local"] }],
    workouts: [{ id: "run-local", kind: "run", scheduledDate: "2026-08-03", title: "Easy run", purpose: "Aerobic base", prescription: "Run easily for 30 minutes.", cautions: [], durationMinutes: 30 }],
    contextArtifactId: "context-local", createdAt: timestamps.createdAt,
    status: "proposed", proposedGoal: proposalGoal, goalRationale: "Synthetic rationale", rationale: "Synthetic rationale",
    summary: "Synthetic plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64),
    ...(withMilestone ? { milestones: [{ id: "half-local", title: "Half marathon", distanceMeters: 21_097.5, targetDate: "2026-10-01", targetTimeSeconds: 7_200 }] } : {}),
  };
  const contentHash = calculatePlanProposalContentHash(proposalBody);
  const sourceProposal = { ...proposalBody, contentHash };
  const storedGoal = {
    id: proposalGoal.id, athleteId, version: proposalGoal.revision, lifecycle: "settled",
    title: changedGoal ? "Different title" : proposalGoal.title,
    details: { why: proposalGoal.why, target }, createdAt: timestamps.createdAt,
    updatedAt: timestamps.settledAt, settledAt: timestamps.settledAt,
  };
  const storedPlan = {
    id: "plan-local", athleteId, version, goalId: proposalGoal.id, lifecycle: "active",
    startDate: proposalBody.startsOn, endDate: proposalBody.endsOn,
    summary: { contentHash, goalRevision: proposalGoal.revision, sourceProposal: unverifiable ? undefined : sourceProposal },
  };
  const approvedPlan = trainingPlanSchema.parse({
    id: storedPlan.id, athleteId, goalId: storedPlan.goalId, goalRevision: proposalGoal.revision,
    routineRevision: 1, version, revision: 2, startsOn: storedPlan.startDate, endsOn: storedPlan.endDate,
    timezone: proposalBody.timezone, weeklyStructure: proposalBody.weeklyStructure,
    workouts: proposalBody.workouts, ...(withMilestone ? { milestones: sourceProposal.milestones } : {}),
    contextArtifactId: proposalBody.contextArtifactId, createdAt: timestamps.createdAt,
    approval: { goalRationale: "Synthetic rationale", rationale: "Synthetic rationale", summary: "Synthetic plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash },
    status: "active", activatedAt: timestamps.settledAt, activatedBy: "user",
  });
  const repository = {
    loadPlan: (planId) => planId === storedPlan.id ? storedPlan : null,
    loadGoal: (goalId) => goalId === storedGoal.id ? storedGoal : null,
  };
  return { repository, approvedPlan, contentHash };
}

test("verified sidecar source round-trips approved v1 and v2 plan context", () => {
  const legacy = fixture();
  const v1 = buildVerifiedLocalPlanGoalContext({
    repository: legacy.repository, athleteId, planId: "plan-local", expectedPlan: legacy.approvedPlan,
  });
  assert.equal(v1.state, "verified");
  assert.deepEqual(v1.value.milestones, []);
  assert.equal(v1.value.approvalContentHash, legacy.contentHash);

  const v2 = fixture({ version: 2, withMilestone: true });
  const verifiedV2 = buildVerifiedLocalPlanGoalContext({
    repository: v2.repository, athleteId, planId: "plan-local", expectedPlan: v2.approvedPlan,
  });
  assert.equal(verifiedV2.state, "verified");
  assert.equal(verifiedV2.value.milestones[0].title, "Half marathon");
});

test("legacy fallbacks, changed goal snapshots, and unverifiable approval sources cannot be backfilled", () => {
  const missingSource = fixture({ unverifiable: true });
  assert.deepEqual(buildVerifiedLocalPlanGoalContext({ repository: missingSource.repository, athleteId, planId: "plan-local" }), {
    state: "unavailable", reasonCode: "proposal_source_unverifiable",
  });

  const mismatchedGoal = fixture({ changedGoal: true });
  assert.equal(buildVerifiedLocalPlanGoalContext({ repository: mismatchedGoal.repository, athleteId, planId: "plan-local" }).reasonCode, "goal_source_mismatch");

  const badPlan = fixture();
  assert.equal(buildVerifiedLocalPlanGoalContext({
    repository: badPlan.repository, athleteId, planId: "plan-local",
    expectedPlan: { ...badPlan.approvedPlan, approval: { ...badPlan.approvedPlan.approval, contentHash: "c".repeat(64) } },
  }).reasonCode, "published_plan_mismatch");
});
