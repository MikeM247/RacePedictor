import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  assertPlanCanActivate,
  assertFutureSessionChangeAllowed,
  buildDailyBrief as buildCoreDailyBrief,
  calendarEditRequestSchema,
  coachingContextEnvelopeSchema,
  coachingReviewContextSchema,
  coachingProfileSchema,
  contextArtifactSchema,
  goalDraftSchema,
  planWeekSchema,
  planProposalFileSchema,
  planProposalReviewSchema,
  planProposalSchema,
  reminderPreferencesSchema,
  settledGoalSchema,
  trainingPlanSchema,
  weeklyRoutineSchema,
  type CoachingProfile,
  type CoachingContextEnvelope,
  type CoachingReviewContext,
  type CoachingGoal,
  type ContextNoteReference,
  type DailyBrief,
  type GoalDraft,
  type PlanProposal,
  type PlanProposalReview,
  type PlannedWorkout,
  type ReminderPreferences,
  type SessionAmendment,
  type SettledGoal,
  type TrainingPlan,
  type WeeklyRoutine,
} from "../../../packages/core/src/contracts/coaching.ts";
import { buildCoachingReviewContext } from "../../../packages/core/src/services/coaching-review-context.ts";
import { listLocalActivities } from "../../../packages/db/src/local-activities.js";
import {
  CoachingRepositoryError,
  createLocalCoachingRepository,
  type CoachingGoal as StoredGoal,
  type CoachingPlan as StoredPlan,
  type CoachingProfile as StoredProfile,
  type CoachingRoutine as StoredRoutine,
  type LocalCoachingRepository,
  type PlannedWorkout as StoredWorkout,
  type ReminderPreferences as StoredReminderPreferences,
} from "../../../packages/db/src/local-coaching-repository.js";
import {
  buildDeterministicLocalCue,
  buildTargetCountdown,
  isCalendarDate,
  isIanaTimezone,
  localDateInIanaTimezone,
  type TodayCoachingState,
  type TargetCountdown,
} from "./today-coaching.ts";

if (typeof window !== "undefined") throw new Error("LocalCoachingService is server-only");

const DEFAULT_TIMEZONE = "Africa/Johannesburg";
const DEFAULT_REMINDER_TIME = "06:30";
const MAX_PLAN_PROPOSAL_BYTES = 1_048_576;
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const weekdayToNumber = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 } as const;
const numberToWeekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const workingDirectory = process.cwd();
const repositoryRoot = path.basename(workingDirectory) === "web" && path.basename(path.dirname(workingDirectory)) === "apps"
  ? path.resolve(workingDirectory, "../..")
  : workingDirectory;

export const defaultCoachingDatabasePath = path.join(repositoryRoot, ".local", "racepredictor", "racepredictor.sqlite");
export const defaultSecondBrainVaultPath = path.join(repositoryRoot, ".local", "obsidian-vault");
export const defaultSecondBrainCoachExchangePath = path.join(
  defaultSecondBrainVaultPath,
  "Areas",
  "Health & Fitness",
  "Running",
  "Coach Exchange",
);

export class LocalCoachingServiceError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LocalCoachingServiceError";
    this.code = code;
    this.details = details;
  }
}

type JsonObject = Record<string, unknown>;
type ProfileInput = Omit<CoachingProfile, "id" | "athleteId" | "revision" | "updatedAt">;
type RoutineInput = Omit<WeeklyRoutine, "id" | "athleteId" | "revision" | "updatedAt">;
type GoalInput = Pick<GoalDraft, "title" | "why" | "target">;
export type CalendarSession = PlannedWorkout & {
  prescribedDate: string;
  effectiveDate: string;
  originalDate: string;
  status: "upcoming" | "skipped";
  revision: number;
  warnings: string[];
  original: PlannedWorkout;
  amendments: SessionAmendment[];
};
export type TodayGoalSummary = {
  id: string;
  title: string;
  why: string;
  targetDate: string;
  countdown: TargetCountdown;
};
export type TodayPlanSummary = {
  id: string;
  version: number;
  startsOn: string;
  endsOn: string;
};
export type TodayCoachingOverview = {
  date: string;
  timezone: string;
  generatedAt: string;
  state: TodayCoachingState;
  goal: TodayGoalSummary | null;
  plan: TodayPlanSummary | null;
  session: CalendarSession | null;
  brief: DailyBrief | null;
  message: string;
  localCue: string;
  scheduleWarnings: string[];
  stale: { isStale: boolean; reason: string | null };
  links: { plan: string; calendar: string; session: string | null };
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
};

const stableJson = (value: unknown) => JSON.stringify(stableValue(value));
const jsonObject = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value)
  ? value as JsonObject
  : {};

const sha256 = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");

const proposalContent = (proposal: JsonObject) => ({
  athleteId: proposal.athleteId,
  goalId: proposal.goalId,
  goalRevision: proposal.goalRevision,
  routineRevision: proposal.routineRevision,
  proposedGoal: proposal.proposedGoal,
  goalRationale: proposal.goalRationale,
  startsOn: proposal.startsOn,
  endsOn: proposal.endsOn,
  timezone: proposal.timezone,
  weeklyStructure: proposal.weeklyStructure,
  workouts: proposal.workouts,
  contextArtifactId: proposal.contextArtifactId,
  sourceHistoryFingerprint: proposal.sourceHistoryFingerprint,
  rationale: proposal.rationale,
  summary: proposal.summary,
  assumptions: proposal.assumptions,
  cautions: proposal.cautions,
});

export const calculatePlanProposalContentHash = (proposal: JsonObject) => sha256(proposalContent(proposal));

const loadCompleteHistory = (input: {
  databasePath: string;
  athleteId: string;
  repository: LocalCoachingRepository;
}) => {
  const activities: ReturnType<typeof listLocalActivities>["items"] = [];
  const coverage = input.repository.getHistoryCoverage();
  let cursor: string | null = null;
  if (coverage.activityCount > 0) {
    do {
      const page = listLocalActivities({
        databasePath: input.databasePath,
        athleteId: input.athleteId,
        cursor,
        limit: 100,
      });
      activities.push(...page.items);
      cursor = page.nextCursor ?? null;
    } while (cursor);
  }
  activities.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  return {
    activities,
    coverage,
    historyFingerprint: sha256({ athleteId: input.athleteId, coverage, activities }),
  };
};

const noteSources = [
  {
    kind: "running_context" as const,
    label: "Running context",
    relativePath: "Areas/Health & Fitness/Running/Running Context.md",
    sourceType: "file" as const,
  },
  {
    kind: "weekly_reflections" as const,
    label: "Weekly running reflections",
    relativePath: "Reviews/Running",
    sourceType: "directory" as const,
  },
  {
    kind: "activity_notes" as const,
    label: "Running activity context template",
    relativePath: "Templates/Running Activity Context.md",
    sourceType: "file" as const,
  },
];

const countMarkdownFiles = async (directoryPath: string): Promise<number> => {
  let count = 0;
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) count += await countMarkdownFiles(entryPath);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) count += 1;
  }
  return count;
};

