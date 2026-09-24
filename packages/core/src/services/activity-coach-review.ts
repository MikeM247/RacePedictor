import { createHash } from "node:crypto";
import {
  activityCoachReviewSchema,
  type ActivityCoachReview,
  type ActivityReviewComparison,
} from "../contracts/activity-review.ts";
import type { ActivityDetail } from "../contracts/activity.ts";

export type ReviewSession = {
  id: string;
  planId: string;
  planVersion: number;
  title: string;
  scheduledDate: string;
  durationMinutes?: number;
  distanceMeters?: number;
  intensityRpe?: number;
  purpose?: string;
  prescription?: string;
};

export type ReviewFacts = {
  activity: Pick<ActivityDetail, "id" | "athleteId" | "sport" | "occurredAt" | "localOccurredAt" | "distanceM" | "elapsedTimeS" | "avgPaceSecPerKm" | "elevationGainM" | "avgHrBpm" | "splits">;
  session: ReviewSession | null;
  matchState: ActivityReviewComparison["matchState"];
  limitations: string[];
  fingerprint: string;
};

export function chooseSuggestedSession(activity: ReviewFacts["activity"], sessions: ReviewSession[]): { session: ReviewSession | null; state: ReviewFacts["matchState"] } {
  const localDate = (activity.localOccurredAt ?? activity.occurredAt).slice(0, 10);
  const candidates = sessions.filter((session) => session.scheduledDate === localDate && session.title.length > 0);
  if (candidates.length === 0) return { session: null, state: "none" };
  if (candidates.length > 1) return { session: null, state: "ambiguous" };
  return { session: candidates[0], state: "suggested" };
}

export function buildReviewFacts(input: {
  activity: ReviewFacts["activity"];
  sessions?: ReviewSession[];
  session?: ReviewSession | null;
  extraFingerprint?: unknown;
}): ReviewFacts {
  const selected = input.session === undefined
    ? chooseSuggestedSession(input.activity, input.sessions ?? [])
    : { session: input.session, state: input.session ? "suggested" as const : "none" as const };
  const limitations = [
    input.activity.avgHrBpm === null || input.activity.avgHrBpm === undefined
      ? "Heart-rate data is unavailable, so intensity cannot be inferred from heart rate."
      : null,
    selected.state === "ambiguous"
      ? "More than one planned session exists on this date, so the plan comparison is unresolved."
      : null,
    selected.state === "none"
      ? "No applicable planned session was identified for this workout."
      : null,
  ].filter((value): value is string => Boolean(value));
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      activity: input.activity,
      session: selected.session,
      state: selected.state,
      extra: input.extraFingerprint ?? null,
    }))
    .digest("hex");
  return { activity: input.activity, session: selected.session, matchState: selected.state, limitations, fingerprint };
}

export function buildReviewComparison(facts: ReviewFacts): ActivityReviewComparison {
  const session = facts.session;
  const plannedDurationMinutes = session?.durationMinutes ?? null;
  const actualDurationMinutes = facts.activity.elapsedTimeS / 60;
  const plannedDistanceMeters = session?.distanceMeters ?? null;
  const actualDistanceMeters = facts.activity.distanceM;
  const durationDelta = plannedDurationMinutes === null ? null : Math.round((actualDurationMinutes - plannedDurationMinutes) * 10) / 10;
  const distanceDelta = plannedDistanceMeters === null ? null : Math.round((actualDistanceMeters - plannedDistanceMeters) / 10) / 100;
  const interpretation = session
    ? [
      durationDelta === null ? null : `Elapsed time was ${Math.abs(durationDelta)} minutes ${durationDelta >= 0 ? "over" : "under"} the effective prescription.`,
      distanceDelta === null ? null : `Distance was ${Math.abs(distanceDelta)} km ${distanceDelta >= 0 ? "over" : "under"} the effective prescription.`,
      session.intensityRpe ? `The planned effort was RPE ${session.intensityRpe}; recorded perceived effort is not available.` : null,
    ].filter(Boolean).join(" ") || "The activity was compared with the effective planned session."
    : "This workout can be reviewed on its own; no planned-session comparison is available.";
  return {
    matchState: facts.matchState,
    planId: session?.planId ?? null,
    sessionId: session?.id ?? null,
    planVersion: session?.planVersion ?? null,
    sessionTitle: session?.title ?? null,
    plannedDurationMinutes,
    actualDurationMinutes: Math.round(actualDurationMinutes * 10) / 10,
    plannedDistanceMeters,
    actualDistanceMeters,
    plannedIntensityRpe: session?.intensityRpe ?? null,
    actualPerceivedEffort: null,
    interpretation,
  };
}

export function buildReviewPrompt(facts: ReviewFacts): string {
  const comparison = buildReviewComparison(facts);
  return [
    "You are a careful running coach reviewing one completed activity.",
    "Use only the supplied facts. Separate observations from interpretation and recommendation.",
    "Write a concise, personal review with a specific headline, two short assessment paragraphs, one next step, and limitations where evidence is missing.",
    "Do not diagnose, invent metrics, claim completion, change a plan, or quote private source text.",
    JSON.stringify({ facts: { ...facts, comparison } }),
  ].join("\n\n");
}

export function validateGeneratedReview(review: unknown): ActivityCoachReview {
  return activityCoachReviewSchema.parse(review);
}
