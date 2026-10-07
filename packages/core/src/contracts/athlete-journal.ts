import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const noteSchema = z.string().trim().max(2000);
const ratingSchema = z.number().int().min(1).max(10);
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const activityReflectionTypeSchema = z.enum(["training", "race"]);
export type ActivityReflectionType = z.infer<typeof activityReflectionTypeSchema>;

export const activityReflectionSectionSchema = z.object({
  id: idSchema,
  kind: z.enum(["opening", "middle", "closing", "repetition", "turning_point"]),
  location: z.string().trim().max(160).optional(),
  rpe: ratingSchema.optional(),
  notes: noteSchema.optional(),
}).strict();

export const activityReflectionAnswersSchema = z.object({
  overallRpe: ratingSchema.optional(),
  overallFeeling: z.enum(["very_poor", "poor", "normal", "good", "very_good"]).optional(),
  expectation: z.enum(["easier", "as_expected", "harder", "unsure"]).optional(),
  limiters: z.array(z.enum(["none", "unsure", "breathing", "legs", "energy", "stomach", "heat", "motivation", "other"])).max(9).optional(),
  pain: z.object({
    present: z.enum(["yes", "no", "unsure"]),
    location: z.string().trim().max(160).optional(),
    onset: z.string().trim().max(160).optional(),
    severity: z.number().int().min(0).max(10).optional(),
    changedStride: z.boolean().optional(),
  }).strict().optional(),
  context: z.array(z.enum(["sleep", "stress", "residual_fatigue", "food", "hydration", "illness", "weather", "terrain", "interruptions"])).max(9).optional(),
  contextNotes: noteSchema.optional(),
  finishReserve: z.enum(["plenty", "some", "very_little", "nothing", "unsure"]).optional(),
  coachNote: noteSchema.optional(),
  training: z.object({
    objective: noteSchema.optional(),
    completion: z.enum(["yes", "partly", "no", "unsure"]).optional(),
    completionNotes: noteSchema.optional(),
    changes: noteSchema.optional(),
    controlFormRecovery: noteSchema.optional(),
    workedWell: noteSchema.optional(),
    changeNextTime: noteSchema.optional(),
  }).strict().optional(),
  race: z.object({
    targetTime: z.string().trim().max(32).optional(),
    pacingPlan: noteSchema.optional(),
    preparation: noteSchema.optional(),
    pacingExecution: noteSchema.optional(),
    fuelling: noteSchema.optional(),
    confidence: noteSchema.optional(),
    workedWell: noteSchema.optional(),
    changeNextTime: noteSchema.optional(),
  }).strict().optional(),
}).strict();

export const activityReflectionSchema = z.object({
  id: idSchema,
  athleteId: idSchema,
  activityId: idSchema,
  revision: z.number().int().nonnegative(),
  activityRevision: z.number().int().positive(),
  type: activityReflectionTypeSchema.nullable(),
  answers: activityReflectionAnswersSchema,
  sections: z.array(activityReflectionSectionSchema).max(20),
  questionnaireVersion: z.literal("activity-reflection.v1"),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();

export const saveActivityReflectionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  type: activityReflectionTypeSchema.nullable(),
  answers: activityReflectionAnswersSchema,
  sections: z.array(activityReflectionSectionSchema).max(20),
}).strict();

export const activityReflectionResponseSchema = z.object({ data: activityReflectionSchema.nullable() }).strict();

export const wellbeingValueSchema = z.enum(["very_poor", "poor", "normal", "good", "very_good"]);
export const wellbeingLevelSchema = z.enum(["none", "mild", "moderate", "high", "very_high"]);
export const readinessSchema = z.enum(["not_ready", "below_normal", "normal", "ready", "very_ready"]);
export const wellbeingAnswersSchema = z.object({
  overallFeeling: wellbeingValueSchema.optional(),
  sleepQuality: wellbeingValueSchema.optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  fatigue: wellbeingLevelSchema.optional(),
  soreness: wellbeingLevelSchema.optional(),
  pain: activityReflectionAnswersSchema.shape.pain,
  readiness: readinessSchema.optional(),
  notes: noteSchema.optional(),
}).strict();

export const dailyWellbeingCheckInSchema = z.object({
  id: idSchema,
  athleteId: idSchema,
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  timezone: z.string().trim().min(1).max(100),
  answers: wellbeingAnswersSchema,
  status: z.enum(["saved", "skipped"]),
  recordedAt: isoDateTimeSchema.nullable(),
  skippedAt: isoDateTimeSchema.nullable(),
  revision: z.number().int().nonnegative(),
  questionnaireVersion: z.literal("daily-wellbeing.v1"),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();

export const saveDailyWellbeingRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  timezone: z.string().trim().min(1).max(100),
  status: z.enum(["saved", "skipped"]),
  answers: wellbeingAnswersSchema,
}).strict().superRefine((value, ctx) => {
  if (value.status === "saved" && Object.keys(value.answers).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["answers"], message: "At least one check-in answer is required" });
  }
});

export const wellbeingRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
}).strict().superRefine((value, ctx) => {
  if (value.from > value.to) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Date range is invalid" });
  const from = Date.parse(`${value.from}T00:00:00Z`);
  const to = Date.parse(`${value.to}T00:00:00Z`);
  if ((to - from) / 86400000 > 30) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Date range cannot exceed 31 days" });
});

export const dailyWellbeingListResponseSchema = z.object({ data: z.object({ items: z.array(dailyWellbeingCheckInSchema).max(31) }).strict() }).strict();

export type ActivityReflection = z.infer<typeof activityReflectionSchema>;
export type SaveActivityReflectionRequest = z.infer<typeof saveActivityReflectionRequestSchema>;
export type DailyWellbeingCheckIn = z.infer<typeof dailyWellbeingCheckInSchema>;
export type SaveDailyWellbeingRequest = z.infer<typeof saveDailyWellbeingRequestSchema>;
