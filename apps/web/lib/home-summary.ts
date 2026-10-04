import type { ActivityCoachReview } from "../../../packages/core/src/contracts/activity-review.ts";
import type { GoalContextRouteData, TrainingPlan } from "../../../packages/core/src/contracts/coaching.ts";

export function approvedPlanSupport(context: GoalContextRouteData, plan: TrainingPlan | null): string | null {
  if (!context.plan || !context.goal || !plan || plan.status !== "active") return null;
  if (context.plan.id !== plan.id || context.plan.version !== plan.version
    || context.plan.approvalContentHash !== plan.approval.contentHash
    || context.goal.id !== plan.goalId || context.goal.revision !== plan.goalRevision) return null;
  return plan.approval.rationale;
}

export function shortCompleteNarrative(text: string | null | undefined): string | null {
  const value = text?.trim();
  return value && value.length <= 300 && value.split(/\s+/u).length <= 45 ? value : null;
}

// Show the supplied complete assessment and every distinct limitation, or no
// conclusion at all. A headline/excerpt can lose a material condition.
export function compactHomeTakeaway(review: ActivityCoachReview) {
  const assessment = review.assessment.trim();
  const limitations = [...new Set(review.limitations.map((value) => value.trim()))];
  const words = [assessment, ...limitations].join(" ").split(/\s+/u).length;
  if (!/[.!?]["')\]]?$/u.test(assessment) || assessment.length > 300 || words > 70) return null;
  return { assessment, limitations };
}
