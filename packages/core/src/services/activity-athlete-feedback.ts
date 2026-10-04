import { createHash } from "node:crypto";
import {
  activityAthleteFeedbackArtifactSchema,
  type ActivityAthleteFeedbackArtifact,
} from "../contracts/activity-review.ts";

export function hashAthleteFeedbackArtifact(input: Omit<ActivityAthleteFeedbackArtifact, "artifactHash">) {
  return createHash("sha256").update(JSON.stringify({
    artifactId: input.artifactId,
    athleteId: input.athleteId,
    activityId: input.activityId,
    activityRevision: input.activityRevision,
    headline: input.headline,
    summary: input.summary,
    model: input.model,
    approvedAt: input.approvedAt,
  })).digest("hex");
}

export function validateAthleteFeedbackArtifact(value: unknown) {
  const parsed = activityAthleteFeedbackArtifactSchema.parse(value);
  const expectedHash = hashAthleteFeedbackArtifact(parsed);
  if (parsed.artifactHash !== expectedHash) throw new Error("Athlete feedback artifact hash is invalid");
  return parsed;
}
