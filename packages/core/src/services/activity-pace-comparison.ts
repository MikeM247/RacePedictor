import { createHash } from "node:crypto";
import type { ActivityDetail } from "../contracts/activity.ts";
import { paceArtifactSchema, paceComparisonReadSchema, paceSourceSchema, type PaceArtifact, type PaceComparison, type PaceSource } from "../contracts/activity-pace-comparison.ts";
import { trainingPlanSchema } from "../contracts/coaching.ts";

export class PaceComparisonError extends Error {
  readonly code: "INVALID" | "CONFLICT" | "NOT_FOUND";
  constructor(code: "INVALID" | "CONFLICT" | "NOT_FOUND", message: string) { super(message); this.code = code; this.name = "PaceComparisonError"; }
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
export const paceHash = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
export function splitFingerprint(activity: ActivityDetail) {
  // Local projections can remap IDs; provider split values remain identical.
  return paceHash({ occurredAt: activity.occurredAt, sport: activity.sport, splits: [...activity.splits].sort((a, b) => a.splitIndex - b.splitIndex).map(({ splitIndex, distanceM, paceSecPerKm }) => ({ splitIndex, distanceM, paceSecPerKm })) });
}
export function validatePaceArtifact(input: unknown, activity: ActivityDetail, source: PaceSource) {
  const result = paceArtifactSchema.safeParse(input);
  if (!result.success) throw new PaceComparisonError("INVALID", "Pace comparison artifact is invalid");
  const artifact = result.data;
  const { artifactHash, ...content } = artifact;
  if (artifactHash !== paceHash(content)) throw new PaceComparisonError("INVALID", "Artifact hash does not match the reviewed content");
  if (artifact.athleteId !== activity.athleteId || artifact.activityId !== activity.id || artifact.splitFingerprint !== splitFingerprint(activity)) throw new PaceComparisonError("CONFLICT", "Activity split data changed; review again");
  if (paceHash(artifact.source) !== paceHash(source)) throw new PaceComparisonError("CONFLICT", "Reviewed prescription does not match its approved source");
  const indices = new Set(activity.splits.map(s => s.splitIndex));
  for (const block of artifact.blocks) {
    if (block.lastSplitIndex - block.firstSplitIndex >= indices.size) throw new PaceComparisonError("INVALID", "Block exceeds the recorded splits");
    for (let i = block.firstSplitIndex; i <= block.lastSplitIndex; i++) if (!indices.has(i)) throw new PaceComparisonError("INVALID", "Block references an unavailable split");
  }
  return artifact;
}
export function comparisonRead(activity: ActivityDetail, comparison: PaceComparison | null) {
  return paceComparisonReadSchema.parse({ data: { activityId: activity.id, status: comparison ? comparison.splitFingerprint === splitFingerprint(activity) ? "ready" : "stale" : "none", comparison } });
}
export function publishedComparison(artifact: PaceArtifact, publishedAt: string): PaceComparison {
  const { expectedActivityRevision: _activityRevision, expectedComparisonRevision, ...rest } = artifact;
  return { ...rest, revision: expectedComparisonRevision + 1, publishedAt };
}
export function prescriptionSource(planValue: unknown, sessionId: string, sessionRevision: number | null = null, amendments: Array<{ revision: number; afterValues: unknown }> = []): PaceSource {
  const plan = trainingPlanSchema.parse(planValue);
  if (plan.status === "draft") throw new PaceComparisonError("INVALID", "Comparison requires an approved plan");
  const session = plan.workouts.find(s => s.id === sessionId);
  if (!session) throw new PaceComparisonError("NOT_FOUND", "Approved session was not found");
  let { title, prescription } = session;
  if (sessionRevision !== null) {
    if (sessionRevision > 1) {
      const history = [...amendments].filter(a => a.revision <= sessionRevision).sort((a, b) => a.revision - b.revision);
      if (history.length !== sessionRevision - 1 || history.some((a, i) => a.revision !== i + 2)) throw new PaceComparisonError("CONFLICT", "Requested amendment history is incomplete");
      for (const item of history) {
        const value = item.afterValues as { title?: string; prescription?: string };
        title = value.title ?? title; prescription = value.prescription ?? prescription;
      }
    }
  }
  return paceSourceSchema.parse({ planId: plan.id, planVersion: plan.version, approvalContentHash: plan.approval.contentHash, sessionId, sessionRevision, sessionTitle: title, prescription });
}