const collectContextNoteReferences = async (vaultPath: string) => {
  const noteReferences: ContextNoteReference[] = [];
  const warnings: Array<{
    code: "OPTIONAL_NOTE_MISSING" | "OPTIONAL_NOTE_UNREADABLE";
    message: string;
    noteKind: ContextNoteReference["kind"];
  }> = [];

  for (const source of noteSources) {
    const sourcePath = path.join(vaultPath, ...source.relativePath.split("/"));
    try {
      const noteCount = source.sourceType === "directory"
        ? await countMarkdownFiles(sourcePath)
        : (await readFile(sourcePath, "utf8"), 1);
      noteReferences.push({
        kind: source.kind,
        label: source.label,
        relativePath: source.relativePath,
        status: "available",
        noteCount,
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const status = code === "ENOENT" ? "missing" as const : "unreadable" as const;
      const warningCode = status === "missing" ? "OPTIONAL_NOTE_MISSING" as const : "OPTIONAL_NOTE_UNREADABLE" as const;
      noteReferences.push({
        kind: source.kind,
        label: source.label,
        relativePath: source.relativePath,
        status,
      });
      warnings.push({
        code: warningCode,
        noteKind: source.kind,
        message: `${source.label} is ${status}; the context was published without that optional note source.`,
      });
    }
  }
  return { noteReferences, warnings };
};

const atomicWrite = async (targetPath: string, contents: string) => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, targetPath);
};

const localDateFor = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const asProfile = (stored: StoredProfile | null): CoachingProfile | null => {
  if (!stored) return null;
  const constraints = jsonObject(stored.constraints).items;
  const preferences = jsonObject(stored.preferences);
  return coachingProfileSchema.parse({
    id: `profile_${stored.athleteId}`,
    athleteId: stored.athleteId,
    revision: stored.revision,
    displayName: stored.displayName,
    timezone: stored.timezone,
    units: stored.preferredUnits,
    why: stored.motivation,
    experience: preferences.experience,
    constraints: Array.isArray(constraints) ? constraints : [],
    updatedAt: stored.updatedAt,
  });
};

const asRoutine = (stored: StoredRoutine | null): WeeklyRoutine | null => {
  if (!stored) return null;
  const days = new Map(stored.days.map((day) => [day.dayOfWeek, day]));
  return weeklyRoutineSchema.parse({
    id: `routine_${stored.athleteId}`,
    athleteId: stored.athleteId,
    revision: stored.revision,
    timezone: stored.timezone,
    desiredSessionsPerWeek: stored.sessionsPerWeek,
    preferredLongRunDay: stored.longRunDay === null ? undefined : numberToWeekday[stored.longRunDay],
    days: weekdays.map((weekday) => {
      const storedDay = days.get(weekdayToNumber[weekday]);
      if (!storedDay?.available) return { day: weekday, available: false };
      const metadata = jsonObject(storedDay.notes ? JSON.parse(storedDay.notes) : {});
      return {
        day: weekday,
        available: true,
        startTime: storedDay.preferredTime,
        endTime: metadata.endTime,
        maxDurationMinutes: storedDay.maxDurationMinutes,
        allowedKinds: metadata.allowedKinds,
      };
    }),
    updatedAt: stored.updatedAt,
  });
};

const asGoalDraft = (stored: StoredGoal): GoalDraft => {
  const details = jsonObject(stored.details);
  return goalDraftSchema.parse({
    id: stored.id,
    athleteId: stored.athleteId,
    revision: stored.version,
    title: stored.title,
    why: details.why,
    target: details.target,
    status: "draft",
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  });
};

const asSettledGoal = (stored: StoredGoal): SettledGoal => {
  const details = jsonObject(stored.details);
  return settledGoalSchema.parse({
    id: stored.id,
    athleteId: stored.athleteId,
    revision: stored.version,
    title: stored.title,
    why: details.why,
    target: details.target,
    status: "settled",
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    settledAt: stored.settledAt,
    settledBy: "user",
  });
};

const asCoachingGoal = (stored: StoredGoal): CoachingGoal => stored.lifecycle === "settled"
  ? asSettledGoal(stored)
  : asGoalDraft(stored);

const asWorkout = (stored: StoredWorkout | StoredWorkout["approvedWorkout"]): PlannedWorkout => {
  const details = jsonObject(stored.details);
  const rawKind = details.kind ?? stored.workoutType;
  const kind: PlannedWorkout["kind"] = rawKind === "strength" || rawKind === "cross_train" || rawKind === "rest"
    ? rawKind
    : "run";
  const startTime = typeof details.startTime === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(details.startTime)
    ? details.startTime
    : undefined;
  const durationMinutes = kind === "rest" ? 0 : Math.max(1, stored.durationMinutes ?? 1);
  return {
    id: stored.id,
    kind,
    scheduledDate: "prescribedLocalDate" in stored ? stored.prescribedLocalDate : stored.localDate,
    startTime: kind === "rest" ? undefined : startTime,
    title: stored.title,
    purpose: String(details.purpose ?? stored.title),
    prescription: String(details.prescription ?? details.purpose ?? stored.title),
    cautions: Array.isArray(details.cautions) ? details.cautions.map(String) : [],
    durationMinutes,
    distanceMeters: typeof stored.distanceM === "number" && stored.distanceM > 0 ? stored.distanceM : undefined,
    intensityRpe: typeof details.intensityRpe === "number" ? details.intensityRpe : undefined,
  };
};

const asCalendarSessions = (workouts: StoredWorkout[]): CalendarSession[] => {
  const sessions = workouts.map((workout) => ({
    ...asWorkout(workout),
    scheduledDate: workout.effectiveLocalDate,
    prescribedDate: workout.prescribedLocalDate,
    effectiveDate: workout.effectiveLocalDate,
    originalDate: workout.prescribedLocalDate,
    status: workout.calendarStatus,
    revision: workout.revision,
    warnings: [] as string[],
    original: asWorkout(workout.approvedWorkout),
    amendments: workout.amendments,
  }));
  const activeDateCounts = new Map<string, number>();
  for (const session of sessions) {
    if (session.status === "skipped") continue;
    activeDateCounts.set(session.effectiveDate, (activeDateCounts.get(session.effectiveDate) ?? 0) + 1);
  }
  return sessions
    .map((session) => ({
      ...session,
      warnings: session.status !== "skipped" && (activeDateCounts.get(session.effectiveDate) ?? 0) > 1
        ? [`Same-day conflict: multiple active sessions are scheduled for ${session.effectiveDate}.`]
        : [],
    }))
    .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate) || left.id.localeCompare(right.id));
};

const weekStartsOn = (date: string) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
};

const deriveWeeklyStructure = (workouts: PlannedWorkout[]) => Array.from(
  workouts.reduce((weeks, workout) => {
    const week = weekStartsOn(workout.scheduledDate);
    const sessionIds = weeks.get(week) ?? [];
    sessionIds.push(workout.id);
    weeks.set(week, sessionIds);
    return weeks;
  }, new Map<string, string[]>()),
).sort(([left], [right]) => left.localeCompare(right)).map(([week, sessionIds]) => ({
  weekStartsOn: week,
  focus: "Preserved approved plan sessions",
  sessionIds,
}));

const positiveRevision = (value: unknown, fallback: number) => Number.isInteger(value) && Number(value) > 0
  ? Number(value)
  : fallback;
const stringArray = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  : [];

