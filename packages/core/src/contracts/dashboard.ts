import { z } from "zod";

export const predictionSummarySchema = z.object({
  athleteId: z.string().min(1),
  predictedTimeS: z.number().nonnegative(),
  predictedPaceSecPerKm: z.number().nonnegative(),
  bandLowS: z.number().nonnegative(),
  bandHighS: z.number().nonnegative(),
  modelVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
});

export const driverContributionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  contributionPct: z.number().min(-100).max(100),
  direction: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
});

export const featureTrendPointSchema = z.object({
  weekStart: z.string().date(),
  featureKey: z.string().min(1),
  featureLabel: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
});

export const importProgressSchema = z.object({
  importId: z.string().min(1),
  status: z.enum(["uploaded", "normalizing", "completed", "failed"]),
  stagedCount: z.number().int().nonnegative(),
  normalizedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export type PredictionSummary = z.infer<typeof predictionSummarySchema>;
export type DriverContribution = z.infer<typeof driverContributionSchema>;
export type FeatureTrendPoint = z.infer<typeof featureTrendPointSchema>;
export type ImportProgress = z.infer<typeof importProgressSchema>;

export const driverContributionListSchema = z.array(driverContributionSchema);
export const featureTrendPointListSchema = z.array(featureTrendPointSchema);
