import { createHash } from "node:crypto";

type ProposalValue = Record<string, unknown>;

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]));
  }
  return value;
};

const proposalContent = (proposal: ProposalValue) => ({
  athleteId: proposal.athleteId,
  goalId: proposal.goalId,
  goalRevision: proposal.goalRevision,
  routineRevision: proposal.routineRevision,
  proposedGoal: proposal.proposedGoal,
  goalRationale: proposal.goalRationale,
  startsOn: proposal.startsOn,
  endsOn: proposal.endsOn,
  timezone: proposal.timezone,
  weeklyStructure: proposal.weeklyStructure,
  workouts: proposal.workouts,
  contextArtifactId: proposal.contextArtifactId,
  sourceHistoryFingerprint: proposal.sourceHistoryFingerprint,
  rationale: proposal.rationale,
  summary: proposal.summary,
  assumptions: proposal.assumptions,
  cautions: proposal.cautions,
  ...(Object.hasOwn(proposal, "milestones") ? { milestones: proposal.milestones } : {}),
});

/** Hashes the versioned proposal content while keeping legacy v1 bytes compatible. */
export function calculatePlanProposalContentHash(proposal: ProposalValue): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(proposalContent(proposal))))
    .digest("hex");
}
