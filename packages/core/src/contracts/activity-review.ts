import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const revisionSchema = z.number().int().positive();
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const activityReviewRequestStatusSchema = z.enum([
  "not_requested",
  "queued",
  "processing",
  "ready",
  "retry_wait",
  "attention",
]);

export const activityReviewMatchStateSchema = z.enum([
  "suggested",
  "confirmed",
  "unplanned",
  "ambiguous",
  "none",
]);

export const activityReviewComparisonSchema = z.object({
  matchState: activityReviewMatchStateSchema,
  planId: idSchema.nullable(),
  sessionId: idSchema.nullable(),
  planVersion: z.number().int().positive().nullable(),
  sessionTitle: z.string().trim().min(1).max(200).nullable(),
  plannedDurationMinutes: z.number().nonnegative().nullable(),
  actualDurationMinutes: z.number().nonnegative(),
  plannedDistanceMeters: z.number().nonnegative().nullable(),
  actualDistanceMeters: z.number().nonnegative(),
  plannedIntensityRpe: z.number().int().min(1).max(10).nullable(),
  actualPerceivedEffort: z.number().int().min(1).max(10).nullable(),
  interpretation: z.string().trim().min(1).max(1000),
}).strict();

export const activityReviewEvidenceSchema = z.object({
  source: z.enum(["activity", "plan", "recent_history", "second_brain"]),
  label: z.string().trim().min(1).max(160),
  reference: idSchema.optional(),
}).strict();

export const activityCoachReviewSchema = z.object({
  id: idSchema,
  athleteId: idSchema,
  activityId: idSchema,
  revision: revisionSchema,
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  headline: z.string().trim().min(1).max(160),
  assessment: z.string().trim().min(1).max(4000),
  nextStep: z.string().trim().min(1).max(1000),
  comparison: activityReviewComparisonSchema,
  evidence: z.array(activityReviewEvidenceSchema).max(16),
  limitations: z.array(z.string().trim().min(1).max(500)).max(8),
  generatedAt: isoDateTimeSchema,
  publishedAt: isoDateTimeSchema,
  model: z.string().trim().min(1).max(120),
  promptVersion: z.string().trim().min(1).max(40),
}).strict();

export const activityCoachReviewSummarySchema = z.object({
  id: idSchema,
  athleteId: idSchema,
  activityId: idSchema,
  revision: revisionSchema,
  headline: z.string().trim().min(1).max(160),
  nextStep: z.string().trim().min(1).max(1000),
  comparison: activityReviewComparisonSchema,
  generatedAt: isoDateTimeSchema,
  publishedAt: isoDateTimeSchema,
  model: z.string().trim().min(1).max(120),
}).strict();

export const activityCoachReviewResponseDataSchema = z.object({
    activityId: idSchema,
    status: activityReviewRequestStatusSchema,
    review: activityCoachReviewSchema.nullable(),
    requestId: idSchema.nullable(),
    updatedAt: isoDateTimeSchema.nullable(),
    readRevision: revisionSchema.nullable(),
}).strict();

export const activityCoachReviewResponseSchema = z.object({
  data: activityCoachReviewResponseDataSchema,
}).strict();

export const activityCoachReviewSummaryListResponseDataSchema = z.object({
    items: z.array(activityCoachReviewSummarySchema).max(40),
}).strict();

export const activityCoachReviewSummaryListResponseSchema = z.object({
  data: activityCoachReviewSummaryListResponseDataSchema,
}).strict();

export const activityReviewRequestResponseDataSchema = z.object({
    activityId: idSchema,
    requestId: idSchema,
    status: activityReviewRequestStatusSchema,
    reused: z.boolean(),
    updatedAt: isoDateTimeSchema,
}).strict();

export const activityReviewRequestResponseSchema = z.object({
  data: activityReviewRequestResponseDataSchema,
}).strict();

export const activityCoachReviewArtifactSchema = activityCoachReviewSchema.extend({
  requestId: idSchema,
  leaseToken: idSchema,
  expectedActivityRevision: revisionSchema,
}).strict();

export const activityReviewClaimResponseSchema = z.object({
  data: z.object({
    items: z.array(z.object({
      requestId: idSchema,
      activityId: idSchema,
      leaseToken: idSchema,
      status: z.literal("processing"),
    }).strict()).max(20),
  }).strict(),
}).strict();

export type ActivityReviewRequestStatus = z.infer<typeof activityReviewRequestStatusSchema>;
export type ActivityReviewComparison = z.infer<typeof activityReviewComparisonSchema>;
export type ActivityCoachReview = z.infer<typeof activityCoachReviewSchema>;
export type ActivityCoachReviewSummary = z.infer<typeof activityCoachReviewSummarySchema>;
export type ActivityCoachReviewResponse = z.infer<typeof activityCoachReviewResponseSchema>;
export type ActivityReviewRequestResponse = z.infer<typeof activityReviewRequestResponseSchema>;
export type ActivityCoachReviewArtifact = z.infer<typeof activityCoachReviewArtifactSchema>;