const planSourceBody = (plan: StoredPlan) => {
  const summary = jsonObject(plan.summary);
  const source = jsonObject(summary.sourceProposal);
  const workouts = plan.workouts.map(asWorkout);
  const storedWeeks = z.array(planWeekSchema).safeParse(source.weeklyStructure);
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id : plan.id,
    athleteId: plan.athleteId,
    goalId: plan.goalId,
    goalRevision: positiveRevision(source.goalRevision ?? summary.goalRevision, 1),
    routineRevision: positiveRevision(source.routineRevision ?? summary.routineRevision, 1),
    version: positiveRevision(source.version, plan.version),
    revision: positiveRevision(source.revision, plan.revision),
    startsOn: plan.startDate,
    endsOn: plan.endDate,
    timezone: typeof source.timezone === "string" && isIanaTimezone(source.timezone)
      ? source.timezone
      : typeof summary.timezone === "string" && isIanaTimezone(summary.timezone)
        ? summary.timezone
        : DEFAULT_TIMEZONE,
    weeklyStructure: storedWeeks.success ? storedWeeks.data : deriveWeeklyStructure(workouts),
    workouts,
    contextArtifactId: typeof source.contextArtifactId === "string" && source.contextArtifactId.trim()
      ? source.contextArtifactId
      : typeof summary.contextArtifactId === "string" && summary.contextArtifactId.trim()
        ? summary.contextArtifactId
        : `context_${plan.contextSnapshotId ?? "legacy"}`,
    createdAt: typeof source.createdAt === "string" && !Number.isNaN(new Date(source.createdAt).valueOf())
      ? source.createdAt
      : plan.createdAt,
  };
};

const proposalGoalFrom = (plan: StoredPlan, storedGoal?: StoredGoal | null): GoalDraft => {
  const source = jsonObject(jsonObject(plan.summary).sourceProposal);
  const parsed = goalDraftSchema.safeParse(source.proposedGoal);
  if (parsed.success) return parsed.data;
  if (storedGoal) return asGoalDraft(storedGoal);
  return goalDraftSchema.parse({
    id: plan.goalId,
    athleteId: plan.athleteId,
    revision: positiveRevision(source.goalRevision, 1),
    title: "Legacy approved goal",
    why: "Preserve the goal attached to this legacy approved plan.",
    target: {
      kind: "consistency",
      sessionsPerWeek: 1,
      minimumMinutesPerWeek: 30,
      startsOn: plan.startDate,
      endsOn: plan.endDate,
    },
    status: "draft",
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  });
};

const approvalMetadata = (plan: StoredPlan) => {
  const summary = jsonObject(plan.summary);
  const source = jsonObject(summary.sourceProposal);
  const sourceHistoryFingerprint = typeof source.sourceHistoryFingerprint === "string" && /^[a-f0-9]{64}$/.test(source.sourceHistoryFingerprint)
    ? source.sourceHistoryFingerprint
    : typeof summary.sourceHistoryFingerprint === "string" && /^[a-f0-9]{64}$/.test(summary.sourceHistoryFingerprint)
      ? summary.sourceHistoryFingerprint
      : sha256({ planId: plan.id, contextSnapshotId: plan.contextSnapshotId, legacy: true });
  const contentHash = typeof source.contentHash === "string" && /^[a-f0-9]{64}$/.test(source.contentHash)
    ? source.contentHash
    : typeof summary.contentHash === "string" && /^[a-f0-9]{64}$/.test(summary.contentHash)
      ? summary.contentHash
      : sha256({ planId: plan.id, version: plan.version, sourceHistoryFingerprint, legacy: true });
  const review = planProposalReviewSchema.safeParse(summary.review ?? source.review);
  return {
    goalRationale: typeof source.goalRationale === "string" && source.goalRationale.trim()
      ? source.goalRationale
      : "Approved with the goal attached to this plan version.",
    rationale: typeof source.rationale === "string" && source.rationale.trim()
      ? source.rationale
      : typeof summary.rationale === "string" && summary.rationale.trim()
        ? summary.rationale
        : "Preserved from an earlier approved plan version.",
    summary: typeof source.summary === "string" && source.summary.trim() ? source.summary : plan.title,
    assumptions: stringArray(source.assumptions),
    cautions: stringArray(source.cautions),
    sourceHistoryFingerprint,
    contentHash,
    review: review.success ? review.data : undefined,
  };
};

const sourceProposal = (plan: StoredPlan, storedGoal?: StoredGoal | null) => {
  const source = planSourceBody(plan);
  const approval = approvalMetadata(plan);
  const proposalGoal = proposalGoalFrom(plan, storedGoal);
  const candidate: JsonObject = {
    ...source,
    goalRevision: proposalGoal.revision,
    status: jsonObject(plan.summary).proposalStatus === "withdrawn" ? "withdrawn" : "proposed",
    proposedGoal: proposalGoal,
    ...approval,
    review: approval.review,
    contentHash: approval.contentHash,
  };
  return planProposalSchema.parse(candidate);
};

const asProposal = (plan: StoredPlan, storedGoal?: StoredGoal | null): PlanProposal => {
  const source = sourceProposal(plan, storedGoal);
  const summary = jsonObject(plan.summary);
  return planProposalSchema.parse({
    ...source,
    id: plan.id,
    version: plan.version,
    revision: plan.revision,
    workouts: plan.workouts.map(asWorkout),
    status: summary.proposalStatus === "withdrawn" ? "withdrawn" : "proposed",
    review: summary.review,
  });
};

const asTrainingPlan = (plan: StoredPlan): TrainingPlan => {
  const source = planSourceBody(plan);
  const status = plan.lifecycle === "active"
    ? { status: "active" as const, activatedAt: plan.activatedAt, activatedBy: "user" as const }
    : plan.lifecycle === "superseded"
      ? { status: "retired" as const, retiredAt: plan.supersededAt }
      : { status: "draft" as const };
  return trainingPlanSchema.parse({
    ...source,
    id: plan.id,
    version: plan.version,
    revision: plan.revision,
    workouts: plan.workouts.map(asWorkout),
    approval: approvalMetadata(plan),
    ...status,
  });
};

const buildPlanProposalReview = (input: {
  proposal: PlanProposal;
  goal: CoachingGoal;
  activePlan: StoredPlan | null;
  currentHistoryFingerprint: string;
}): PlanProposalReview => {
  const stale = input.proposal.sourceHistoryFingerprint !== input.currentHistoryFingerprint;
  if (!input.activePlan) {
    return {
      historyStatus: stale ? "stale" : "current",
      historyWarning: stale
        ? "New or changed activity history was imported after this proposal was generated. Review the change and acknowledge it before approval."
        : undefined,
      requiresStaleAcknowledgement: stale,
      goalTitle: input.goal.title,
      goalTarget: input.goal.target,
      materialDifferences: [{
        field: "active_plan",
        change: "initial",
        summary: "No active plan exists; approving this proposal will create the first active version.",
      }],
    };
  }

  const active = { ...planSourceBody(input.activePlan), ...approvalMetadata(input.activePlan) };
  const comparison = (
    field: string,
    same: boolean,
    changedSummary: string,
    unchangedSummary: string,
  ): PlanProposalReview["materialDifferences"][number] => ({
    field,
    change: same ? "unchanged" : "changed",
    summary: same ? unchangedSummary : changedSummary,
  });
  const activeRhythm = active.weeklyStructure.map((week) => ({
    weekStartsOn: week.weekStartsOn,
    focus: week.focus,
    sessionCount: week.sessionIds.length,
  }));
  const proposedRhythm = input.proposal.weeklyStructure.map((week) => ({
    weekStartsOn: week.weekStartsOn,
    focus: week.focus,
    sessionCount: week.sessionIds.length,
  }));
  const workoutSignature = (proposal: { workouts: PlannedWorkout[] }) => proposal.workouts.map((workout) => ({
    kind: workout.kind,
    scheduledDate: workout.scheduledDate,
    startTime: workout.startTime,
    durationMinutes: workout.durationMinutes,
    distanceMeters: workout.distanceMeters,
    intensityRpe: workout.intensityRpe,
    prescription: workout.prescription,
    cautions: workout.cautions,
  }));

  return {
    historyStatus: stale ? "stale" : "current",
    historyWarning: stale
      ? "New or changed activity history was imported after this proposal was generated. Review the change and acknowledge it before approval."
      : undefined,
    requiresStaleAcknowledgement: stale,
    comparedActivePlanId: input.activePlan.id,
    comparedActivePlanVersion: input.activePlan.version,
    goalTitle: input.goal.title,
    goalTarget: input.goal.target,
    materialDifferences: [
      comparison(
        "plan_range",
        active.startsOn === input.proposal.startsOn && active.endsOn === input.proposal.endsOn,
        `Plan range changes from ${active.startsOn}–${active.endsOn} to ${input.proposal.startsOn}–${input.proposal.endsOn}.`,
        `Plan range remains ${input.proposal.startsOn}–${input.proposal.endsOn}.`,
      ),
      comparison(
        "timezone",
        active.timezone === input.proposal.timezone,
        `Timezone changes from ${active.timezone} to ${input.proposal.timezone}.`,
        `Timezone remains ${input.proposal.timezone}.`,
      ),
      comparison(
        "weekly_structure",
        stableJson(activeRhythm) === stableJson(proposedRhythm),
        `Weekly structure changes from ${active.weeklyStructure.length} to ${input.proposal.weeklyStructure.length} structured week(s).`,
        `Weekly structure remains ${input.proposal.weeklyStructure.length} week(s) with the same focus and session rhythm.`,
      ),
      comparison(
        "session_prescriptions",
        stableJson(workoutSignature(active)) === stableJson(workoutSignature(input.proposal)),
        `Session prescriptions or scheduling change across ${active.workouts.length} existing and ${input.proposal.workouts.length} proposed session(s).`,
        `All ${input.proposal.workouts.length} session prescriptions and scheduled dates are unchanged.`,
      ),
      comparison(
        "assumptions_and_cautions",
        stableJson({ assumptions: active.assumptions, cautions: active.cautions })
          === stableJson({ assumptions: input.proposal.assumptions, cautions: input.proposal.cautions }),
        "Plan-level assumptions or cautions have changed; review them before approval.",
        "Plan-level assumptions and cautions are unchanged.",
      ),
    ],
  };
};

