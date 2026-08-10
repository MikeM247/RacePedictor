import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPlanCanActivate,
  buildDailyBrief,
  calendarApiResponseSchema,
  calendarEditApiResponseSchema,
  calendarEditHttpRequestSchema,
  calendarEditRequestSchema,
  calendarQueryRequestSchema,
  coachingProfileApiResponseSchema,
  coachingProfileUpdateRequestSchema,
  coachingContextEnvelopeSchema,
  coachingProfileSchema,
  contextPublishApiResponseSchema,
  currentContextApiResponseSchema,
  goalSchema,
  latestProposalApiResponseSchema,
  placeSessionsOnRoutine,
  reminderExternalStatusApiResponseSchema,
  reminderExternalStatusRequestSchema,
  reminderHandoffApiResponseSchema,
  reminderHandoffRequestSchema,
  reminderPreferencesApiResponseSchema,
  reminderPreferencesUpdateRequestSchema,
  proposalImportApiResponseSchema,
  planProposalSchema,
  standardErrorResponseSchema,
  standardSuccessResponseSchema,
  todayApiResponseSchema,
  todayQueryRequestSchema,
  weeklyRoutineApiResponseSchema,
  weeklyRoutineUpdateRequestSchema,
  weeklyRoutineSchema,
  type CoachingProfile,
  type PlanProposal,
  type WeeklyRoutine,
} from "../src/contracts/coaching.ts";

const now = "2026-08-05T06:00:00.000+02:00";
const profile: CoachingProfile = {
  id: "profile-1", athleteId: "athlete-1", revision: 1, displayName: "Test Athlete",
  timezone: "Africa/Johannesburg", units: "metric", why: "Follow a consistent synthetic training plan.",
  experience: "intermediate", constraints: [], updatedAt: now,
};
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const routine: WeeklyRoutine = {
  id: "routine-1", athleteId: "athlete-1", revision: 2, timezone: "Africa/Johannesburg",
  desiredSessionsPerWeek: 3, preferredLongRunDay: "saturday", updatedAt: now,
  days: days.map((day) => day === "monday" || day === "wednesday" || day === "saturday"
    ? { day, available: true, startTime: "06:00", endTime: "09:00", maxDurationMinutes: day === "saturday" ? 180 : 90, allowedKinds: ["run", "strength", "cross_train"] }
    : { day, available: false }),
};
const settledGoal = {
  id: "goal-1", athleteId: "athlete-1", revision: 3, status: "settled" as const,
  title: "Half marathon", why: profile.why,
  target: { kind: "performance" as const, distanceMeters: 21_097.5, targetDate: "2026-11-01", targetTimeSeconds: 7200 },
  createdAt: now, updatedAt: now, settledAt: now, settledBy: "user" as const,
};
const proposedGoal = {
  id: settledGoal.id, athleteId: settledGoal.athleteId, revision: settledGoal.revision,
  title: settledGoal.title, why: settledGoal.why, target: settledGoal.target,
  status: "draft" as const, createdAt: settledGoal.createdAt, updatedAt: settledGoal.updatedAt,
};

const makeProposal = (): PlanProposal => {
  const workouts = placeSessionsOnRoutine({
    weekStartsOn: "2026-08-03", routine,
    sessions: [{
      id: "run-1", kind: "run", title: "Easy run", purpose: "Aerobic base",
      prescription: "Run easily for 45 minutes.", cautions: [], durationMinutes: 45,
    }],
  });
  return planProposalSchema.parse({
    id: "plan-1", athleteId: "athlete-1", goalId: settledGoal.id, goalRevision: settledGoal.revision,
    routineRevision: routine.revision, version: 1, revision: 4, startsOn: "2026-08-03", endsOn: "2026-08-09",
    timezone: routine.timezone,
    weeklyStructure: [{ weekStartsOn: "2026-08-03", focus: "Establish a safe aerobic rhythm", sessionIds: ["run-1"] }],
    workouts, contextArtifactId: "context-1", createdAt: now, status: "proposed", rationale: "Safe starting load",
    proposedGoal, goalRationale: "The target reflects the athlete's stated outcome and timeline.",
    summary: "One easy aerobic session starts the plan.", assumptions: ["The athlete is currently healthy"], cautions: [],
    sourceHistoryFingerprint: "a".repeat(64), contentHash: "b".repeat(64),
  });
};

test("contracts reject impossible dates, targets, and routines", () => {
  assert.equal(coachingProfileSchema.safeParse({ ...profile, why: "" }).success, false);
  assert.equal(coachingProfileSchema.safeParse({ ...profile, timezone: "Mars/Olympus_Mons" }).success, false);
  assert.equal(goalSchema.safeParse({ ...settledGoal, target: { ...settledGoal.target, targetDate: "2026-02-30", distanceMeters: -1 } }).success, false);
  assert.equal(weeklyRoutineSchema.safeParse({ ...routine, desiredSessionsPerWeek: 5 }).success, false);
  assert.equal(weeklyRoutineSchema.safeParse({ ...routine, timezone: "Not/A_Timezone" }).success, false);
});

