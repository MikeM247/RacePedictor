import {
  anyPlanProposalSchema,
  settledGoalSchema,
  trainingPlanGoalContextPublishRequestSchema,
  trainingPlanSchema,
} from "../../core/src/contracts/coaching.ts";
import { calculatePlanProposalContentHash } from "../../core/src/services/plan-proposal-hash.ts";
import { calculatePlanGoalContextHash } from "../../core/src/services/plan-goal-context.ts";
import { createLocalCoachingRepository } from "./local-coaching-repository.js";

/**
 * Rebuild sidecar context only from the immutable proposal retained on an
 * explicitly approved local plan. Legacy fallbacks are intentionally ignored.
 */
export function buildVerifiedLocalPlanGoalContext({ repository, athleteId, planId, expectedPlan } = {}) {
  if (!repository || typeof repository.loadPlan !== "function") throw new Error("A local coaching repository is required");
  if (typeof athleteId !== "string" || !athleteId.trim()) throw new Error("athleteId is required");
  if (typeof planId !== "string" || !planId.trim()) throw new Error("planId is required");

  const plan = repository.loadPlan(planId.trim());
  if (!plan || plan.athleteId !== athleteId || !["active", "superseded"].includes(plan.lifecycle)) return unavailable("approved_plan_unavailable");
  const sourceValue = plan.summary?.sourceProposal;
  const parsedSource = anyPlanProposalSchema.safeParse(sourceValue);
  if (!parsedSource.success) return unavailable("proposal_source_unverifiable");
  const source = parsedSource.data;
  const sourceHash = calculatePlanProposalContentHash(source);
  if (source.status !== "proposed"
    || source.athleteId !== athleteId
    || source.goalId !== plan.goalId
    || source.goalRevision !== (plan.summary?.goalRevision ?? source.goalRevision)
    || source.version !== plan.version
    || source.contentHash !== sourceHash
    || plan.summary?.contentHash !== sourceHash) return unavailable("proposal_linkage_unverifiable");

  const storedGoal = repository.loadGoal(plan.goalId);
  if (!storedGoal || !["settled", "superseded"].includes(storedGoal.lifecycle)) return unavailable("settled_goal_unavailable");
  const details = storedGoal.details && typeof storedGoal.details === "object" && !Array.isArray(storedGoal.details)
    ? storedGoal.details
    : {};
  const goal = settledGoalSchema.safeParse({
    id: storedGoal.id,
    athleteId: storedGoal.athleteId,
    revision: storedGoal.version,
    title: storedGoal.title,
    why: details.why,
    target: details.target,
    status: "settled",
    createdAt: storedGoal.createdAt,
    // Settlement is the stable version boundary. Goal.updatedAt may change
    // later when a replacement plan supersedes it, so it must not alter replay.
    updatedAt: storedGoal.settledAt,
    settledAt: storedGoal.settledAt,
    settledBy: "user",
  });
  if (!goal.success) return unavailable("settled_goal_unverifiable");
  const sameUserFields = stableJson(userFields(source.proposedGoal)) === stableJson(userFields(goal.data));
  if (!sameUserFields || goal.data.id !== plan.goalId || goal.data.revision !== source.goalRevision) return unavailable("goal_source_mismatch");

  const milestones = "milestones" in source ? source.milestones : [];
  if (expectedPlan) {
    const expected = trainingPlanSchema.safeParse(expectedPlan);
    if (!expected.success || expected.data.athleteId !== athleteId || expected.data.id !== plan.id
      || expected.data.version !== plan.version || expected.data.goalId !== plan.goalId
      || expected.data.goalRevision !== source.goalRevision || expected.data.approval.contentHash !== sourceHash
      || stableJson(expected.data.milestones ?? []) !== stableJson(milestones)) {
      return unavailable("published_plan_mismatch");
    }
  }

  const input = {
    athleteId,
    planId: plan.id,
    planVersion: plan.version,
    goalId: goal.data.id,
    goalRevision: goal.data.revision,
    approvalContentHash: sourceHash,
    goal: goal.data,
    milestones,
  };
  return {
    state: "verified",
    value: trainingPlanGoalContextPublishRequestSchema.parse({
      ...input,
      contextHash: calculatePlanGoalContextHash(input),
    }),
  };
}

export function buildVerifiedLocalPlanGoalContextFromDatabase({ databasePath, athleteId, planId, expectedPlan } = {}) {
  const repository = createLocalCoachingRepository({ databasePath, athleteId });
  try {
    return buildVerifiedLocalPlanGoalContext({ repository, athleteId, planId, expectedPlan });
  } finally {
    repository.close();
  }
}

function userFields(goal) {
  return {
    id: goal.id,
    athleteId: goal.athleteId,
    revision: goal.revision,
    title: goal.title,
    why: goal.why,
    target: goal.target,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function unavailable(reasonCode) {
  return { state: "unavailable", reasonCode };
}