export type LocalCoachingServiceOptions = {
  databasePath?: string;
  exchangePath?: string;
  vaultPath?: string;
  athleteId?: string;
  clock?: () => Date;
};

export class LocalCoachingService {
  readonly databasePath: string;
  readonly exchangePath: string;
  readonly vaultPath: string;
  readonly generatedPath: string;
  readonly athleteId: string;
  private readonly repository: LocalCoachingRepository;
  private readonly clock: () => Date;

  constructor(options: LocalCoachingServiceOptions = {}) {
    this.databasePath = options.databasePath
      ?? process.env.RACEPREDICTOR_DATABASE_PATH
      ?? defaultCoachingDatabasePath;
    this.exchangePath = options.exchangePath
      ?? process.env.RACEPREDICTOR_COACH_EXCHANGE_PATH
      ?? defaultSecondBrainCoachExchangePath;
    this.vaultPath = options.vaultPath
      ?? process.env.RACEPREDICTOR_VAULT_PATH
      ?? defaultSecondBrainVaultPath;
    this.generatedPath = path.join(this.exchangePath, "Generated");
    this.athleteId = options.athleteId ?? "athlete_001";
    this.clock = options.clock ?? (() => new Date());
    this.repository = createLocalCoachingRepository({
      databasePath: this.databasePath,
      athleteId: this.athleteId,
      clock: this.clock,
    });
  }

  close() {
    this.repository.close();
  }