test("plan contracts reject duplicate workout ids, duplicate week starts, and invalid timezones", () => {
  const proposal = makeProposal();
  assert.equal(planProposalSchema.safeParse({ ...proposal, script: "do-not-execute" }).success, false);
  const duplicateWorkout = planProposalSchema.safeParse({
    ...proposal,
    workouts: [proposal.workouts[0], { ...proposal.workouts[0] }],
  });
  assert.equal(duplicateWorkout.success, false);
  assert.equal(duplicateWorkout.error?.issues.some((issue) => issue.message === "Workout ids must be unique"), true);

  const duplicateWeek = planProposalSchema.safeParse({
    ...proposal,
    weeklyStructure: [proposal.weeklyStructure[0], { ...proposal.weeklyStructure[0] }],
  });
  assert.equal(duplicateWeek.success, false);
  assert.equal(duplicateWeek.error?.issues.some((issue) => issue.message === "Plan weeks must have unique start dates"), true);
  assert.equal(planProposalSchema.safeParse({ ...proposal, timezone: "Invalid/Timezone" }).success, false);
});

test("shared endpoint schemas cover profile, routine, calendar, Today, and reminder payloads", () => {
  const profileRequest = {
    displayName: profile.displayName,
    timezone: profile.timezone,
    units: profile.units,
    why: profile.why,
    experience: profile.experience,
    constraints: profile.constraints,
  };
  const routineRequest = {
    timezone: routine.timezone,
    desiredSessionsPerWeek: routine.desiredSessionsPerWeek,
    preferredLongRunDay: routine.preferredLongRunDay,
    days: routine.days,
  };
  assert.equal(coachingProfileUpdateRequestSchema.safeParse(profileRequest).success, true);
  assert.equal(weeklyRoutineUpdateRequestSchema.safeParse(routineRequest).success, true);
  assert.equal(coachingProfileApiResponseSchema.safeParse({ data: { profile } }).success, true);
  assert.equal(weeklyRoutineApiResponseSchema.safeParse({ data: { routine } }).success, true);

  const workout = makeProposal().workouts[0];
  const session = {
    ...workout,
    scheduledDate: workout.scheduledDate,
    prescribedDate: workout.scheduledDate,
    effectiveDate: workout.scheduledDate,
    originalDate: workout.scheduledDate,
    status: "upcoming" as const,
    revision: 1,
    warnings: [],
  };
  assert.equal(calendarQueryRequestSchema.safeParse({ from: "2026-08-03", to: "2026-08-09" }).success, true);
  assert.equal(calendarEditHttpRequestSchema.safeParse({ operation: "reschedule", expectedRevision: 1, date: "2026-08-05" }).success, true);
  assert.equal(calendarApiResponseSchema.safeParse({ data: { from: "2026-08-03", to: "2026-08-09", sessions: [session] } }).success, true);
  assert.equal(calendarEditApiResponseSchema.safeParse({ data: { session, operation: "reschedule" } }).success, true);

  const today = {
    athleteId: profile.athleteId,
    date: workout.scheduledDate,
    sessionId: session.id,
    message: "The approved easy run supports the current goal.",
    source: "fallback" as const,
    generatedAt: now,
    idempotencyKey: `daily-brief:${profile.athleteId}:${workout.scheduledDate}:${session.id}`,
    timezone: profile.timezone,
    state: "upcoming" as const,
    status: "upcoming" as const,
    goal: { id: proposedGoal.id, title: proposedGoal.title, why: proposedGoal.why, targetDate: "2026-11-01", countdown: { days: 88, label: "88 days to target" } },
    plan: { id: "plan-1", version: 1, startsOn: "2026-08-03", endsOn: "2026-08-09" },
    planVersion: 1,
    session,
    localCue: "Start controlled and keep the session aligned with its approved purpose.",
    scheduleWarnings: [],
    stale: { isStale: false, reason: null },
    links: { plan: "/dashboard/plan", calendar: "/dashboard/calendar", session: `/dashboard/calendar#session-${session.id}` },
  };
  assert.equal(todayQueryRequestSchema.safeParse({ date: workout.scheduledDate }).success, true);
  assert.equal(todayApiResponseSchema.safeParse({ data: today }).success, true);

  const reminderPreferences = {
    enabled: true,
    timezone: profile.timezone,
    localTime: "06:30",
    days: [...days],
    channel: "codex_task" as const,
    motivationalContext: true,
    updatedAt: now,
  };
  assert.equal(reminderPreferencesUpdateRequestSchema.safeParse({ timezone: profile.timezone, localTime: "06:30" }).success, true);
  assert.equal(reminderPreferencesApiResponseSchema.safeParse({ data: {
    ...reminderPreferences,
    preferences: reminderPreferences,
    externalStatus: "prepared",
    externalReference: "Coach Exchange/Generated/handoff.md",
  } }).success, true);
  assert.equal(reminderHandoffRequestSchema.safeParse({ enabled: true, timezone: profile.timezone, localTime: "06:30" }).success, true);
  assert.equal(reminderHandoffApiResponseSchema.safeParse({ data: {
    path: "Coach Exchange/Generated/handoff.md",
    content: "Current app-owned context and boundaries",
    handoff: "Current app-owned context and boundaries",
    instructions: "Current app-owned context and boundaries",
    externalStatus: "prepared",
    externalReference: "Coach Exchange/Generated/handoff.md",
    scheduled: false,
  } }).success, true);
  assert.equal(reminderExternalStatusRequestSchema.safeParse({ externalStatus: "scheduled", externalReference: "codex-task-1" }).success, true);
  assert.equal(reminderExternalStatusApiResponseSchema.safeParse({ data: {
    preferences: reminderPreferences,
    externalStatus: "scheduled",
    externalReference: "codex-task-1",
  } }).success, true);
});

