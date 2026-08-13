import { z } from "zod";
import { activitySummarySchema } from "./activity.ts";

const isRealDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const dateSchema = z.string().refine(isRealDate, "Expected a valid YYYY-MM-DD date");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
const idSchema = z.string().trim().min(1);
const revisionSchema = z.number().int().positive();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 hash");
const isIanaTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
};
export const ianaTimezoneSchema = z.string().trim().min(1).refine(isIanaTimezone, "Expected a valid IANA timezone");

export const weekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
export const workoutKindSchema = z.enum(["run", "strength", "cross_train", "rest"]);

export const coachingProfileSchema = z.object({
  id: idSchema,
  athleteId: idSchema,
  revision: revisionSchema,
  displayName: z.string().trim().min(1),
  timezone: ianaTimezoneSchema,
  units: z.enum(["metric", "imperial"]),
  why: z.string().trim().min(1).max(2000),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  constraints: z.array(z.string().trim().min(1)).max(30),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export const reminderPreferencesSchema = z.object({
  enabled: z.boolean(),
  timezone: ianaTimezoneSchema,
  localTime: timeSchema,
  days: z.array(weekdaySchema).min(1).refine((days) => new Set(days).size === days.length, "Days must be unique"),
  channel: z.enum(["in_app", "codex_task"]),
  motivationalContext: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export const reminderExternalStatusRequestSchema = z.object({
  externalStatus: z.enum(["scheduled", "attention"]),
  externalReference: z.string().trim().min(1).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.externalStatus === "scheduled" && !value.externalReference) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["externalReference"], message: "Scheduled automation requires an external reference" });
  }
});

const performanceTargetSchema = z.object({
  kind: z.literal("performance"),
  distanceMeters: z.number().positive().max(500_000),
  targetTimeSeconds: z.number().int().positive().max(7 * 24 * 60 * 60).optional(),
  targetDate: dateSchema,
  eventName: z.string().trim().min(1).optional(),
}).strict();

const consistencyTargetSchema = z.object({
  kind: z.literal("consistency"),
  sessionsPerWeek: z.number().int().min(1).max(7),
  minimumMinutesPerWeek: z.number().int().min(30).max(10_080),
  startsOn: dateSchema,
  endsOn: dateSchema,
}).strict().refine((target) => target.endsOn >= target.startsOn, {
  path: ["endsOn"],
  message: "End date must not precede start date",
});

export const goalTargetSchema = z.union([performanceTargetSchema, consistencyTargetSchema]);

const goalBase = z.object({
  id: idSchema,
  athleteId: idSchema,
  revision: revisionSchema,
  title: z.string().trim().min(1).max(200),
  why: z.string().trim().min(1).max(2000),
  target: goalTargetSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const goalDraftSchema = goalBase.extend({ status: z.literal("draft") }).strict();
export const settledGoalSchema = goalBase.extend({
  status: z.literal("settled"),
  settledAt: z.string().datetime({ offset: true }),
  settledBy: z.literal("user"),
}).strict();
export const goalSchema = z.discriminatedUnion("status", [goalDraftSchema, settledGoalSchema]);

export const routineDaySchema = z.object({
  day: weekdaySchema,
  available: z.boolean(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  maxDurationMinutes: z.number().int().min(10).max(1440).optional(),
  allowedKinds: z.array(workoutKindSchema.exclude(["rest"])).min(1).optional(),
}).strict().superRefine((day, ctx) => {
  const details = [day.startTime, day.endTime, day.maxDurationMinutes, day.allowedKinds];
  if (day.available && details.some((value) => value === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Available days require a time window, duration, and allowed kinds" });
  }
  if (!day.available && details.some((value) => value !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unavailable days cannot define availability details" });
  }
  if (day.startTime && day.endTime && day.startTime >= day.endTime) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "End time must be after start time" });
  }
});

export const weeklyRoutineSchema = z.object({
  id: idSchema,
  athleteId: idSchema,
  revision: revisionSchema,
  timezone: ianaTimezoneSchema,
  desiredSessionsPerWeek: z.number().int().min(1).max(7),
  preferredLongRunDay: weekdaySchema.optional(),
  days: z.array(routineDaySchema).length(7),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((routine, ctx) => {
  if (new Set(routine.days.map(({ day }) => day)).size !== 7) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Routine must contain each weekday exactly once" });
  }
  const available = routine.days.filter((day) => day.available);
  if (available.length < routine.desiredSessionsPerWeek) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["desiredSessionsPerWeek"], message: "Desired sessions exceed available days" });
  }
  if (routine.preferredLongRunDay && !available.some(({ day }) => day === routine.preferredLongRunDay)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["preferredLongRunDay"], message: "Long-run day must be available" });
  }
});

export const plannedWorkoutSchema = z.object({
  id: idSchema,
  kind: workoutKindSchema,
  scheduledDate: dateSchema,
  startTime: timeSchema.optional(),
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(1000),
  prescription: z.string().trim().min(1).max(4000),
  cautions: z.array(z.string().trim().min(1).max(500)).max(20),
  durationMinutes: z.number().int().min(0).max(1440),
  distanceMeters: z.number().positive().max(500_000).optional(),
  intensityRpe: z.number().int().min(1).max(10).optional(),
}).strict().superRefine((workout, ctx) => {
  if (workout.kind === "rest" && (workout.durationMinutes !== 0 || workout.startTime !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Rest sessions have zero duration and no start time" });
  }
  if (workout.kind !== "rest" && workout.durationMinutes === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["durationMinutes"], message: "Training sessions require a duration" });
  }
});

