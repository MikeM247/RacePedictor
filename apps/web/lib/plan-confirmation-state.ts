/**
 * Consequential Plan actions deliberately keep their reviewed identity outside
 * the page's live read state.  Reads are allowed to refresh while a dialog is
 * open; they must never silently change the POST that a runner is confirming.
 */

export type PlanConfirmationKind = "approve" | "reject" | "activate";
export type PlanConfirmationPhase = "ready" | "pending" | "failure" | "conflict" | "uncertain" | "success";

export type PlanConfirmationSnapshot = {
  kind: PlanConfirmationKind;
  targetId: string;
  targetRevision: number | null;
  targetLabel: string;
  replacingPlanId: string | null;
  expectedActivePlanId: string | null;
  historyWasStale: boolean;
};

export type PlanConfirmation = {
  snapshot: PlanConfirmationSnapshot;
  phase: PlanConfirmationPhase;
  message?: string;
  acknowledgement: boolean;
};

export type PlanRequestError = { status?: number; code?: string };

const conflictCodes = new Set([
  "CONFLICT",
  "REVISION_CONFLICT",
  "PLAN_ACTIVATION_REJECTED",
  "PLAN_NOT_READY",
  "ACTIVE_PLAN_REQUIRED",
  "GOAL_VERSION_MISMATCH",
  "ROUTINE_VERSION_MISMATCH",
  "CONTEXT_VERSION_MISMATCH",
  "STALE_HISTORY_ACKNOWLEDGEMENT_REQUIRED",
]);

export function isPlanConflict(error: PlanRequestError) {
  return error.status === 409 || (typeof error.code === "string" && conflictCodes.has(error.code));
}

export function conflictMessage(error: PlanRequestError) {
  switch (error.code) {
    case "STALE_HISTORY_ACKNOWLEDGEMENT_REQUIRED":
      return "The training history changed after this draft was reviewed. Reload and review the current warning before confirming again.";
    case "PLAN_ACTIVATION_REJECTED":
    case "PLAN_NOT_READY":
      return "This plan can no longer be activated as reviewed. Reload the current Plan state and review the available version again.";
    case "REVISION_CONFLICT":
    case "GOAL_VERSION_MISMATCH":
    case "ROUTINE_VERSION_MISMATCH":
    case "CONTEXT_VERSION_MISMATCH":
      return "The draft changed after it was reviewed. Reload the current draft and review it again before confirming.";
    default:
      return "Plan information changed while this confirmation was open. Reload the current Plan state and review it again before confirming.";
  }
}

export function uncertainMessage(snapshot: PlanConfirmationSnapshot) {
  return snapshot.kind === "activate"
    ? "We could not confirm whether this approved plan was made active. Check the current plan before trying again."
    : snapshot.kind === "approve"
      ? "We could not confirm whether this draft was approved. Check the current plan before trying again."
      : "We could not confirm whether this draft was rejected. Check the current plan before trying again.";
}

export function canSubmitConfirmation(confirmation: PlanConfirmation | null) {
  if (!confirmation || confirmation.phase !== "ready") return false;
  const { snapshot } = confirmation;
  if (!snapshot.targetId || !Number.isInteger(snapshot.targetRevision) || (snapshot.targetRevision ?? 0) < 1) return false;
  return snapshot.kind !== "approve" || !snapshot.historyWasStale || confirmation.acknowledgement;
}

export function decisionRequestBody(snapshot: PlanConfirmationSnapshot, acknowledgement: boolean) {
  if (!snapshot.targetId || !Number.isInteger(snapshot.targetRevision) || (snapshot.targetRevision ?? 0) < 1) return null;
  if (snapshot.kind !== "approve" && snapshot.kind !== "reject") return null;
  return {
    decision: snapshot.kind,
    expectedRevision: snapshot.targetRevision,
    acknowledgeStale: acknowledgement,
    ...(snapshot.kind === "approve" && snapshot.replacingPlanId ? { replacingPlanId: snapshot.replacingPlanId } : {}),
  };
}

export function activationRequestBody(snapshot: PlanConfirmationSnapshot) {
  if (snapshot.kind !== "activate" || !snapshot.targetId) return null;
  return { expectedActivePlanId: snapshot.expectedActivePlanId };
}