test("routine placement is deterministic and rejects occupied calendars", () => {
  const request = {
    id: "run-1", kind: "run" as const, title: "Easy run", purpose: "Build aerobic consistency",
    prescription: "Run easily for 45 minutes at conversational effort.", cautions: [], durationMinutes: 45,
  };
  const first = placeSessionsOnRoutine({ weekStartsOn: "2026-08-03", routine, sessions: [request] });
  const second = placeSessionsOnRoutine({ weekStartsOn: "2026-08-03", routine, sessions: [request] });
  assert.deepEqual(first, second);
  assert.equal(first[0].scheduledDate, "2026-08-03");
  assert.throws(() => placeSessionsOnRoutine({
    weekStartsOn: "2026-08-03", routine, sessions: [request],
    occupiedDates: ["2026-08-03", "2026-08-05", "2026-08-08"],
  }), /No conflict-free/);
});

test("activation approval can atomically settle a draft goal and requires matching current revisions", () => {
  const proposal = makeProposal();
  const { settledAt: _settledAt, settledBy: _settledBy, ...goalFields } = settledGoal;
  assert.doesNotThrow(() => assertPlanCanActivate({ proposal, goal: { ...goalFields, status: "draft" }, approvedByUser: true, expectedProposalRevision: 4 }));
  assert.throws(() => assertPlanCanActivate({ proposal, goal: settledGoal, approvedByUser: false, expectedProposalRevision: 4 }), /approval/);
  assert.throws(() => assertPlanCanActivate({ proposal, goal: settledGoal, approvedByUser: true, expectedProposalRevision: 3 }), /revision conflict/);
  assert.doesNotThrow(() => assertPlanCanActivate({ proposal, goal: settledGoal, approvedByUser: true, expectedProposalRevision: 4 }));
});

test("shared context and coaching route schemas validate complete runtime envelopes", () => {
  const activity = {
    id: "activity-1",
    athleteId: "athlete-1",
    title: "Complete history run",
    occurredAt: "2026-08-01T04:00:00.000Z",
    localOccurredAt: "2026-08-01T06:00:00",
    sport: "run" as const,
    distanceM: 8000,
    elapsedTimeS: 2880,
    avgPaceSecPerKm: 360,
    elevationGainM: 40,
    hrAvailable: false,
    cadenceAvailable: false,
  };
  const artifact = {
    id: "context-1",
    athleteId: "athlete-1",
    schemaVersion: 1,
    capturedAt: now,
    activityCount: 1,
    earliestActivityDate: "2026-08-01",
    latestActivityDate: "2026-08-01",
    sources: ["csv", "second_brain"] as const,
    historyFingerprint: "a".repeat(64),
    contentHash: "b".repeat(64),
    digest: "b".repeat(64),
    activePlan: null,
    noteReferences: [],
    warnings: [],
  };
  const context = coachingContextEnvelopeSchema.parse({
    schema: "coaching-context.v1",
    artifact,
    profile,
    routine,
    planningGoal: proposedGoal,
    settledGoal: null,
    activePlan: null,
    historyCoverage: {
      athleteId: "athlete-1",
      activityCount: 1,
      earliestOccurredAt: activity.occurredAt,
      latestOccurredAt: activity.occurredAt,
      totalDistanceM: activity.distanceM,
      sourceTypes: ["csv"],
    },
    activities: [activity],
  });
  assert.equal(coachingContextEnvelopeSchema.safeParse({
    ...context,
    historyCoverage: { ...context.historyCoverage, activityCount: 2 },
  }).success, false);

  const proposal = makeProposal();
  const publication = {
    artifact,
    fingerprint: artifact.historyFingerprint,
    contentHash: artifact.contentHash,
    jsonPath: "Coach Exchange/Generated/coaching-context.v1.json",
    markdownPath: "Coach Exchange/Generated/coaching-context.v1.md",
    snapshotId: "snapshot-1",
    artifactId: artifact.id,
    profile,
    routine,
    goal: proposedGoal,
  };
  assert.equal(contextPublishApiResponseSchema.safeParse({ data: publication }).success, true);
  assert.equal(proposalImportApiResponseSchema.safeParse({ data: { proposal } }).success, true);
  assert.equal(currentContextApiResponseSchema.safeParse({ data: { context } }).success, true);
  assert.equal(latestProposalApiResponseSchema.safeParse({ data: { proposal: null } }).success, true);
});