export const sessionAmendmentFieldSchema = z.enum([
  "title",
  "purpose",
  "prescription",
  "durationMinutes",
  "distanceMeters",
  "intensityRpe",
  "startTime",
  "cautions",
  "effectiveDate",
  "status",
]);

export const sessionAmendmentValueSchema = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
  z.null(),
]);

export const sessionAmendmentValuesSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  purpose: z.string().trim().min(1).max(1000).optional(),
  prescription: z.string().trim().min(1).max(4000).optional(),
  durationMinutes: z.number().int().min(0).max(1440).optional(),
  distanceMeters: z.number().positive().max(500_000).nullable().optional(),
  intensityRpe: z.number().int().min(1).max(10).nullable().optional(),
  startTime: timeSchema.nullable().optional(),
  cautions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  effectiveDate: dateSchema.optional(),
  status: z.enum(["upcoming", "skipped"]).optional(),
}).strict();

export const sessionAmendmentPatchSchema = sessionAmendmentValuesSchema.omit({
  effectiveDate: true,
  status: true,
}).refine((changes) => Object.keys(changes).length > 0, {
  message: "At least one session field must be changed",
});

export const sessionAmendmentSchema = z.object({
  id: idSchema,
  planId: idSchema,
  sessionId: idSchema,
  operation: z.enum(["amend", "reschedule", "skip", "restore"]),
  actor: idSchema,
  changedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(500),
  changedFields: z.array(sessionAmendmentFieldSchema).min(1),
  before: sessionAmendmentValuesSchema,
  after: sessionAmendmentValuesSchema,
  expectedRevision: revisionSchema,
  resultingRevision: revisionSchema,
}).strict().superRefine((amendment, ctx) => {
  if (amendment.resultingRevision !== amendment.expectedRevision + 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["resultingRevision"], message: "Resulting revision must follow the expected revision" });
  }
  if (new Set(amendment.changedFields).size !== amendment.changedFields.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["changedFields"], message: "Changed fields must be unique" });
  }
  for (const field of amendment.changedFields) {
    if (!(field in amendment.before) || !(field in amendment.after)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["changedFields"], message: `Before and after values are required for ${field}` });
    }
  }
});

export const futureSessionChangesSchema = z.object({
  planId: idSchema.nullable(),
  changesHash: sha256Schema,
  amendments: z.array(sessionAmendmentSchema),
}).strict();

export const coachingReviewAmendmentSchema = z.object({
  id: idSchema,
  planId: idSchema,
  sessionId: idSchema,
  operation: z.enum(["amend", "reschedule", "skip", "restore"]),
  actor: idSchema,
  actorKind: z.literal("user"),
  changedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(500),
  changedFields: z.array(sessionAmendmentFieldSchema).min(1),
  before: sessionAmendmentValuesSchema,
  after: sessionAmendmentValuesSchema,
  expectedRevision: revisionSchema,
  resultingRevision: revisionSchema,
}).strict().superRefine((amendment, ctx) => {
  if (amendment.resultingRevision !== amendment.expectedRevision + 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["resultingRevision"], message: "Resulting revision must follow the expected revision" });
  }
  if (new Set(amendment.changedFields).size !== amendment.changedFields.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["changedFields"], message: "Changed fields must be unique" });
  }
  for (const field of amendment.changedFields) {
    if (!(field in amendment.before) || !(field in amendment.after)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["changedFields"], message: `Before and after values are required for ${field}` });
    }
  }
});

export const coachingReviewSessionSchema = z.object({
  id: idSchema,
  prescribed: plannedWorkoutSchema,
  effective: plannedWorkoutSchema,
  status: z.enum(["upcoming", "skipped"]),
  revision: revisionSchema,
  amendments: z.array(coachingReviewAmendmentSchema),
}).strict().superRefine((session, ctx) => {
  if (session.prescribed.id !== session.id || session.effective.id !== session.id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "Review session identity must match prescribed and effective sessions" });
  }
});

export const coachingReviewContextSchema = z.object({
  schema: z.literal("coaching-review-context.v1"),
  id: idSchema,
  athleteId: idSchema,
  generatedAt: z.string().datetime({ offset: true }),
  currentLocalDate: dateSchema,
  activePlan: z.object({
    id: idSchema,
    version: revisionSchema,
    revision: revisionSchema,
    contentHash: sha256Schema,
  }).strict(),
  futureSessions: z.array(coachingReviewSessionSchema),
  contentHash: sha256Schema,
}).strict().superRefine((context, ctx) => {
  for (const [sessionIndex, session] of context.futureSessions.entries()) {
    if (session.effective.scheduledDate <= context.currentLocalDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["futureSessions", sessionIndex, "effective", "scheduledDate"], message: "Review context may contain only future sessions" });
    }
    for (const [amendmentIndex, amendment] of session.amendments.entries()) {
      if (amendment.planId !== context.activePlan.id || amendment.sessionId !== session.id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["futureSessions", sessionIndex, "amendments", amendmentIndex], message: "Amendment must belong to the active plan session" });
      }
    }
  }
});

