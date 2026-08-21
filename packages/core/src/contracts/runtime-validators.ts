import type { z } from "zod";
import {
  activitiesListResponseSchema,
  activityDetailResponseSchema,
  activitySplitsResponseSchema,
} from "./activity.ts";
import { dashboardOverviewResponseSchema } from "./dashboard.ts";
import { importNormalizeResponseSchema, importUploadResponseSchema } from "./imports.ts";
import { weeklyFeaturesByAthleteResponseSchema, weeklyFeaturesResponseSchema } from "./weekly.ts";

export type ValidationIssue = {
  path: string;
  message: string;
};

export type RuntimeValidationResult = {
  success: boolean;
  issues: ValidationIssue[];
};

const validate = (schema: z.ZodTypeAny, payload: unknown): RuntimeValidationResult => {
  const result = schema.safeParse(payload);
  if (result.success) return { success: true, issues: [] };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join(".") : "<root>",
      message: issue.message,
    })),
  };
};

export const validateActivitiesListResponse = (payload: unknown) =>
  validate(activitiesListResponseSchema, payload);

export const validateActivityDetailResponse = (payload: unknown) =>
  validate(activityDetailResponseSchema, payload);

export const validateActivitySplitsResponse = (payload: unknown) =>
  validate(activitySplitsResponseSchema, payload);

export const validateWeeklyFeaturesResponse = (payload: unknown) =>
  validate(weeklyFeaturesResponseSchema, payload);

export const validateWeeklyFeaturesByAthleteResponse = (payload: unknown) =>
  validate(weeklyFeaturesByAthleteResponseSchema, payload);

export const validateImportUploadResponse = (payload: unknown) =>
  validate(importUploadResponseSchema, payload);

export const validateImportNormalizeResponse = (payload: unknown) =>
  validate(importNormalizeResponseSchema, payload);

export const validateDashboardOverviewResponse = (payload: unknown) =>
  validate(dashboardOverviewResponseSchema, payload);
