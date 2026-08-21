import { z } from "zod";
import { weekdaySchema } from "./coaching.ts";

export const SECOND_BRAIN_CONTEXT_SCHEMA_VERSION = "second-brain-context.v1" as const;
export const SECOND_BRAIN_CONTEXT_MAX_BYTES = 64 * 1024;

const idSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/, "Expected a stable identifier");
const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 hash");

const isRealDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const dateSchema = z.string().refine(isRealDate, "Expected a valid YYYY-MM-DD date");
const dateRangeSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
}).strict().refine((range) => range.endDate >= range.startDate, {
  path: ["endDate"],
  message: "End date must not precede start date",
});

const nonEmptyStrictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape)
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Selected sections must contain at least one field");

export const secondBrainAvailabilitySchema = nonEmptyStrictObject({
  weeklyMinutesBudget: z.number().int().min(0).max(10_080).optional(),
  availableWeekdays: z.array(weekdaySchema)
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Weekdays must be unique")
    .optional(),
  preferredLongRunDay: weekdaySchema.optional(),
  unavailableDateRanges: z.array(dateRangeSchema).max(16).optional(),
});

export const secondBrainTrainingPreferencesSchema = nonEmptyStrictObject({
  maxSessionsPerWeek: z.number().int().min(1).max(14).optional(),
  maxSessionMinutes: z.number().int().min(10).max(360).optional(),
  preferredSurfaces: z.array(z.enum(["road", "trail", "track", "treadmill"]))
    .max(4)
    .refine((surfaces) => new Set(surfaces).size === surfaces.length, "Surfaces must be unique")
    .optional(),
  avoidBackToBackHardDays: z.boolean().optional(),
});

export const secondBrainConstraintSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  category: z.enum(["schedule", "travel", "equipment", "health"]),
  impact: z.enum(["no_training", "reduced_training", "modified_training"]),
}).strict().refine((constraint) => constraint.endDate >= constraint.startDate, {
  path: ["endDate"],
  message: "End date must not precede start date",
});

export const secondBrainWellbeingCheckInSchema = z.object({
  recordedOn: dateSchema,
  energy: z.number().int().min(1).max(5),
  fatigue: z.number().int().min(1).max(5),
  soreness: z.number().int().min(0).max(10),
  sleepQuality: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
}).strict();

export const secondBrainActivityReflectionSchema = z.object({
  activityId: idSchema,
  perceivedEffort: z.number().int().min(1).max(10),
  enjoyment: z.number().int().min(1).max(5),
  pain: z.number().int().min(0).max(10),
  outcome: z.enum([
    "easier_than_expected",
    "as_expected",
    "harder_than_expected",
    "not_completed",
  ]),
}).strict();

export const secondBrainSelectedFieldSchema = z.enum([
  "availability",
  "trainingPreferences",
  "constraints",
  "wellbeingCheckIns",
  "activityReflections",
]);

export const secondBrainContextSchema = z.object({
  availability: secondBrainAvailabilitySchema.optional(),
  trainingPreferences: secondBrainTrainingPreferencesSchema.optional(),
  constraints: z.array(secondBrainConstraintSchema).min(1).max(20).optional(),
  wellbeingCheckIns: z.array(secondBrainWellbeingCheckInSchema).min(1).max(14).optional(),
  activityReflections: z.array(secondBrainActivityReflectionSchema).min(1).max(50).optional(),
}).strict();

const snapshotShape = z.object({
  schemaVersion: z.literal(SECOND_BRAIN_CONTEXT_SCHEMA_VERSION),
  athleteId: idSchema,
  revision: revisionSchema,
  publishedAt: z.string().datetime({ offset: true }),
  contentHash: sha256Schema,
  selectedFields: z.array(secondBrainSelectedFieldSchema)
    .min(1)
    .max(5)
    .refine((fields) => new Set(fields).size === fields.length, "Selected fields must be unique"),
  context: secondBrainContextSchema,
}).strict();

export const secondBrainContextSnapshotSchema = snapshotShape.superRefine((snapshot, ctx) => {
  const selected = new Set(snapshot.selectedFields);
  const present = Object.keys(snapshot.context);
  if (selected.size !== present.length || present.some((field) => !selected.has(field as z.infer<typeof secondBrainSelectedFieldSchema>))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["selectedFields"],
      message: "Selected fields must exactly match the sections present in context",
    });
  }

  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  if (bytes > SECOND_BRAIN_CONTEXT_MAX_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_big,
      type: "array",
      maximum: SECOND_BRAIN_CONTEXT_MAX_BYTES,
      inclusive: true,
      exact: false,
      path: [],
      message: "Second Brain context payload must not exceed 64 KiB",
    });
  }
});

export const secondBrainContextPublishApiResponseSchema = z.object({
  data: z.object({
    snapshot: secondBrainContextSnapshotSchema,
    reused: z.boolean(),
  }).strict(),
}).strict();

export const secondBrainContextLatestApiResponseSchema = z.object({
  data: z.object({
    snapshot: secondBrainContextSnapshotSchema.nullable(),
  }).strict(),
}).strict();

export type SecondBrainSelectedField = z.infer<typeof secondBrainSelectedFieldSchema>;
export type SecondBrainContext = z.infer<typeof secondBrainContextSchema>;
export type SecondBrainContextSnapshot = z.infer<typeof secondBrainContextSnapshotSchema>;

const selectedFieldOrder: readonly SecondBrainSelectedField[] = [
  "availability",
  "trainingPreferences",
  "constraints",
  "wellbeingCheckIns",
  "activityReflections",
];

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};

export const canonicalSecondBrainHashInput = (
  snapshot: Pick<SecondBrainContextSnapshot, "schemaVersion" | "athleteId" | "selectedFields" | "context">,
): string => JSON.stringify(canonicalize({
  schemaVersion: snapshot.schemaVersion,
  athleteId: snapshot.athleteId,
  selectedFields: [...snapshot.selectedFields].sort(
    (left, right) => selectedFieldOrder.indexOf(left) - selectedFieldOrder.indexOf(right),
  ),
  context: snapshot.context,
}));