export const planWeekSchema = z.object({
  weekStartsOn: dateSchema,
  focus: z.string().trim().min(1).max(500),
  sessionIds: z.array(idSchema).min(1),
}).strict().refine((week) => new Date(`${week.weekStartsOn}T00:00:00.000Z`).getUTCDay() === 1, {
  path: ["weekStartsOn"],
  message: "Plan weeks must start on Monday",
});

export const materialDifferenceSchema = z.object({
  field: z.string().trim().min(1),
  change: z.enum(["initial", "added", "removed", "changed", "unchanged"]),
  summary: z.string().trim().min(1).max(1000),
}).strict();

export const planProposalReviewSchema = z.object({
  historyStatus: z.enum(["current", "stale"]),
  historyWarning: z.string().trim().min(1).optional(),
  requiresStaleAcknowledgement: z.boolean(),
  comparedActivePlanId: idSchema.optional(),
  comparedActivePlanVersion: revisionSchema.optional(),
  goalTitle: z.string().trim().min(1),
  goalTarget: goalTargetSchema,
  materialDifferences: z.array(materialDifferenceSchema),
}).strict();

const planBodyObject = z.object({
  id: idSchema,
  athleteId: idSchema,
  goalId: idSchema,
  goalRevision: revisionSchema,
  routineRevision: revisionSchema,
  version: revisionSchema,
  revision: revisionSchema,
  startsOn: dateSchema,
  endsOn: dateSchema,
  timezone: ianaTimezoneSchema,
  weeklyStructure: z.array(planWeekSchema).min(1),
  workouts: z.array(plannedWorkoutSchema).min(1),
  contextArtifactId: idSchema,
  createdAt: z.string().datetime({ offset: true }),
}).strict();

type PlanBodyForValidation = z.infer<typeof planBodyObject>;

