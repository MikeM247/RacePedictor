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

export const importProgressStatusSchema = z.enum([
  "uploaded",
  "normalizing",
  "completed",
  "failed",
]);

export const importProgressSchema = z.object({
  importId: z.string().min(1),
  status: importProgressStatusSchema,
  stagedCount: z.number().int().nonnegative(),
  normalizedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const driverContributionListSchema = z.array(driverContributionSchema);
export const featureTrendPointListSchema = z.array(featureTrendPointSchema);

export const dashboardOverviewDataSchema = z.object({
  predictionSummary: predictionSummarySchema,
  driverContributions: driverContributionListSchema,
  featureTrendPoints: featureTrendPointListSchema,
  importProgress: importProgressSchema,
});

export const dashboardStaleMetadataSchema = z.object({
  isStale: z.boolean(),
  staleReason: z.string().optional(),
  staleAtIso: z.string().datetime().optional(),
});

export const dashboardFetchResultSchema = z.discriminatedUnion("fetchStatus", [
  z.object({
    fetchStatus: z.literal("success"),
    stale: dashboardStaleMetadataSchema,
    data: dashboardOverviewDataSchema,
  }),
  z.object({
    fetchStatus: z.literal("empty"),
    stale: dashboardStaleMetadataSchema,
  }),
  z.object({
    fetchStatus: z.literal("error"),
    stale: dashboardStaleMetadataSchema,
    errorMessage: z.string().min(1),
  }),
]);

export type PredictionSummary = {
  athleteId: string;
  predictedTimeS: number;
  predictedPaceSecPerKm: number;
  bandLowS: number;
  bandHighS: number;
  modelVersion: string;
  generatedAt: string;
};

export type DriverContribution = {
  key: string;
  label: string;
  contributionPct: number;
  direction: "positive" | "negative" | "neutral";
  confidence: number;
};

export type FeatureTrendPoint = {
  weekStart: string;
  featureKey: string;
  featureLabel: string;
  value: number;
  unit: string;
};

export type ImportProgressStatus = "uploaded" | "normalizing" | "completed" | "failed";

export type ImportProgress = {
  importId: string;
  status: ImportProgressStatus;
  stagedCount: number;
  normalizedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  updatedAt: string;
};

export type DashboardOverviewData = {
  predictionSummary: PredictionSummary;
  driverContributions: DriverContribution[];
  featureTrendPoints: FeatureTrendPoint[];
  importProgress: ImportProgress;
};

export type DashboardStaleMetadata = {
  isStale: boolean;
  staleReason?: string;
  staleAtIso?: string;
};

export type DashboardFetchResult =
  | {
      fetchStatus: "success";
      data: DashboardOverviewData;
      stale: DashboardStaleMetadata;
    }
  | {
      fetchStatus: "empty";
      stale: DashboardStaleMetadata;
    }
  | {
      fetchStatus: "error";
      errorMessage: string;
      stale: DashboardStaleMetadata;
    };
