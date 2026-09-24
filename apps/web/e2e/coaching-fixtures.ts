import {
  activePlanApiResponseSchema,
  calendarApiResponseSchema,
  calendarEditApiResponseSchema,
  contextPublishApiResponseSchema,
  currentContextApiResponseSchema,
  latestProposalApiResponseSchema,
  planActivationApiResponseSchema,
  planHistoryApiResponseSchema,
  proposalDecisionApiResponseSchema,
  proposalImportApiResponseSchema,
  reminderExternalStatusApiResponseSchema,
  reminderHandoffApiResponseSchema,
  reminderPreferencesApiResponseSchema,
  standardErrorResponseSchema,
  todayApiResponseSchema,
} from "../../../packages/core/src/contracts/coaching.ts";
import { importUploadApiResponseSchema } from "../../../packages/core/src/contracts/imports.ts";

const time = "2026-09-13T08:00:00.000Z";
const hash = "a".repeat(64);
const athleteId = "e2e_athlete";

export const absent = (message = "No active plan") => standardErrorResponseSchema.parse({
  error: { code: "NOT_FOUND", message, details: [] },
});

export const fixtureGoal = (overrides: Record<string, unknown> = {}) => ({
  id: "goal_resume",
  athleteId,
  revision: 1,
  title: "Autumn half marathon",
  why: "Finish confidently",
  target: { kind: "performance", distanceMeters: 21_100, targetDate: "2026-10-12" },
  status: "draft",
  createdAt: time,
  updatedAt: time,
  ...overrides,
});

const workout = (overrides: Record<string, unknown> = {}) => ({
  id: "workout_resume",
  kind: "run",
  scheduledDate: "2026-09-15",
  startTime: "06:00",
  title: "Easy run and strides",
  purpose: "Maintain rhythm.",
  prescription: "Run easily.",
  cautions: [],
  durationMinutes: 45,
  distanceMeters: 7_000,
  intensityRpe: 3,
  ...overrides,
});

export const fixtureProposal = (overrides: Record<string, unknown> = {}) => {
  const goal = fixtureGoal();
  return {
    id: "proposal_resume",
    athleteId,
    goalId: goal.id,
    goalRevision: goal.revision,
    routineRevision: 1,
    version: 2,
    revision: 1,
    startsOn: "2026-09-14",
    endsOn: "2026-10-12",
    timezone: "Africa/Johannesburg",
    weeklyStructure: [{ weekStartsOn: "2026-09-14", focus: "Easy start", sessionIds: ["workout_resume"] }],
    workouts: [workout()],
    contextArtifactId: "context_resume",
    createdAt: time,
    status: "proposed",
    proposedGoal: goal,
    goalRationale: "Continue with a gradual build.",
    rationale: "Continue with a gradual build.",
    summary: "A saved plan draft.",
    assumptions: [],
    cautions: [],
    sourceHistoryFingerprint: hash,
    contentHash: hash,
    review: {
      historyStatus: "current",
      requiresStaleAcknowledgement: false,
      goalTitle: goal.title,
      goalTarget: goal.target,
      materialDifferences: [{ field: "plan", change: "initial", summary: "First plan." }],
    },
    ...overrides,
  };
};

export const fixturePlan = (overrides: Record<string, unknown> = {}) => {
  const proposal = fixtureProposal();
  const {
    status: _proposalStatus,
    proposedGoal: _proposedGoal,
    goalRationale,
    rationale,
    summary,
    assumptions,
    cautions,
    sourceHistoryFingerprint,
    contentHash,
    review,
    ...body
  } = proposal;
  return {
    ...body,
    status: "active",
    approval: {
      goalRationale,
      rationale,
      summary,
      assumptions,
      cautions,
      sourceHistoryFingerprint,
      contentHash,
      review,
    },
    activatedAt: time,
    activatedBy: "user",
    ...overrides,
  };
};

export const fixtureContext = (overrides: Record<string, unknown> = {}) => ({
  schema: "coaching-context.v1",
  artifact: {
    id: "context_resume", athleteId, schemaVersion: 1, capturedAt: time,
    activityCount: 0, earliestActivityDate: null, latestActivityDate: null,
    sources: ["manual"], historyFingerprint: hash, contentHash: hash, digest: hash,
    activePlan: null, noteReferences: [], warnings: [],
  },
  profile: {
    id: "profile_resume", athleteId, revision: 1, displayName: "Runner", timezone: "Africa/Johannesburg",
    units: "metric", why: "Finish confidently", experience: "intermediate", constraints: [], updatedAt: time,
  },
  routine: {
    id: "routine_resume", athleteId, revision: 1, timezone: "Africa/Johannesburg", desiredSessionsPerWeek: 1,
    preferredLongRunDay: "tuesday",
    days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => day === "tuesday"
      ? { day, available: true, startTime: "06:00", endTime: "08:00", maxDurationMinutes: 120, allowedKinds: ["run"] }
      : { day, available: false }),
    updatedAt: time,
  },
  planningGoal: fixtureGoal(),
  settledGoal: null,
  activePlan: null,
  historyCoverage: { athleteId, activityCount: 0, earliestOccurredAt: null, latestOccurredAt: null, totalDistanceM: 0, sourceTypes: [] },
  activities: [],
  ...overrides,
});

