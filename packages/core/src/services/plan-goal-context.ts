import { createHash } from "node:crypto";
import type { TrainingPlanGoalContextPublishRequest } from "../contracts/coaching.ts";

type GoalContextHashInput = Omit<TrainingPlanGoalContextPublishRequest, "contextHash">;

export function calculatePlanGoalContextHash(input: GoalContextHashInput): string {
  const canonical = {
    athleteId: input.athleteId,
    planId: input.planId,
    planVersion: input.planVersion,
    goalId: input.goalId,
    goalRevision: input.goalRevision,
    approvalContentHash: input.approvalContentHash,
    goal: input.goal,
    milestones: input.milestones,
  };
  return createHash("sha256").update(stableJson(canonical), "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
