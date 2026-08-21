import { createHash } from "node:crypto";
import {
  coachingReviewContextSchema,
  type CoachingReviewAmendment,
  type CoachingReviewContext,
  type PlannedWorkout,
} from "../contracts/coaching.ts";

export type CoachingReviewContextInput = {
  athleteId: string;
  generatedAt: string;
  currentLocalDate: string;
  activePlan: {
    id: string;
    version: number;
    revision: number;
    contentHash: string;
  };
  sessions: Array<{
    id: string;
    prescribed: PlannedWorkout;
    effective: PlannedWorkout;
    status: "upcoming" | "skipped";
    revision: number;
    amendments: CoachingReviewAmendment[];
  }>;
};

export function buildCoachingReviewContext(input: CoachingReviewContextInput): CoachingReviewContext {
  const futureSessions = input.sessions
    .filter((session) => session.effective.scheduledDate > input.currentLocalDate)
    .map((session) => ({
      ...session,
      amendments: [...session.amendments].sort(compareAmendments),
    }))
    .sort((left, right) => left.effective.scheduledDate.localeCompare(right.effective.scheduledDate)
      || left.id.localeCompare(right.id));
  const hashable = {
    schema: "coaching-review-context.v1" as const,
    athleteId: input.athleteId,
    currentLocalDate: input.currentLocalDate,
    activePlan: input.activePlan,
    futureSessions,
  };
  const contentHash = sha256(hashable);
  return coachingReviewContextSchema.parse({
    ...hashable,
    id: `coaching_review_${contentHash.slice(0, 24)}`,
    generatedAt: input.generatedAt,
    contentHash,
  });
}

function compareAmendments(left: CoachingReviewAmendment, right: CoachingReviewAmendment) {
  return left.resultingRevision - right.resultingRevision
    || left.changedAt.localeCompare(right.changedAt)
    || left.id.localeCompare(right.id);
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