export const fixtureCalendarSession = (overrides: Record<string, unknown> = {}) => ({
  ...workout({ id: "session_resume", title: "Easy run and strides" }),
  prescribedDate: "2026-09-15",
  effectiveDate: "2026-09-15",
  originalDate: "2026-09-15",
  status: "upcoming",
  revision: 1,
  warnings: [],
  ...overrides,
});

export const fixtureToday = (overrides: Record<string, unknown> = {}) => ({
  athleteId,
  date: "2026-09-15",
  sessionId: "session_resume",
  message: "Your approved easy session supports the settled goal.",
  source: "fallback",
  generatedAt: time,
  idempotencyKey: "today_resume",
  timezone: "Africa/Johannesburg",
  state: "upcoming",
  status: "upcoming",
  goal: { id: "goal_resume", title: "Autumn half marathon", why: "Finish confidently", targetDate: "2026-10-12", countdown: { days: 27, label: "27 days to target" } },
  plan: { id: "plan_resume", version: 2, startsOn: "2026-09-14", endsOn: "2026-10-12" },
  planVersion: 2,
  session: fixtureCalendarSession(),
  localCue: "Start gently and remember why consistency matters.",
  scheduleWarnings: [],
  stale: { isStale: false, reason: null },
  links: { plan: "/dashboard/plan#active-plan-heading", calendar: "/dashboard/calendar", session: "/dashboard/calendar?session=session_resume&date=2026-09-15#session-session_resume" },
  ...overrides,
});

const preferences = {
  enabled: true, timezone: "Africa/Johannesburg", localTime: "06:30", days: ["monday"], channel: "codex_task", motivationalContext: true, updatedAt: time,
};

export const coachingFixtures = {
  importUpload: (overrides: Record<string, unknown> = {}) => importUploadApiResponseSchema.parse({ data: {
    importId: "import_resume", status: "completed", sourceType: "gpx", stagedCount: 1, normalizedCount: 1,
    duplicateCount: 0, rejectedCount: 0, parseWarnings: [], ...overrides,
  } }),
  activePlan: (plan = fixturePlan()) => activePlanApiResponseSchema.parse({ data: plan }),
  history: (plans: Record<string, unknown>[] = []) => planHistoryApiResponseSchema.parse({ data: { plans } }),
  latestProposal: (proposal: Record<string, unknown> | null = fixtureProposal()) => latestProposalApiResponseSchema.parse({ data: { proposal } }),
  currentContext: (context: Record<string, unknown> | null = fixtureContext()) => currentContextApiResponseSchema.parse({ data: { context } }),
  calendar: (sessions: Record<string, unknown>[] = [fixtureCalendarSession()], from = "2026-09-14", to = "2026-10-11") => calendarApiResponseSchema.parse({ data: { from, to, sessions } }),
  today: (overrides: Record<string, unknown> = {}) => todayApiResponseSchema.parse({ data: fixtureToday(overrides) }),
  contextPublish: (overrides: Record<string, unknown> = {}) => contextPublishApiResponseSchema.parse({ data: {
    artifact: fixtureContext().artifact, fingerprint: hash, contentHash: hash,
    jsonPath: "Coach Exchange/Generated/coaching-context.v1.json", markdownPath: "Coach Exchange/Generated/coaching-context.v1.md",
    snapshotId: "snapshot_resume", reviewContext: null, reviewContextPath: null, artifactId: "context_resume",
    profile: fixtureContext().profile, routine: fixtureContext().routine, goal: fixtureGoal(), ...overrides,
  } }),
  proposalImport: (proposal = fixtureProposal()) => proposalImportApiResponseSchema.parse({ data: { proposal } }),
  decision: (plan = fixturePlan(), proposalId = "proposal_resume") => proposalDecisionApiResponseSchema.parse({ data: {
    proposalId, decision: "approve", goal: { ...fixtureGoal(), status: "settled", settledAt: time, settledBy: "user" }, plan, activePlan: plan,
  } }),
  activation: (plan = fixturePlan()) => planActivationApiResponseSchema.parse({ data: { activePlan: plan, retiredPlan: null, reused: false } }),
  calendarEdit: (session = fixtureCalendarSession(), operation: "amend" | "reschedule" | "skip" | "restore" = "reschedule") => calendarEditApiResponseSchema.parse({ data: { session, operation } }),
  reminderPreferences: (overrides: Record<string, unknown> = {}) => reminderPreferencesApiResponseSchema.parse({ data: {
    ...preferences, updatedAt: time, preferences, externalStatus: "not_configured", externalReference: null, ...overrides,
  } }),
  reminderHandoff: (overrides: Record<string, unknown> = {}) => reminderHandoffApiResponseSchema.parse({ data: {
    path: "Coach Exchange/Generated/codex-reminder-handoff.v1.md", content: "Prepared, not yet scheduled.",
    handoff: "Prepared, not yet scheduled.", instructions: "Use the approved local coaching context.",
    externalStatus: "prepared", externalReference: "Coach Exchange/Generated/coaching-context.v1.json", scheduled: false, ...overrides,
  } }),
  reminderStatus: (overrides: Record<string, unknown> = {}) => reminderExternalStatusApiResponseSchema.parse({ data: {
    preferences, externalStatus: "prepared", externalReference: "Coach Exchange/Generated/coaching-context.v1.json", ...overrides,
  } }),
};
