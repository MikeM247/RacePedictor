/** Small, side-effect-free Plan state rules.  Keeping these here makes the
 * ordering and eligibility guarantees testable without a browser. */
export type PlanReadStatus = "loading" | "success" | "error";

export function isDocumentedActivePlanAbsence(error: { status?: number; code?: string }) {
  return error.status === 404 && error.code === "NOT_FOUND";
}

export function isPrivacyReadFailure(error: { status?: number }) {
  return error.status === 401 || error.status === 403;
}

export function isActionableProposal(input: {
  proposal: Record<string, unknown> | null;
  activePlan: Record<string, unknown> | null;
  activePlanStatus: PlanReadStatus;
  contextArtifactId?: string;
}) {
  const proposal = input.proposal;
  if (!proposal || proposal.status !== "proposed" || typeof proposal.id !== "string") return false;
  if (input.activePlanStatus !== "success") return false;
  if (input.contextArtifactId && proposal.contextArtifactId !== input.contextArtifactId) return false;
  return !input.activePlan || Number(proposal.version ?? 0) > Number(input.activePlan.version ?? 0);
}

export function shouldApplyRead(currentGeneration: number, responseGeneration: number) {
  return currentGeneration === responseGeneration;
}

export function restorationValues(context: Record<string, unknown>) {
  const profile = object(context.profile);
  const routine = object(context.routine);
  const goal = object(context.planningGoal);
  const target = object(goal.target);
  const days = Array.isArray(routine.days) ? routine.days.flatMap((value) => {
    const day = object(value);
    return day.available === true && typeof day.day === "string" ? [day.day] : [];
  }) : [];
  return {
    displayName: string(profile.displayName), why: string(profile.why), title: string(goal.title),
    targetDate: string(target.targetDate), distanceKm: typeof target.distanceMeters === "number" ? String(target.distanceMeters / 1000) : undefined,
    targetTime: typeof target.targetTimeSeconds === "number" ? secondsToTime(target.targetTimeSeconds) : undefined,
    timezone: string(profile.timezone) ?? string(routine.timezone), units: string(profile.units),
    preferredLongRunDay: string(routine.preferredLongRunDay),
    desiredSessionsPerWeek: typeof routine.desiredSessionsPerWeek === "number" ? routine.desiredSessionsPerWeek : undefined,
    goalKind: string(target.kind),
    days,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function string(value: unknown) { return typeof value === "string" ? value : undefined; }
function secondsToTime(total: number) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
