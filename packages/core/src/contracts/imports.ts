import { z } from "zod";
import { standardErrorResponseSchema, standardSuccessResponseSchema } from "./coaching.ts";

export const importStatusSchema = z.enum([
  "uploaded",
  "normalizing",
  "completed",
  "failed",
]);

export const importUploadRequestSchema = z.object({
  name: z.string().trim().min(1),
  type: z.string(),
  size: z.number().int().positive(),
}).strict();

export const importUploadResponseSchema = z.object({
  importId: z.string().min(1),
  status: importStatusSchema,
  sourceType: z.enum(["csv", "gpx"]).optional(),
  reused: z.boolean().optional(),
  stagedCount: z.number().int().nonnegative(),
  normalizedCount: z.number().int().nonnegative().optional(),
  duplicateCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  parseWarnings: z.array(z.string()),
  coverage: z.record(z.union([z.number().nonnegative(), z.boolean()])).optional(),
  totalNormalizedActivities: z.number().int().nonnegative().optional(),
  analyticsRefreshed: z.boolean().optional(),
}).strict();

export const importNormalizeResponseSchema = z.object({
  importId: z.string().min(1),
  normalizedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  nextCursor: z.string().min(1).optional(),
  hasMore: z.boolean(),
});

export const importUploadApiResponseSchema = standardSuccessResponseSchema(importUploadResponseSchema);
export const importUploadApiErrorResponseSchema = standardErrorResponseSchema;

export type ImportStatus = "uploaded" | "normalizing" | "completed" | "failed";

export type ImportUploadResponse = {
  importId: string;
  status: ImportStatus;
  sourceType?: "csv" | "gpx";
  reused?: boolean;
  stagedCount: number;
  normalizedCount?: number;
  duplicateCount: number;
  rejectedCount: number;
  parseWarnings: string[];
  coverage?: Record<string, number | boolean>;
  totalNormalizedActivities?: number;
  analyticsRefreshed?: boolean;
};

export type ImportNormalizeResponse = {
  importId: string;
  normalizedCount: number;
  skippedCount: number;
  errorCount: number;
  nextCursor?: string;
  hasMore: boolean;
};