test("daily fallback is tied to why/session and has a stable idempotency key", () => {
  const session = placeSessionsOnRoutine({
    weekStartsOn: "2026-08-03", routine,
    sessions: [{
      id: "run-1", kind: "run", title: "Easy run", purpose: "Build aerobic consistency",
      prescription: "Run easily for 45 minutes.", cautions: [], durationMinutes: 45,
    }],
  })[0];
  const brief = buildDailyBrief({ profile, date: session.scheduledDate, session, generatedAt: now });
  const repeated = buildDailyBrief({ profile, date: session.scheduledDate, session, generatedAt: now });
  assert.equal(brief.source, "fallback");
  assert.match(brief.message, /Easy run/);
  assert.match(brief.message, /consistent synthetic training plan/);
  assert.equal(brief.idempotencyKey, repeated.idempotencyKey);
});

test("calendar edit contract requires operation-specific fields and optimistic revision", () => {
  const base = {
    planId: "plan-1",
    sessionId: "run-1",
    expectedRevision: 2,
    requestedAt: now,
  };
  assert.equal(calendarEditRequestSchema.safeParse({ ...base, operation: "reschedule", effectiveDate: "2026-08-06" }).success, true);
  assert.equal(calendarEditRequestSchema.safeParse({ ...base, operation: "skip" }).success, true);
  assert.equal(calendarEditRequestSchema.safeParse({ ...base, operation: "restore" }).success, true);
  assert.equal(calendarEditRequestSchema.safeParse({ ...base, operation: "reschedule" }).success, false);
  assert.equal(calendarEditRequestSchema.safeParse({ ...base, operation: "skip", effectiveDate: "2026-08-06" }).success, false);
  assert.equal(calendarEditRequestSchema.safeParse({ ...base, operation: "restore", expectedRevision: 0 }).success, false);
});

test("standard coaching envelopes match the runtime HTTP data and error shapes", () => {
  const successSchema = standardSuccessResponseSchema(planProposalSchema);
  const workouts = placeSessionsOnRoutine({
    weekStartsOn: "2026-08-03",
    routine,
    sessions: [{
      id: "envelope-run", kind: "run", title: "Envelope run", purpose: "Exercise the response contract",
      prescription: "Run easily for 30 minutes.", cautions: [], durationMinutes: 30,
    }],
  });
  const proposal = planProposalSchema.parse({
    id: "envelope-plan", athleteId: "athlete-1", goalId: settledGoal.id, goalRevision: settledGoal.revision,
    routineRevision: routine.revision, version: 1, revision: 1, startsOn: "2026-08-03", endsOn: "2026-08-09",
    timezone: routine.timezone,
    weeklyStructure: [{ weekStartsOn: "2026-08-03", focus: "Response contract", sessionIds: ["envelope-run"] }],
    workouts, contextArtifactId: "context-envelope", createdAt: now, status: "proposed", rationale: "Contract fixture",
    proposedGoal, goalRationale: "Contract fixture goal rationale",
    summary: "Contract fixture", assumptions: [], cautions: [],
    sourceHistoryFingerprint: "a".repeat(64), contentHash: "b".repeat(64),
  });
  assert.equal(successSchema.safeParse({ data: proposal }).success, true);
  assert.equal(successSchema.safeParse({ ok: true, data: proposal }).success, false);
  assert.equal(standardErrorResponseSchema.safeParse({
    error: { code: "REVISION_CONFLICT", message: "Proposal changed", details: [{ currentRevision: 2 }] },
  }).success, true);
  assert.equal(standardErrorResponseSchema.safeParse({
    ok: false, error: { code: "REVISION_CONFLICT", message: "Proposal changed", path: ["revision"] },
  }).success, false);
});
