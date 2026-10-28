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

export const postRunAnswersSchema = z.object({
  rpeAnswer: z.enum(["rated", "unable"]),
  discomfort: z.enum(["none", "discomfort", "pain", "prefer_not_to_say"]),
  symptoms: z.object({
    bodyArea: z.string().trim().max(100).optional(),
    severity: z.number().int().min(0).max(10).optional(),
    affectedRunning: z.enum(["yes", "no", "unsure"]).optional(),
  }).strict().optional(),
  energy: z.enum(["fresh", "okay", "drained", "skip"]).optional(),
  note: z.string().trim().max(1000).optional(),
  fuel: z.enum(["no_issues", "not_enough", "stomach_issues", "unsure"]).optional(),
  fuelNote: z.string().trim().max(1000).optional(),
  raceNotes: z.object({
    workedWell: z.string().trim().max(1000).optional(),
    changeNextTime: z.string().trim().max(1000).optional(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.discomfort === "none" && value.symptoms) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["symptoms"], message: "Symptom details require discomfort or pain" });
  }
  if (value.discomfort === "prefer_not_to_say" && value.symptoms) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["symptoms"], message: "Symptom details cannot be supplied when opting out" });
  }
  if (value.fuel === "no_issues" && value.fuelNote) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fuelNote"], message: "Fueling notes are only relevant when reporting an issue or uncertainty" });
  }
});

export const postRunActivityReflectionAnswersSchema = activityReflectionAnswersSchema.extend({
  postRun: postRunAnswersSchema,
}).strict().superRefine((value, ctx) => {
  if (value.postRun.rpeAnswer === "rated" && value.overallRpe === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["overallRpe"], message: "A rated effort requires an RPE" });
  }
  if (value.postRun.rpeAnswer === "unable" && value.overallRpe !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["overallRpe"], message: "An unable-to-rate answer cannot include an RPE" });
  }
});

export const activityReflectionSchema = z.object({
  id: idSchema,
  athleteId: idSchema,
  activityId: idSchema,
  revision: z.number().int().nonnegative(),
  activityRevision: z.number().int().positive(),
  type: activityReflectionTypeSchema.nullable(),
  answers: z.union([activityReflectionAnswersSchema, postRunActivityReflectionAnswersSchema]),
  sections: z.array(activityReflectionSectionSchema).max(20),
  questionnaireVersion: z.enum(["activity-reflection.v1", "activity-reflection.v2"]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict().superRefine((value, ctx) => {
  const hasPostRunAnswers = "postRun" in value.answers;
  if (value.questionnaireVersion === "activity-reflection.v2" && !hasPostRunAnswers) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["answers", "postRun"], message: "Version 2 reflections require post-run answers" });
  }
  if (value.questionnaireVersion === "activity-reflection.v1" && hasPostRunAnswers) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["questionnaireVersion"], message: "Version 1 reflections cannot contain post-run answers" });
  }
});

export const saveActivityReflectionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  type: activityReflectionTypeSchema.nullable(),
  answers: activityReflectionAnswersSchema,
  sections: z.array(activityReflectionSectionSchema).max(20),
}).strict();

export const savePostRunReflectionRequestSchema = z.object({
  requestId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  expectedActivityRevision: z.number().int().nonnegative(),
  type: activityReflectionTypeSchema.nullable(),
  answers: postRunActivityReflectionAnswersSchema,
  sections: z.array(activityReflectionSectionSchema).max(20),
}).strict().superRefine((value, ctx) => {
  if (value.type !== "race" && value.answers.postRun.raceNotes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["answers", "postRun", "raceNotes"], message: "Race notes require the race activity type" });
  }
});
export type SavePostRunReflectionRequest = z.infer<typeof savePostRunReflectionRequestSchema>;

export const postRunReflectionStateChangeSchema = z.object({
  requestId: z.string().uuid(),
  expectedStateRevision: z.number().int().nonnegative(),
}).strict();
export type PostRunReflectionStateChange = z.infer<typeof postRunReflectionStateChangeSchema>;

export const activityReflectionResponseSchema = z.object({ data: activityReflectionSchema.nullable() }).strict();

export const runReviewStateSchema = z.object({
  activityId: idSchema,
  completedAt: isoDateTimeSchema.nullable(),
  completedReflectionRevision: z.number().int().nullable(),
  suppressedAt: isoDateTimeSchema.nullable(),
  reopenedAt: isoDateTimeSchema.nullable(),
  revision: z.number().int().nonnegative(),
}).strict();

export const runReviewStateResponseSchema = z.object({
  data: z.object({ state: runReviewStateSchema.nullable(), reflection: activityReflectionSchema.nullable(), activityRevision: z.number().int().nonnegative().optional() }).strict(),
}).strict();

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