const validatePlanBody = (plan: PlanBodyForValidation, ctx: z.RefinementCtx) => {
  if (plan.endsOn < plan.startsOn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsOn"], message: "Plan end date must not precede its start" });
  }
  const dates = new Set<string>();
  const workoutIds = new Set<string>();
  const weekIdentities = new Set<string>();
  const structuredSessionIds = new Set<string>();
  for (const [weekIndex, week] of plan.weeklyStructure.entries()) {
    if (weekIdentities.has(week.weekStartsOn)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["weeklyStructure", weekIndex, "weekStartsOn"], message: "Plan weeks must have unique start dates" });
    }
    weekIdentities.add(week.weekStartsOn);
    const weekEnd = new Date(`${week.weekStartsOn}T00:00:00.000Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekEndsOn = weekEnd.toISOString().slice(0, 10);
    for (const sessionId of week.sessionIds) {
      if (structuredSessionIds.has(sessionId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["weeklyStructure", weekIndex, "sessionIds"], message: "A session may appear in only one plan week" });
      }
      structuredSessionIds.add(sessionId);
      const workout = plan.workouts.find((candidate) => candidate.id === sessionId);
      if (!workout) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["weeklyStructure", weekIndex, "sessionIds"], message: `Unknown session id ${sessionId}` });
      } else if (workout.scheduledDate < week.weekStartsOn || workout.scheduledDate > weekEndsOn) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["weeklyStructure", weekIndex, "sessionIds"], message: `Session ${sessionId} falls outside its plan week` });
      }
    }
  }
  for (const [workoutIndex, workout] of plan.workouts.entries()) {
    if (workoutIds.has(workout.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["workouts", workoutIndex, "id"], message: "Workout ids must be unique" });
    }
    workoutIds.add(workout.id);
    if (workout.scheduledDate < plan.startsOn || workout.scheduledDate > plan.endsOn) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["workouts"], message: "Workout falls outside the plan dates" });
    }
    if (dates.has(workout.scheduledDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["workouts"], message: "Only one workout may occupy a date" });
    }
    dates.add(workout.scheduledDate);
    if (!structuredSessionIds.has(workout.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["weeklyStructure"], message: `Session ${workout.id} is missing from the weekly structure` });
    }
  }
};

export const planProposalSchema = planBodyObject.extend({
  status: z.enum(["proposed", "withdrawn"]),
  proposedGoal: goalDraftSchema,
  goalRationale: z.string().trim().min(1).max(4000),
  rationale: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(4000),
  assumptions: z.array(z.string().trim().min(1).max(1000)).max(30),
  cautions: z.array(z.string().trim().min(1).max(1000)).max(30),
  sourceHistoryFingerprint: sha256Schema,
  contentHash: sha256Schema,
  review: planProposalReviewSchema.optional(),
}).strict().superRefine((proposal, ctx) => {
  validatePlanBody(proposal, ctx);
  if (proposal.proposedGoal.id !== proposal.goalId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proposedGoal", "id"], message: "Proposed goal id must match goalId" });
  }
  if (proposal.proposedGoal.revision !== proposal.goalRevision) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proposedGoal", "revision"], message: "Proposed goal revision must match goalRevision" });
  }
  if (proposal.proposedGoal.athleteId !== proposal.athleteId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proposedGoal", "athleteId"], message: "Proposed goal athlete must match athleteId" });
  }
});

export const planApprovalMetadataSchema = z.object({
  goalRationale: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  assumptions: z.array(z.string().trim().min(1)),
  cautions: z.array(z.string().trim().min(1)),
  sourceHistoryFingerprint: sha256Schema,
  contentHash: sha256Schema,
  review: planProposalReviewSchema.optional(),
}).strict();

export const trainingPlanSchema = z.discriminatedUnion("status", [
  planBodyObject.extend({ approval: planApprovalMetadataSchema, status: z.literal("draft") }).strict(),
  planBodyObject.extend({
    approval: planApprovalMetadataSchema,
    status: z.literal("active"),
    activatedAt: z.string().datetime({ offset: true }),
    activatedBy: z.literal("user"),
  }).strict(),
  planBodyObject.extend({
    approval: planApprovalMetadataSchema,
    status: z.literal("retired"),
    retiredAt: z.string().datetime({ offset: true }),
  }).strict(),
]).superRefine(validatePlanBody);

export const contextNoteReferenceSchema = z.object({
  kind: z.enum(["running_context", "weekly_reflections", "activity_notes"]),
  label: z.string().trim().min(1),
  relativePath: z.string().trim().min(1),
  status: z.enum(["available", "missing", "unreadable"]),
  noteCount: z.number().int().nonnegative().optional(),
}).strict();

export const contextWarningSchema = z.object({
  code: z.enum(["OPTIONAL_NOTE_MISSING", "OPTIONAL_NOTE_UNREADABLE"]),
  message: z.string().trim().min(1),
  noteKind: contextNoteReferenceSchema.shape.kind,
}).strict();

export const activePlanReferenceSchema = z.object({
  id: idSchema,
  version: revisionSchema,
  revision: revisionSchema,
}).strict();

export const contextArtifactSchema = z.object({
  id: idSchema,
  athleteId: idSchema,
  schemaVersion: revisionSchema,
  capturedAt: z.string().datetime({ offset: true }),
  activityCount: z.number().int().nonnegative(),
  earliestActivityDate: dateSchema.nullable(),
  latestActivityDate: dateSchema.nullable(),
  sources: z.array(z.enum(["gpx", "tcx", "csv", "strava", "second_brain", "manual"])).min(1),
  historyFingerprint: sha256Schema,
  contentHash: sha256Schema,
  digest: sha256Schema,
  futureSessionChangesHash: sha256Schema.optional(),
  activePlan: activePlanReferenceSchema.nullable(),
  noteReferences: z.array(contextNoteReferenceSchema),
  warnings: z.array(contextWarningSchema),
}).strict().refine((artifact) =>
  (artifact.earliestActivityDate === null) === (artifact.latestActivityDate === null),
  { message: "History dates must both be present or both be absent" },
).refine((artifact) => !artifact.earliestActivityDate || artifact.earliestActivityDate <= artifact.latestActivityDate!, {
  path: ["latestActivityDate"], message: "Latest activity cannot precede earliest activity",
});

export const contextHistoryCoverageSchema = z.object({
  athleteId: idSchema,
  activityCount: z.number().int().nonnegative(),
  earliestOccurredAt: z.string().datetime({ offset: true }).nullable(),
  latestOccurredAt: z.string().datetime({ offset: true }).nullable(),
  totalDistanceM: z.number().nonnegative(),
  sourceTypes: z.array(z.enum(["gpx", "tcx", "csv", "strava", "manual"])),
}).strict();

export const coachingContextEnvelopeSchema = z.object({
  schema: z.literal("coaching-context.v1"),
  artifact: contextArtifactSchema,
  profile: coachingProfileSchema.nullable(),
  routine: weeklyRoutineSchema.nullable(),
  planningGoal: goalDraftSchema.nullable(),
  settledGoal: settledGoalSchema.nullable(),
  activePlan: activePlanReferenceSchema.nullable(),
  futureSessionChanges: futureSessionChangesSchema.optional(),
  historyCoverage: contextHistoryCoverageSchema,
  activities: z.array(activitySummarySchema),
}).strict().superRefine((context, ctx) => {
  if (context.artifact.athleteId !== context.historyCoverage.athleteId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["historyCoverage", "athleteId"], message: "History athlete must match context athlete" });
  }
  if (context.artifact.activityCount !== context.activities.length || context.historyCoverage.activityCount !== context.activities.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["activities"], message: "Activity counts must match the complete history array" });
  }
  if (context.planningGoal && context.planningGoal.athleteId !== context.artifact.athleteId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["planningGoal", "athleteId"], message: "Planning goal must belong to the context athlete" });
  }
  if (context.settledGoal && context.settledGoal.athleteId !== context.artifact.athleteId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["settledGoal", "athleteId"], message: "Settled goal must belong to the context athlete" });
  }
  if ((context.activePlan?.id ?? null) !== (context.artifact.activePlan?.id ?? null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["activePlan"], message: "Active plan reference must match the artifact" });
  }
  if (context.futureSessionChanges) {
    if (context.futureSessionChanges.planId !== (context.activePlan?.id ?? null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["futureSessionChanges", "planId"], message: "Session changes must belong to the active plan" });
    }
    if (context.futureSessionChanges.changesHash !== context.artifact.futureSessionChangesHash) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["artifact", "futureSessionChangesHash"], message: "Artifact changes hash must match the structured session changes" });
    }
  }
});

export const contextPublishRequestSchema = z.object({
  profile: z.object({
    displayName: z.string().trim().min(1),
    why: z.string().trim().min(1),
    timezone: ianaTimezoneSchema,
    units: z.enum(["metric", "imperial"]),
    experience: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    constraints: z.array(z.string().trim().min(1)).optional(),
  }).strict(),
  goalDraft: z.object({
    title: z.string().trim().min(1),
    targetDate: dateSchema,
    distanceMeters: z.number().positive(),
  }).strict(),
  weeklyRoutine: z.object({
    timezone: ianaTimezoneSchema,
    availableDays: z.array(weekdaySchema).min(1).refine((days) => new Set(days).size === days.length, "Available days must be unique"),
    preferredLongRunDay: weekdaySchema.optional(),
    desiredSessionsPerWeek: z.number().int().min(1).max(7).optional(),
  }).strict(),
}).strict();

export const planProposalFileSchema = z.object({
  schema: z.literal("coaching-plan-proposal.v1"),
  proposal: planProposalSchema,
}).strict();

export const proposalDecisionRequestSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  expectedRevision: revisionSchema,
  acknowledgeStale: z.boolean().optional(),
  replacingPlanId: idSchema.optional(),
}).strict();

export const contextPublicationResultSchema = z.object({
  artifact: contextArtifactSchema,
  fingerprint: sha256Schema,
  contentHash: sha256Schema,
  jsonPath: z.string().min(1),
  markdownPath: z.string().min(1),
  snapshotId: idSchema,
  reviewContext: coachingReviewContextSchema.nullable(),
  reviewContextPath: z.string().min(1).nullable(),
}).strict();

export const contextPublishRouteDataSchema = contextPublicationResultSchema.extend({
  artifactId: idSchema,
  profile: coachingProfileSchema,
  routine: weeklyRoutineSchema,
  goal: goalDraftSchema,
}).strict();

export const proposalImportRouteDataSchema = z.object({ proposal: planProposalSchema }).strict();
export const planHistoryRouteDataSchema = z.object({ plans: z.array(trainingPlanSchema) }).strict();
export const activatePlanRequestSchema = z.object({
  expectedActivePlanId: idSchema.nullable(),
}).strict();
export const planActivationRouteDataSchema = z.object({
  activePlan: trainingPlanSchema,
  retiredPlan: trainingPlanSchema.nullable(),
  reused: z.boolean(),
}).strict();
export const currentContextRouteDataSchema = z.object({ context: coachingContextEnvelopeSchema.nullable() }).strict();
export const coachingReviewContextRouteDataSchema = z.object({ context: coachingReviewContextSchema.nullable() }).strict();
export const latestProposalRouteDataSchema = z.object({ proposal: planProposalSchema.nullable() }).strict();

export const coachingProfileUpdateRequestSchema = coachingProfileSchema.pick({
  displayName: true,
  timezone: true,
  units: true,
  why: true,
  experience: true,
  constraints: true,
});
export const coachingProfileRouteDataSchema = z.object({ profile: coachingProfileSchema.nullable() }).strict();

export const weeklyRoutineUpdateRequestSchema = z.object({
  timezone: ianaTimezoneSchema,
  desiredSessionsPerWeek: z.number().int().min(1).max(7),
  preferredLongRunDay: weekdaySchema.optional(),
  days: z.array(routineDaySchema).length(7),
}).strict().superRefine((routine, ctx) => {
  if (new Set(routine.days.map(({ day }) => day)).size !== 7) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Routine must contain each weekday exactly once" });
  }
  const available = routine.days.filter((day) => day.available);
  if (available.length < routine.desiredSessionsPerWeek) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["desiredSessionsPerWeek"], message: "Desired sessions exceed available days" });
  }
  if (routine.preferredLongRunDay && !available.some(({ day }) => day === routine.preferredLongRunDay)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["preferredLongRunDay"], message: "Long-run day must be available" });
  }
});
export const weeklyRoutineRouteDataSchema = z.object({ routine: weeklyRoutineSchema.nullable() }).strict();

export const calendarSessionSchema = z.object({
  id: idSchema,
  kind: workoutKindSchema,
  scheduledDate: dateSchema,
  startTime: timeSchema.optional(),
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(1000),
  prescription: z.string().trim().min(1).max(4000),
  cautions: z.array(z.string().trim().min(1).max(500)).max(20),
  durationMinutes: z.number().int().min(0).max(1440),
  distanceMeters: z.number().positive().max(500_000).optional(),
  intensityRpe: z.number().int().min(1).max(10).optional(),
  prescribedDate: dateSchema,
  effectiveDate: dateSchema,
  originalDate: dateSchema,
  status: z.enum(["upcoming", "skipped"]),
  revision: revisionSchema,
  warnings: z.array(z.string()),
  original: plannedWorkoutSchema.optional(),
  amendments: z.array(sessionAmendmentSchema).default([]),
}).strict().superRefine((session, ctx) => {
  if (session.originalDate !== session.prescribedDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["originalDate"], message: "Original date must match the immutable prescribed date" });
  }
  if (session.scheduledDate !== session.effectiveDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduledDate"], message: "Scheduled date must reflect the effective date" });
  }
});
export const calendarQueryRequestSchema = z.object({ from: dateSchema, to: dateSchema }).strict()
  .refine(({ from, to }) => from <= to, { path: ["to"], message: "to must be on or after from" });
export const calendarRouteDataSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  sessions: z.array(calendarSessionSchema),
}).strict();
export const calendarEditHttpRequestSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("amend"),
    expectedRevision: revisionSchema,
    reason: z.string().trim().min(1).max(500),
    changes: sessionAmendmentPatchSchema,
  }).strict(),
  z.object({
    operation: z.literal("reschedule"),
    expectedRevision: revisionSchema,
    reason: z.string().trim().min(1).max(500),
    date: dateSchema,
  }).strict(),
  z.object({
    operation: z.literal("skip"),
    expectedRevision: revisionSchema,
    reason: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({
    operation: z.literal("restore"),
    expectedRevision: revisionSchema,
    reason: z.string().trim().min(1).max(500),
  }).strict(),
]);
export const calendarEditRouteDataSchema = z.object({
  session: calendarSessionSchema,
  operation: z.enum(["amend", "reschedule", "skip", "restore"]),
}).strict();

export const todayQueryRequestSchema = z.object({ date: dateSchema.optional() }).strict();
export const todayCoachingStateSchema = z.enum(["no-plan", "rest", "upcoming", "skipped", "missed", "stale"]);
export const todayRouteDataSchema = z.object({
  athleteId: idSchema,
  date: dateSchema,
  sessionId: idSchema.nullable(),
  message: z.string().trim().min(1),
  source: z.enum(["ai", "fallback"]),
  generatedAt: z.string().datetime({ offset: true }),
  idempotencyKey: idSchema,
  timezone: ianaTimezoneSchema,
  state: todayCoachingStateSchema,
  status: todayCoachingStateSchema,
  goal: z.object({
    id: idSchema,
    title: z.string().trim().min(1),
    why: z.string().trim().min(1),
    targetDate: dateSchema,
    countdown: z.object({ days: z.number().int(), label: z.string().trim().min(1) }).strict(),
  }).strict().nullable(),
  plan: z.object({
    id: idSchema,
    version: revisionSchema,
    startsOn: dateSchema,
    endsOn: dateSchema,
  }).strict().nullable(),
  planVersion: revisionSchema.nullable(),
  session: calendarSessionSchema.nullable(),
  localCue: z.string().trim().min(1),
  scheduleWarnings: z.array(z.string()),
  stale: z.object({ isStale: z.boolean(), reason: z.string().trim().min(1).nullable() }).strict(),
  links: z.object({ plan: z.string().min(1), calendar: z.string().min(1), session: z.string().min(1).nullable() }).strict(),
}).strict().superRefine((today, ctx) => {
  if (today.status !== today.state) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "Status must match the Today state" });
  }
  if ((today.plan?.version ?? null) !== today.planVersion) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["planVersion"], message: "Plan version must match the Today plan" });
  }
});

export const reminderExternalStatusSchema = z.enum(["not_configured", "prepared", "scheduled", "attention", "disabled"]);
export const reminderPreferencesUpdateRequestSchema = z.object({
  enabled: z.boolean(),
  timezone: ianaTimezoneSchema,
  localTime: timeSchema,
  days: z.array(weekdaySchema).min(1).refine((days) => new Set(days).size === days.length, "Days must be unique"),
  channel: z.enum(["in_app", "codex_task"]),
  motivationalContext: z.boolean(),
}).partial().strict();
export const reminderPreferencesRouteDataSchema = z.object({
  enabled: z.boolean(),
  timezone: ianaTimezoneSchema,
  localTime: timeSchema,
  days: z.array(weekdaySchema).min(1),
  channel: z.enum(["in_app", "codex_task"]),
  motivationalContext: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
  preferences: reminderPreferencesSchema,
  externalStatus: reminderExternalStatusSchema,
  externalReference: z.string().min(1).nullable(),
}).strict();
export const reminderHandoffRequestSchema = z.object({
  enabled: z.boolean().optional(),
  timezone: ianaTimezoneSchema.optional(),
  localTime: timeSchema.optional(),
}).strict();
export const reminderHandoffRouteDataSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1),
  handoff: z.string().min(1),
  instructions: z.string().min(1),
  externalStatus: reminderExternalStatusSchema,
  externalReference: z.string().min(1).nullable(),
  scheduled: z.literal(false),
}).strict();
export const reminderExternalStatusRouteDataSchema = z.object({
  preferences: reminderPreferencesSchema,
  externalStatus: reminderExternalStatusSchema,
  externalReference: z.string().min(1).nullable(),
}).strict();

const calendarEditBaseSchema = z.object({
  planId: idSchema,
  sessionId: idSchema,
  expectedRevision: revisionSchema,
  actor: idSchema.default("user"),
  reason: z.string().trim().min(1).max(500),
  requestedAt: z.string().datetime({ offset: true }),
});

export const calendarEditRequestSchema = z.discriminatedUnion("operation", [
  calendarEditBaseSchema.extend({
    operation: z.literal("amend"),
    changes: sessionAmendmentPatchSchema,
  }).strict(),
  calendarEditBaseSchema.extend({
    operation: z.literal("reschedule"),
    effectiveDate: dateSchema,
  }).strict(),
  calendarEditBaseSchema.extend({ operation: z.literal("skip") }).strict(),
  calendarEditBaseSchema.extend({ operation: z.literal("restore") }).strict(),
]);

export const responseErrorSchema = z.object({
  code: idSchema,
  message: z.string().min(1),
  details: z.array(z.unknown()),
}).strict();
export const standardErrorResponseSchema = z.object({ error: responseErrorSchema }).strict();
export const standardSuccessResponseSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ data }).strict();

export const activePlanApiResponseSchema = standardSuccessResponseSchema(trainingPlanSchema);
export const planVersionRouteDataSchema = z.object({ plan: trainingPlanSchema }).strict();
export const planVersionApiResponseSchema = standardSuccessResponseSchema(planVersionRouteDataSchema);
export const contextPublishApiResponseSchema = standardSuccessResponseSchema(contextPublishRouteDataSchema);
export const proposalImportApiResponseSchema = standardSuccessResponseSchema(proposalImportRouteDataSchema);
export const planHistoryApiResponseSchema = standardSuccessResponseSchema(planHistoryRouteDataSchema);
export const planActivationApiResponseSchema = standardSuccessResponseSchema(planActivationRouteDataSchema);
export const currentContextApiResponseSchema = standardSuccessResponseSchema(currentContextRouteDataSchema);
export const latestProposalApiResponseSchema = standardSuccessResponseSchema(latestProposalRouteDataSchema);
export const coachingProfileApiResponseSchema = standardSuccessResponseSchema(coachingProfileRouteDataSchema);
export const weeklyRoutineApiResponseSchema = standardSuccessResponseSchema(weeklyRoutineRouteDataSchema);
export const calendarApiResponseSchema = standardSuccessResponseSchema(calendarRouteDataSchema);
export const calendarEditApiResponseSchema = standardSuccessResponseSchema(calendarEditRouteDataSchema);
export const todayApiResponseSchema = standardSuccessResponseSchema(todayRouteDataSchema);
export const reminderPreferencesApiResponseSchema = standardSuccessResponseSchema(reminderPreferencesRouteDataSchema);
export const reminderHandoffApiResponseSchema = standardSuccessResponseSchema(reminderHandoffRouteDataSchema);
export const reminderExternalStatusApiResponseSchema = standardSuccessResponseSchema(reminderExternalStatusRouteDataSchema);

export const proposalDecisionRouteDataSchema = z.discriminatedUnion("decision", [
  z.object({
    proposalId: idSchema,
    decision: z.literal("reject"),
    proposal: planProposalSchema,
    plan: trainingPlanSchema.nullable(),
  }).strict(),
  z.object({
    proposalId: idSchema,
    decision: z.literal("approve"),
    goal: settledGoalSchema,
    plan: trainingPlanSchema,
    activePlan: trainingPlanSchema,
  }).strict(),
]);
export const proposalDecisionApiResponseSchema = standardSuccessResponseSchema(proposalDecisionRouteDataSchema);

export const dailyBriefSchema = z.object({
  athleteId: idSchema,
  date: dateSchema,
  sessionId: idSchema.nullable(),
  message: z.string().trim().min(1),
  source: z.enum(["ai", "fallback"]),
  generatedAt: z.string().datetime({ offset: true }),
  idempotencyKey: idSchema,
}).strict();

export type CoachingProfile = z.infer<typeof coachingProfileSchema>;
export type ReminderPreferences = z.infer<typeof reminderPreferencesSchema>;
export type GoalDraft = z.infer<typeof goalDraftSchema>;
export type SettledGoal = z.infer<typeof settledGoalSchema>;
export type CoachingGoal = z.infer<typeof goalSchema>;
export type RoutineDay = z.infer<typeof routineDaySchema>;
export type WeeklyRoutine = z.infer<typeof weeklyRoutineSchema>;
export type PlannedWorkout = z.infer<typeof plannedWorkoutSchema>;
export type PlanProposal = z.infer<typeof planProposalSchema>;
export type TrainingPlan = z.infer<typeof trainingPlanSchema>;
export type SessionAmendment = z.infer<typeof sessionAmendmentSchema>;
export type SessionAmendmentField = z.infer<typeof sessionAmendmentFieldSchema>;
export type SessionAmendmentPatch = z.infer<typeof sessionAmendmentPatchSchema>;
export type FutureSessionChanges = z.infer<typeof futureSessionChangesSchema>;
export type CoachingReviewAmendment = z.infer<typeof coachingReviewAmendmentSchema>;
export type CoachingReviewSession = z.infer<typeof coachingReviewSessionSchema>;
export type CoachingReviewContext = z.infer<typeof coachingReviewContextSchema>;
export type ContextArtifact = z.infer<typeof contextArtifactSchema>;
export type CoachingContextEnvelope = z.infer<typeof coachingContextEnvelopeSchema>;
export type ContextNoteReference = z.infer<typeof contextNoteReferenceSchema>;
export type PlanProposalReview = z.infer<typeof planProposalReviewSchema>;
export type DailyBrief = z.infer<typeof dailyBriefSchema>;

export function assertFutureSessionChangeAllowed(input: {
  effectiveDate: string;
  currentLocalDate: string;
  planStatus: "draft" | "active" | "retired" | "proposal" | "superseded";
}): void {
  const effectiveDate = dateSchema.parse(input.effectiveDate);
  const currentLocalDate = dateSchema.parse(input.currentLocalDate);
  if (input.planStatus !== "active") {
    throw new Error("Future session changes require the active plan");
  }
  if (effectiveDate <= currentLocalDate) {
    throw new Error("Only sessions after the athlete's current local date can be changed");
  }
}

export type WorkoutRequest = Omit<PlannedWorkout, "scheduledDate" | "startTime"> & {
  preferredDay?: z.infer<typeof weekdaySchema>;
};

const weekdays = weekdaySchema.options;
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function placeSessionsOnRoutine(input: {
  weekStartsOn: string;
  routine: WeeklyRoutine;
  sessions: WorkoutRequest[];
  occupiedDates?: string[];
}): PlannedWorkout[] {
  dateSchema.parse(input.weekStartsOn);
  const routine = weeklyRoutineSchema.parse(input.routine);
  const occupied = new Set((input.occupiedDates ?? []).map((date) => dateSchema.parse(date)));
  const startDay = weekdays[(new Date(`${input.weekStartsOn}T00:00:00.000Z`).getUTCDay() + 6) % 7];
  const orderedDays = Array.from({ length: 7 }, (_, offset) => weekdays[(weekdays.indexOf(startDay) + offset) % 7]);
  const results: PlannedWorkout[] = [];

  for (const request of input.sessions) {
    const candidates = orderedDays
      .map((day, offset) => ({ day, offset, routineDay: routine.days.find((entry) => entry.day === day)! }))
      .filter(({ routineDay }) => routineDay.available
        && request.kind !== "rest"
        && routineDay.allowedKinds!.includes(request.kind)
        && request.durationMinutes <= routineDay.maxDurationMinutes!)
      .sort((a, b) => Number(b.day === request.preferredDay) - Number(a.day === request.preferredDay) || a.offset - b.offset);
    const slot = candidates.find(({ offset }) => !occupied.has(addDays(input.weekStartsOn, offset)));
    if (!slot) throw new Error(`No conflict-free routine slot for session ${request.id}`);
    const scheduledDate = addDays(input.weekStartsOn, slot.offset);
    occupied.add(scheduledDate);
    const { preferredDay: _preferredDay, ...workout } = request;
    results.push(plannedWorkoutSchema.parse({ ...workout, scheduledDate, startTime: slot.routineDay.startTime }));
  }
  return results;
}

export function assertPlanCanActivate(input: {
  proposal: PlanProposal;
  goal: CoachingGoal;
  approvedByUser: boolean;
  expectedProposalRevision: number;
  activePlanId?: string;
  replacingPlanId?: string;
}): void {
  const proposal = planProposalSchema.parse(input.proposal);
  const goal = goalSchema.parse(input.goal);
  if (proposal.status !== "proposed") throw new Error("Only proposed plans can be activated");
  if (!input.approvedByUser) throw new Error("Explicit user approval is required");
  if (input.expectedProposalRevision !== proposal.revision) throw new Error("Proposal revision conflict");
  if (proposal.goalId !== goal.id || proposal.goalRevision !== goal.revision) throw new Error("Proposal does not match the eligible goal version");
  if (input.activePlanId && input.replacingPlanId !== input.activePlanId) throw new Error("Replacing an active plan requires its explicit id");
}

export function buildDailyBrief(input: {
  profile: CoachingProfile;
  date: string;
  session?: PlannedWorkout;
  generatedAt: string;
  aiMessage?: string;
}): DailyBrief {
  const profile = coachingProfileSchema.parse(input.profile);
  const date = dateSchema.parse(input.date);
  const session = input.session ? plannedWorkoutSchema.parse(input.session) : undefined;
  const aiMessage = input.aiMessage?.trim();
  const message = aiMessage || (session
    ? `Today: ${session.title}. ${session.purpose} Remember why this matters: ${profile.why}`
    : `Today is for recovery and consistency. Remember why this matters: ${profile.why}`);
  return dailyBriefSchema.parse({
    athleteId: profile.athleteId,
    date,
    sessionId: session?.id ?? null,
    message,
    source: aiMessage ? "ai" : "fallback",
    generatedAt: input.generatedAt,
    idempotencyKey: `daily-brief:${profile.athleteId}:${date}:${session?.id ?? "rest"}`,
  });
}
