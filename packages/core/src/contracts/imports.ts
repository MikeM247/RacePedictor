import { z } from "zod";

export const sourceTypeSchema = z.enum([
  "gpx",
  "tcx",
  "csv",
  "fit",
  "strava",
  "garmin",
  "polar",
  "coros",
  "suunto",
  "other",
]);

export const importUploadFormFieldsSchema = z.object({
  sourceType: sourceTypeSchema,
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export const importUploadResponseSchema = z.object({
  importId: z.string().min(1),
  status: z.enum(["uploaded", "parsed", "failed"]),
  stagedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  parseWarnings: z.array(z.string()),
});

export type SourceType = z.infer<typeof sourceTypeSchema>;
export type ImportUploadFormFields = z.infer<typeof importUploadFormFieldsSchema>;
export type ImportUploadResponse = z.infer<typeof importUploadResponseSchema>;