  private run<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof LocalCoachingServiceError) throw error;
      if (error instanceof CoachingRepositoryError) {
        throw new LocalCoachingServiceError(error.code, error.message, error.details, { cause: error });
      }
      if (error instanceof z.ZodError) {
        throw new LocalCoachingServiceError("VALIDATION_ERROR", "Coaching data failed validation", error.issues, { cause: error });
      }
      throw error;
    }
  }

  loadProfile() {
    return this.run(() => asProfile(this.repository.loadProfile()));
  }

  saveProfile(input: ProfileInput) {
    return this.run(() => {
      const candidate = coachingProfileSchema.parse({
        ...input,
        id: `profile_${this.athleteId}`,
        athleteId: this.athleteId,
        revision: this.repository.loadProfile()?.revision ?? 1,
        updatedAt: this.clock().toISOString(),
      });
      return asProfile(this.repository.saveProfile({
        displayName: candidate.displayName,
        timezone: candidate.timezone,
        preferredUnits: candidate.units,
        motivation: candidate.why,
        constraints: { items: candidate.constraints },
        preferences: { experience: candidate.experience },
      }))!;
    });
  }

  loadRoutine() {
    return this.run(() => asRoutine(this.repository.loadRoutine()));
  }

  saveRoutine(input: RoutineInput) {
    return this.run(() => {
      const candidate = weeklyRoutineSchema.parse({
        ...input,
        id: `routine_${this.athleteId}`,
        athleteId: this.athleteId,
        revision: this.repository.loadRoutine()?.revision ?? 1,
        updatedAt: this.clock().toISOString(),
      });
      return asRoutine(this.repository.saveRoutine({
        sessionsPerWeek: candidate.desiredSessionsPerWeek,
        longRunDay: candidate.preferredLongRunDay === undefined
          ? null
          : weekdayToNumber[candidate.preferredLongRunDay],
        timezone: candidate.timezone,
        days: candidate.days.map((day) => ({
          dayOfWeek: weekdayToNumber[day.day],
          available: day.available,
          maxDurationMinutes: day.maxDurationMinutes,
          preferredTime: day.startTime,
          notes: day.available
            ? JSON.stringify({ endTime: day.endTime, allowedKinds: day.allowedKinds })
            : null,
        })),
      }))!;
    });
  }

  createGoal(input: GoalInput) {
    return this.run(() => {
      const timestamp = this.clock().toISOString();
      const candidate = goalDraftSchema.parse({
        ...input,
        id: "pending",
        athleteId: this.athleteId,
        revision: 1,
        status: "draft",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const targetDate = candidate.target.kind === "performance" ? candidate.target.targetDate : candidate.target.endsOn;
      return asGoalDraft(this.repository.createGoal({
        title: candidate.title,
        goalType: candidate.target.kind,
        targetDate,
        details: { why: candidate.why, target: candidate.target },
      }));
    });
  }

  settleGoal(goalId: string) {
    return this.run(() => asSettledGoal(this.repository.settleGoal(goalId)));
  }

  async publishCoachingContext(input: { planningGoalId?: string } = {}) {
    const { activities, coverage, historyFingerprint } = loadCompleteHistory({
      databasePath: this.databasePath,
      athleteId: this.athleteId,
      repository: this.repository,
    });
    const profile = this.loadProfile();
    const routine = this.loadRoutine();
    const storedSettledGoal = this.repository.loadSettledGoal();
    const settledGoal = storedSettledGoal ? asSettledGoal(storedSettledGoal) : null;
    const storedPlanningGoal = input.planningGoalId ? this.repository.loadGoal(input.planningGoalId) : null;
    if (input.planningGoalId && !storedPlanningGoal) {
      throw new LocalCoachingServiceError("NOT_FOUND", "Planning goal was not found");
    }
    if (storedPlanningGoal && storedPlanningGoal.lifecycle !== "draft") {
      throw new LocalCoachingServiceError("INVALID_STATE", "Only a draft goal can be published as the planning goal");
    }
    const planningGoal = storedPlanningGoal ? asGoalDraft(storedPlanningGoal) : null;
    const storedActivePlan = this.repository.loadActivePlan();
    const activePlan = storedActivePlan
      ? { id: storedActivePlan.id, version: storedActivePlan.version, revision: storedActivePlan.revision }
      : null;
    const amendments = (storedActivePlan?.workouts ?? []).flatMap((workout) => workout.amendments);
    const futureSessionChanges = {
      planId: storedActivePlan?.id ?? null,
      changesHash: sha256(amendments),
      amendments,
    };
    const { noteReferences, warnings } = await collectContextNoteReferences(this.vaultPath);
    const contentHash = sha256({
      athleteId: this.athleteId,
      profile,
      routine,
      planningGoal,
      settledGoal,
      activePlan,
      futureSessionChanges,
      coverage,
      historyFingerprint,
      noteReferences,
      warnings,
    });
    const capturedAt = this.clock().toISOString();
    const reviewContext = storedActivePlan
      ? buildCoachingReviewContext({
        athleteId: this.athleteId,
        generatedAt: capturedAt,
        currentLocalDate: localDateInIanaTimezone(new Date(capturedAt), planSourceBody(storedActivePlan).timezone),
        activePlan: {
          id: storedActivePlan.id,
          version: storedActivePlan.version,
          revision: storedActivePlan.revision,
          contentHash: approvalMetadata(storedActivePlan).contentHash,
        },
        sessions: storedActivePlan.workouts.map((workout) => ({
          id: workout.id,
          prescribed: asWorkout(workout.approvedWorkout),
          effective: { ...asWorkout(workout), scheduledDate: workout.effectiveLocalDate },
          status: workout.calendarStatus,
          revision: workout.revision,
          amendments: workout.amendments.map((amendment) => ({ ...amendment, actorKind: "user" as const })),
        })),
      })
      : null;
    const sources = Array.from(new Set([
      ...coverage.sourceTypes.filter((source) => ["gpx", "tcx", "csv", "strava", "manual"].includes(source)),
      "second_brain",
    ]));
    const artifact = contextArtifactSchema.parse({
      id: `context_${contentHash.slice(0, 24)}`,
      athleteId: this.athleteId,
      schemaVersion: 2,
      capturedAt,
      activityCount: coverage.activityCount,
      earliestActivityDate: coverage.earliestOccurredAt?.slice(0, 10) ?? null,
      latestActivityDate: coverage.latestOccurredAt?.slice(0, 10) ?? null,
      sources,
      historyFingerprint,
      contentHash,
      digest: contentHash,
      futureSessionChangesHash: futureSessionChanges.changesHash,
      activePlan,
      noteReferences,
      warnings,
    });
    const envelope = coachingContextEnvelopeSchema.parse({
      schema: "coaching-context.v1" as const,
      artifact,
      profile,
      routine,
      planningGoal,
      settledGoal,
      activePlan,
      futureSessionChanges,
      historyCoverage: coverage,
      activities,
    });
    const jsonPath = path.join(this.generatedPath, "coaching-context.v1.json");
    const markdownPath = path.join(this.generatedPath, "coaching-context.v1.md");
    const reviewContextPath = reviewContext
      ? path.join(this.generatedPath, "coaching-review-context.v1.json")
      : null;
    const markdown = [
      "<!-- RacePredictor generated file. Personal notes elsewhere in Coach Exchange are never modified. -->",
      "# Coaching Context",
      "",
      `- Athlete: ${profile?.displayName ?? this.athleteId}`,
      `- Activities: ${coverage.activityCount}`,
      `- History: ${artifact.earliestActivityDate ?? "none"} to ${artifact.latestActivityDate ?? "none"}`,
      `- Planning goal: ${planningGoal?.title ?? "None"}`,
      `- Active goal: ${settledGoal?.title ?? "None"}`,
      `- Active plan: ${activePlan ? `${activePlan.id} v${activePlan.version} (revision ${activePlan.revision})` : "None"}`,
      `- Reasoned future-session changes: ${futureSessionChanges.amendments.length}`,
      `- Future-session changes hash: \`${futureSessionChanges.changesHash}\``,
      `- History fingerprint: \`${historyFingerprint}\``,
      `- Context content hash: \`${contentHash}\``,
      "",
      "## Second Brain note references",
      "",
      ...noteReferences.map((reference) => `- ${reference.label}: \`${reference.relativePath}\` (${reference.status}${reference.noteCount === undefined ? "" : `, ${reference.noteCount} note(s)`})`),
      ...(warnings.length === 0 ? [] : ["", "## Context warnings", "", ...warnings.map((warning) => `- ${warning.message}`)]),
      "",
      "The JSON file beside this brief contains the complete normalized activity history and structured coaching context.",
      "",
    ].join("\n");
    await Promise.all([
      atomicWrite(jsonPath, `${JSON.stringify(envelope, null, 2)}\n`),
      atomicWrite(markdownPath, markdown),
      ...(reviewContext && reviewContextPath
        ? [atomicWrite(reviewContextPath, `${JSON.stringify(reviewContext, null, 2)}\n`)]
        : []),
    ]);
    const snapshot = this.repository.saveContextSnapshot({
      inputChecksum: contentHash,
      metadata: {
        schema: envelope.schema,
        artifactId: artifact.id,
        historyFingerprint,
        contentHash,
        activePlan,
        futureSessionChanges,
        coachingReviewContext: reviewContext
          ? { id: reviewContext.id, contentHash: reviewContext.contentHash, jsonPath: reviewContextPath }
          : null,
        planningGoalId: planningGoal?.id ?? null,
        planningGoalRevision: planningGoal?.revision ?? null,
        noteReferences,
        warnings,
        jsonPath,
        markdownPath,
      },
    });
    return {
      artifact,
      fingerprint: historyFingerprint,
      contentHash,
      jsonPath,
      markdownPath,
      snapshotId: snapshot.id,
      reviewContext,
      reviewContextPath,
    };
  }

  async importPlanProposal(filePath = path.join(this.exchangePath, "coaching-plan-proposal.v1.json")) {
    let raw: unknown;
    try {
      const file = await stat(filePath);
      if (!file.isFile()) throw new Error("Proposal path is not a file");
      if (file.size > MAX_PLAN_PROPOSAL_BYTES) {
        throw new LocalCoachingServiceError(
          "PLAN_PROPOSAL_TOO_LARGE",
          `Plan proposal exceeds the ${MAX_PLAN_PROPOSAL_BYTES} byte import limit`,
        );
      }
      raw = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error instanceof LocalCoachingServiceError) throw error;
      throw new LocalCoachingServiceError("INVALID_PLAN_PROPOSAL", "Plan proposal is not valid coaching-plan-proposal.v1 JSON", undefined, { cause: error });
    }
    const validation = planProposalFileSchema.safeParse(raw);
    if (!validation.success) {
      throw new LocalCoachingServiceError(
        "INVALID_PLAN_PROPOSAL",
        "Plan proposal is not valid coaching-plan-proposal.v1 JSON",
        validation.error.issues,
      );
    }
    const parsed: z.infer<typeof planProposalFileSchema> = validation.data;
    const proposal = parsed.proposal;
    const computedContentHash = calculatePlanProposalContentHash(proposal);
    if (proposal.contentHash !== computedContentHash) {
      throw new LocalCoachingServiceError("CONTENT_HASH_MISMATCH", "Plan proposal content does not match its declared content hash", {
        declaredContentHash: proposal.contentHash,
        computedContentHash,
      });
    }
    if (proposal.athleteId !== this.athleteId) {
      throw new LocalCoachingServiceError("ATHLETE_MISMATCH", "Plan proposal belongs to a different athlete");
    }
    const goal = this.repository.loadGoal(proposal.goalId);
    const routine = this.repository.loadRoutine();
    const context = this.repository.getLatestContextSnapshot();
    if (!goal || goal.version !== proposal.goalRevision || goal.lifecycle === "superseded") {
      throw new LocalCoachingServiceError("GOAL_VERSION_MISMATCH", "Plan proposal does not match an eligible current goal draft");
    }
    const proposalGoal = asGoalDraft(goal);
    if (stableJson(proposal.proposedGoal) !== stableJson(proposalGoal)) {
      throw new LocalCoachingServiceError("GOAL_CONTENT_MISMATCH", "Plan proposal changed the published goal draft");
    }
    if (!routine || routine.revision !== proposal.routineRevision) {
      throw new LocalCoachingServiceError("ROUTINE_VERSION_MISMATCH", "Plan proposal does not match the current routine");
    }
    const contextMetadata = jsonObject(context?.metadata);
    if (!context || contextMetadata.artifactId !== proposal.contextArtifactId) {
      throw new LocalCoachingServiceError("CONTEXT_VERSION_MISMATCH", "Plan proposal does not match the latest coaching context");
    }
    if (contextMetadata.planningGoalId && contextMetadata.planningGoalId !== proposal.goalId) {
      throw new LocalCoachingServiceError("CONTEXT_VERSION_MISMATCH", "Plan proposal goal does not match the published planning context");
    }
    const currentHistory = loadCompleteHistory({
      databasePath: this.databasePath,
      athleteId: this.athleteId,
      repository: this.repository,
    });
    const review = buildPlanProposalReview({
      proposal,
      goal: proposalGoal,
      activePlan: this.repository.loadActivePlan(),
      currentHistoryFingerprint: currentHistory.historyFingerprint,
    });
    const reviewedProposal = planProposalSchema.parse({ ...proposal, review });
    const stored = this.run(() => this.repository.saveValidatedPlan({
      goalId: proposal.goalId,
      contextSnapshotId: context.id,
      title: `Training plan v${proposal.version}`,
      startDate: proposal.startsOn,
      endDate: proposal.endsOn,
      summary: {
        rationale: proposal.rationale,
        contentHash: proposal.contentHash,
        proposalStatus: "proposed",
        goalRevision: proposal.goalRevision,
        routineRevision: proposal.routineRevision,
        timezone: proposal.timezone,
        contextArtifactId: proposal.contextArtifactId,
        sourceHistoryFingerprint: proposal.sourceHistoryFingerprint,
        review,
        sourceProposal: reviewedProposal,
      },
      workouts: proposal.workouts.map((workout, position) => ({
        id: workout.id,
        localDate: workout.scheduledDate,
        position,
        title: workout.title,
        workoutType: workout.kind,
        durationMinutes: workout.durationMinutes,
        distanceM: workout.distanceMeters,
        intensity: workout.intensityRpe ? `RPE ${workout.intensityRpe}` : null,
        details: {
          kind: workout.kind,
          purpose: workout.purpose,
          prescription: workout.prescription,
          cautions: workout.cautions,
          startTime: workout.startTime,
          intensityRpe: workout.intensityRpe,
        },
      })),
    }));
    return asProposal(stored, goal);
  }

  rejectPlanProposal(input: {
    planId: string;
    expectedRevision: number;
    reason?: string;
  }) {
    return this.run(() => asProposal(this.repository.withdrawPlan({
      planId: input.planId,
      expectedRevision: input.expectedRevision,
      actor: "user",
      reason: input.reason,
    })));
  }

  activatePlan(input: {
    planId: string;
    expectedRevision: number;
    approvedByUser: boolean;
    replacingPlanId?: string;
    acknowledgeStale?: boolean;
  }) {
    return this.run(() => {
      const stored = this.repository.loadPlan(input.planId);
      const goal = stored ? this.repository.loadGoal(stored.goalId) : null;
      if (!stored || !goal) throw new LocalCoachingServiceError("PLAN_NOT_READY", "Plan and its proposed goal are required");
      const proposal = asProposal(stored, goal);
      const active = this.repository.loadActivePlan();
      try {
        assertPlanCanActivate({
          proposal,
          goal: asCoachingGoal(goal),
          approvedByUser: input.approvedByUser,
          expectedProposalRevision: input.expectedRevision,
          activePlanId: active?.id,
          replacingPlanId: input.replacingPlanId,
        });
      } catch (error) {
        throw new LocalCoachingServiceError("PLAN_ACTIVATION_REJECTED", error instanceof Error ? error.message : "Plan activation rejected", undefined, { cause: error });
      }
      const currentHistory = loadCompleteHistory({
        databasePath: this.databasePath,
        athleteId: this.athleteId,
        repository: this.repository,
      });
      const historyIsStale = proposal.sourceHistoryFingerprint !== currentHistory.historyFingerprint;
      if (historyIsStale && !input.acknowledgeStale) {
        throw new LocalCoachingServiceError(
          "STALE_HISTORY_ACKNOWLEDGEMENT_REQUIRED",
          "The activity history has changed since this proposal was generated. Review the warning and explicitly acknowledge it before approval.",
          {
            sourceHistoryFingerprint: proposal.sourceHistoryFingerprint,
            currentHistoryFingerprint: currentHistory.historyFingerprint,
          },
        );
      }
      return asTrainingPlan(this.repository.activatePlan(input.planId, {
        expectedRevision: input.expectedRevision,
        sourceHistoryFingerprint: proposal.sourceHistoryFingerprint,
        acknowledgedHistoryFingerprint: historyIsStale ? currentHistory.historyFingerprint : undefined,
      }));
    });
  }

  getActivePlan() {
    return this.run(() => {
      const plan = this.repository.loadActivePlan();
      return plan ? asTrainingPlan(plan) : null;
    });
  }

  getSettledGoal() {
    return this.run(() => {
      const goal = this.repository.loadSettledGoal();
      return goal ? asSettledGoal(goal) : null;
    });
  }

  listPlanHistory() {
    return this.run(() => this.repository.listPlans()
      .filter((plan) => plan.lifecycle === "active" || plan.lifecycle === "superseded")
      .map(asTrainingPlan));
  }

  getPlanVersion(planId: string) {
    return this.run(() => {
      const plan = this.repository.loadPlan(planId);
      if (!plan || (plan.lifecycle !== "active" && plan.lifecycle !== "superseded")) return null;
      return asTrainingPlan(plan);
    });
  }

  getLatestProposal() {
    return this.run(() => {
      const plan = this.repository.listPlans().find((candidate) => candidate.lifecycle === "proposal");
      if (!plan) return null;
      return asProposal(plan, this.repository.loadGoal(plan.goalId));
    });
  }

  async getCurrentContext(): Promise<CoachingContextEnvelope | null> {
    const snapshot = this.repository.getLatestContextSnapshot();
    if (!snapshot) return null;
    const metadata = jsonObject(snapshot.metadata);
    const contextPath = typeof metadata.jsonPath === "string"
      ? metadata.jsonPath
      : path.join(this.generatedPath, "coaching-context.v1.json");
    try {
      return coachingContextEnvelopeSchema.parse(JSON.parse(await readFile(contextPath, "utf8")));
    } catch (error) {
      throw new LocalCoachingServiceError("CONTEXT_ARTIFACT_UNREADABLE", "The latest coaching context artifact could not be loaded", undefined, { cause: error });
    }
  }

  async getCurrentReviewContext(): Promise<CoachingReviewContext | null> {
    if (!this.repository.loadActivePlan()) return null;
    const contextPath = path.join(this.generatedPath, "coaching-review-context.v1.json");
    try {
      return coachingReviewContextSchema.parse(JSON.parse(await readFile(contextPath, "utf8")));
    } catch (error) {
      throw new LocalCoachingServiceError("CONTEXT_ARTIFACT_UNREADABLE", "The latest coaching review context artifact could not be loaded", undefined, { cause: error });
    }
  }

  listActiveCalendar() {
    return this.run(() => asCalendarSessions(this.repository.loadActivePlan()?.workouts ?? []));
  }

  listCalendarActivities(input: { from: string; to: string }) {
    return this.run(() => {
      const items: ReturnType<typeof listLocalActivities>["items"] = [];
      let cursor: string | null = null;
      do {
        const page = listLocalActivities({
          databasePath: this.databasePath,
          athleteId: this.athleteId,
          from: input.from,
          to: input.to,
          cursor,
          limit: 100,
        });
        items.push(...page.items);
        cursor = page.nextCursor ?? null;
      } while (cursor);
      return items.filter((activity) => ["run", "trail_run", "treadmill_run"].includes(activity.sport));
    });
  }

  editCalendar(input: z.input<typeof calendarEditRequestSchema>) {
    return this.run(() => {
      const request = calendarEditRequestSchema.parse(input);
      const active = this.repository.loadActivePlan();
      if (!active || active.id !== request.planId) {
        throw new LocalCoachingServiceError("ACTIVE_PLAN_REQUIRED", "Calendar adjustments require the active plan");
      }
      const target = active.workouts.find((workout) => workout.id === request.sessionId);
      if (!target) throw new LocalCoachingServiceError("NOT_FOUND", "Calendar session was not found in the active plan");
      const profile = this.loadProfile();
      const timezone = profile?.timezone ?? this.loadRoutine()?.timezone ?? DEFAULT_TIMEZONE;
      try {
        assertFutureSessionChangeAllowed({
          effectiveDate: target.effectiveLocalDate,
          currentLocalDate: localDateInIanaTimezone(this.clock(), timezone),
          planStatus: "active",
        });
      } catch (error) {
        throw new LocalCoachingServiceError(
          "NOT_FUTURE_SESSION",
          error instanceof Error ? error.message : "Only future sessions can be changed",
          undefined,
          { cause: error },
        );
      }
      const adjusted = this.repository.adjustWorkout({
        workoutId: request.sessionId,
        operation: request.operation,
        toDate: request.operation === "reschedule" ? request.effectiveDate : null,
        changes: request.operation === "amend" ? request.changes : null,
        expectedRevision: request.expectedRevision,
        actor: request.actor,
        reason: request.reason,
        requestedAt: request.requestedAt,
      });
      const sessions = asCalendarSessions(this.repository.loadActivePlan()?.workouts ?? [adjusted]);
      return sessions.find((session) => session.id === adjusted.id)!;
    });
  }

  buildTodayOverview(input: { date?: string } = {}): TodayCoachingOverview {
    return this.run(() => {
      const profile = this.loadProfile();
      const generatedAt = this.clock().toISOString();
      const configuredTimezone = this.asReminderPreferences(this.repository.loadReminderPreferences())?.timezone
        ?? profile?.timezone
        ?? DEFAULT_TIMEZONE;
      if (!isIanaTimezone(configuredTimezone)) {
        throw new LocalCoachingServiceError("INVALID_TIMEZONE", "Today requires a valid IANA timezone");
      }
      if (input.date !== undefined && !isCalendarDate(input.date)) {
        throw new LocalCoachingServiceError("VALIDATION_ERROR", "Today date must use a real YYYY-MM-DD calendar date");
      }
      const date = input.date ?? localDateInIanaTimezone(this.clock(), configuredTimezone);
      const storedGoal = this.repository.loadSettledGoal();
      const goal = storedGoal ? asSettledGoal(storedGoal) : null;
      const targetDate = goal
        ? goal.target.kind === "performance" ? goal.target.targetDate : goal.target.endsOn
        : null;
      const goalSummary = goal && targetDate ? {
        id: goal.id,
        title: goal.title,
        why: goal.why,
        targetDate,
        countdown: buildTargetCountdown(date, targetDate),
      } : null;
      const active = this.repository.loadActivePlan();
      const links = {
        plan: "/dashboard/plan#active-plan-heading",
        calendar: "/dashboard/calendar",
        session: null as string | null,
      };
      if (!active) {
        const state = "no-plan" as const;
        return {
          date,
          timezone: configuredTimezone,
          generatedAt,
          state,
          goal: goalSummary,
          plan: null,
          session: null,
          brief: null,
          message: "No active coaching plan is approved yet. Settle a goal and explicitly approve a proposal before relying on daily coaching.",
          localCue: buildDeterministicLocalCue(state),
          scheduleWarnings: [],
          stale: { isStale: false, reason: null },
          links: { ...links, plan: "/dashboard/plan" },
        };
      }
      if (!profile) throw new LocalCoachingServiceError("PROFILE_REQUIRED", "A coaching profile is required for Today");

      const plan: TodayPlanSummary = {
        id: active.id,
        version: active.version,
        startsOn: active.startDate,
        endsOn: active.endDate,
      };
      const calendar = asCalendarSessions(active.workouts);
      const todaySessions = calendar.filter((session) => session.effectiveDate === date);
      const upcomingSession = todaySessions.find((session) => session.status === "upcoming") ?? null;
      const skippedSession = todaySessions.find((session) => session.status === "skipped") ?? null;
      const missedSession = calendar
        .filter((session) => session.status === "upcoming" && session.effectiveDate < date)
        .at(-1) ?? null;
      const latestContext = this.repository.getLatestContextSnapshot();
      const summary = jsonObject(active.summary);
      const source = jsonObject(summary.sourceProposal);
      const acknowledgement = jsonObject(summary.staleHistoryAcknowledgement);
      const latestContextMetadata = jsonObject(latestContext?.metadata);
      const planHistoryFingerprint = typeof acknowledgement.acknowledgedHistoryFingerprint === "string"
        ? acknowledgement.acknowledgedHistoryFingerprint
        : typeof source.sourceHistoryFingerprint === "string"
          ? source.sourceHistoryFingerprint
          : active.contextSnapshotId === latestContext?.id && typeof latestContextMetadata.historyFingerprint === "string"
            ? latestContextMetadata.historyFingerprint
            : null;
      const currentHistoryFingerprint = loadCompleteHistory({
        databasePath: this.databasePath,
        athleteId: this.athleteId,
        repository: this.repository,
      }).historyFingerprint;
      const staleReason = !planHistoryFingerprint
        ? "The active plan has no verifiable source-history fingerprint."
        : planHistoryFingerprint !== currentHistoryFingerprint
          ? "Imported activity history changed after the active plan was reviewed."
          : null;
      const state: TodayCoachingState = staleReason
        ? "stale"
        : upcomingSession
          ? "upcoming"
          : skippedSession
            ? "skipped"
            : missedSession
              ? "missed"
              : "rest";
      const session = upcomingSession ?? skippedSession ?? (state === "missed" || state === "stale" ? missedSession : null);
      if (session) {
        links.session = `/dashboard/calendar?session=${encodeURIComponent(session.id)}&date=${session.effectiveDate}#session-${encodeURIComponent(session.id)}`;
      }
      const prescribedWorkout = upcomingSession
        ? active.workouts.find((workout) => workout.id === upcomingSession.id)
        : null;
      const baseBrief = buildCoreDailyBrief({
        profile,
        date,
        session: prescribedWorkout ? asWorkout(prescribedWorkout) : undefined,
        generatedAt,
      });
      const message = state === "stale"
        ? `${staleReason} Review the app-owned context before relying on today's schedule; no plan change has been made.`
        : state === "missed" && missedSession
          ? `${missedSession.title} was scheduled for ${missedSession.effectiveDate} and is still marked upcoming. Check Calendar; no plan change has been made.`
          : state === "skipped" && skippedSession
            ? `${skippedSession.title} is explicitly skipped. Its approved prescription remains unchanged.`
            : baseBrief.message;
      const brief = { ...baseBrief, message };
      const scheduleWarnings = [
        ...(session?.warnings ?? []),
        ...(missedSession ? [`${missedSession.title} is past and still marked upcoming. No automatic run review or plan change has occurred.`] : []),
        ...(date < active.startDate ? [`The approved plan starts on ${active.startDate}.`] : []),
        ...(date > active.endDate ? [`The approved plan ended on ${active.endDate}.`] : []),
        ...(staleReason ? [staleReason] : []),
      ];
      this.repository.storeDailyBrief({
        localDate: date,
        planId: active.id,
        workoutId: brief.sessionId,
        message,
        payload: brief,
        source: brief.source,
        generatedAt,
      });
      return {
        date,
        timezone: configuredTimezone,
        generatedAt,
        state,
        goal: goalSummary,
        plan,
        session,
        brief,
        message,
        localCue: buildDeterministicLocalCue(state, session?.title),
        scheduleWarnings: Array.from(new Set(scheduleWarnings)),
        stale: { isStale: Boolean(staleReason), reason: staleReason },
        links,
      };
    });
  }

  buildTodayBrief(): DailyBrief {
    const overview = this.buildTodayOverview();
    if (!overview.brief) throw new LocalCoachingServiceError("ACTIVE_PLAN_REQUIRED", "An active plan is required for a daily brief");
    return overview.brief;
  }

  private asReminderPreferences(stored: StoredReminderPreferences | null): ReminderPreferences | null {
    if (!stored) return null;
    const preferences = jsonObject(stored.preferences);
    return reminderPreferencesSchema.parse({
      enabled: stored.enabled,
      timezone: stored.timezone,
      localTime: stored.localTime,
      days: preferences.days ?? weekdays,
      channel: stored.deliveryChannel,
      motivationalContext: preferences.motivationalContext ?? true,
      updatedAt: stored.updatedAt,
    });
  }

  loadReminderPreferences() {
    return this.run(() => {
      const stored = this.repository.loadReminderPreferences();
      return {
        preferences: this.asReminderPreferences(stored),
        externalStatus: stored?.externalStatus ?? "not_configured",
        externalReference: stored?.externalReference ?? null,
      };
    });
  }

  saveReminderPreferences(input: Partial<Omit<ReminderPreferences, "updatedAt">> = {}) {
    return this.run(() => {
      const current = this.asReminderPreferences(this.repository.loadReminderPreferences());
      const requestedTimezone = input.timezone ?? current?.timezone ?? DEFAULT_TIMEZONE;
      if (!isIanaTimezone(requestedTimezone)) {
        throw new LocalCoachingServiceError("INVALID_TIMEZONE", "Reminder timezone must be a valid IANA timezone");
      }
      const candidate = reminderPreferencesSchema.parse({
        enabled: input.enabled ?? current?.enabled ?? true,
        timezone: requestedTimezone,
        localTime: input.localTime ?? current?.localTime ?? DEFAULT_REMINDER_TIME,
        days: input.days ?? current?.days ?? weekdays,
        channel: input.channel ?? current?.channel ?? "codex_task",
        motivationalContext: input.motivationalContext ?? current?.motivationalContext ?? true,
        updatedAt: this.clock().toISOString(),
      });
      const stored = this.repository.saveReminderPreferences({
        enabled: candidate.enabled,
        timezone: candidate.timezone,
        localTime: candidate.localTime,
        deliveryChannel: candidate.channel,
        externalStatus: candidate.enabled ? "not_configured" : "disabled",
        preferences: { days: candidate.days, motivationalContext: candidate.motivationalContext },
      });
      return {
        preferences: this.asReminderPreferences(stored)!,
        externalStatus: stored.externalStatus,
        externalReference: stored.externalReference,
      };
    });
  }

  async generateCodexReminderHandoff() {
    const existing = this.loadReminderPreferences();
    const preferences = existing.preferences ?? this.saveReminderPreferences().preferences;
    if (!preferences.enabled) throw new LocalCoachingServiceError("REMINDER_DISABLED", "Enable reminders before creating a Codex handoff");
    const timestamp = this.clock().toISOString();
    const version = timestamp.replaceAll(/[-:.]/g, "").replace("Z", "Z");
    const targetPath = path.join(this.generatedPath, `codex-reminder-handoff.v1.${version}.md`);
    const today = this.buildTodayOverview();
    const content = [
      "# Codex recurring coaching reminder handoff",
      "",
      `Schedule: ${preferences.localTime} ${preferences.timezone}`,
      `Days: ${preferences.days.join(", ")}`,
      "External status: prepared, not yet scheduled",
      "",
      "## Current app-owned context",
      "- Context artifact: Coach Exchange/Generated/coaching-context.v1.json",
      `- Approved plan: ${today.plan ? `${today.plan.id} (version ${today.plan.version})` : "none"}`,
      `- Settled goal: ${today.goal?.title ?? "none"}`,
      `- Local date basis: ${today.date} (${today.timezone})`,
      "",
      "At each scheduled time, read that current RacePredictor context and approved plan, then write one concise motivational message grounded in the app's Today state and the athlete's stated why.",
      "",
      "## Boundaries",
      "- Do not add, move, skip, replace, or otherwise change the approved plan.",
      "- Do not provide medical diagnosis or medical authority; direct injury or health concerns to an appropriate professional.",
      "- Do not review a completed run or claim automatic adaptation. Post-run review and plan adaptation are outside this Phase 1 handoff.",
      "- If no approved plan or current Today context is available, say so instead of inventing a session.",
      "",
    ].join("\n");
    await atomicWrite(targetPath, content);
    const stored = this.repository.saveReminderPreferences({
      enabled: true,
      timezone: preferences.timezone,
      localTime: preferences.localTime,
      deliveryChannel: preferences.channel,
      externalStatus: "prepared",
      externalReference: targetPath,
      preferences: { days: preferences.days, motivationalContext: preferences.motivationalContext },
    });
    return {
      path: targetPath,
      content,
      externalStatus: stored.externalStatus,
      externalReference: stored.externalReference,
      scheduled: false as const,
    };
  }

  confirmReminderAutomation(input: {
    externalStatus: "scheduled" | "attention";
    externalReference: string | null;
  }) {
    return this.run(() => {
      const existing = this.repository.loadReminderPreferences();
      if (!existing || !existing.enabled) {
        throw new LocalCoachingServiceError("REMINDER_NOT_PREPARED", "Prepare an enabled reminder handoff before confirming external automation status");
      }
      if (input.externalStatus === "scheduled" && !input.externalReference?.trim()) {
        throw new LocalCoachingServiceError("VALIDATION_ERROR", "Scheduled automation requires an external reference");
      }
      const stored = this.repository.saveReminderPreferences({
        enabled: existing.enabled,
        timezone: existing.timezone,
        localTime: existing.localTime,
        deliveryChannel: existing.deliveryChannel,
        externalStatus: input.externalStatus,
        externalReference: input.externalReference?.trim() || null,
        preferences: existing.preferences,
      });
      return {
        preferences: this.asReminderPreferences(stored)!,
        externalStatus: stored.externalStatus,
        externalReference: stored.externalReference,
      };
    });
  }
}

export const createLocalCoachingService = (options: LocalCoachingServiceOptions = {}) => new LocalCoachingService(options);
