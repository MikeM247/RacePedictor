import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_DATABASE_SCHEMA_VERSION, openLocalDatabase } from "../src/local-database.js";
import {
  CoachingRepositoryError,
  createLocalCoachingRepository,
} from "../src/local-coaching-repository.js";

const makeDatabasePath = async (name) => {
  const directory = await mkdtemp(path.join(tmpdir(), `racepredictor-${name}-`));
  return path.join(directory, "state", "racepredictor.sqlite");
};

const routine = {
  sessionsPerWeek: 4,
  longRunDay: 0,
  timezone: "Africa/Johannesburg",
  preferences: { includeStrength: true },
  days: [
    { dayOfWeek: 0, available: true, maxDurationMinutes: 120, preferredTime: "06:30" },
    { dayOfWeek: 2, available: true, maxDurationMinutes: 60, preferredTime: "06:00" },
    { dayOfWeek: 4, available: true, maxDurationMinutes: 60, preferredTime: "06:00" },
    { dayOfWeek: 6, available: true, maxDurationMinutes: 45, preferredTime: "07:00" },
  ],
};

const planInput = (goalId, title = "Half marathon plan") => ({
  goalId,
  title,
  startDate: "2026-08-10",
  endDate: "2026-09-06",
  summary: { phase: "base" },
  workouts: [
    {
      localDate: "2026-08-10",
      title: "Easy run",
      workoutType: "easy",
      durationMinutes: 45,
      distanceM: 7000,
      intensity: "RPE 3",
      details: { purpose: "Aerobic consistency" },
    },
    {
      localDate: "2026-08-16",
      title: "Long run",
      workoutType: "long",
      durationMinutes: 100,
      distanceM: 15000,
      intensity: "RPE 3-4",
    },
  ],
});

const createSettledGoalAndPlan = (repository) => {
  const goal = repository.settleGoal(repository.createGoal({
    goalType: "race",
    title: "Finish a half marathon strongly",
    targetDate: "2026-09-06",
    details: { targetDistanceM: 21097.5 },
  }).id);
  const proposal = repository.saveValidatedPlan(planInput(goal.id));
  return { goal, plan: repository.activatePlan(proposal.id) };
};

test("local migrations are idempotent and preserve pre-existing data", async () => {
  const databasePath = await makeDatabasePath("coaching-migration");
  await mkdir(path.dirname(databasePath), { recursive: true });
  const bootstrap = new DatabaseSync(databasePath);
  bootstrap.exec(`
    CREATE TABLE legacy_marker (value TEXT NOT NULL);
    INSERT INTO legacy_marker (value) VALUES ('preserve-me');
  `);
  bootstrap.close();

  const first = openLocalDatabase({ databasePath });
  first.close();
  const second = openLocalDatabase({ databasePath });
  second.close();

  const verify = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(
    verify.prepare("SELECT COUNT(*) AS count FROM local_schema_migrations").get().count,
    LOCAL_DATABASE_SCHEMA_VERSION,
  );
  assert.equal(verify.prepare("SELECT value FROM legacy_marker").get().value, "preserve-me");
  assert.equal(
    verify.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'coaching_%'")
      .get().count > 0,
    true,
  );
  verify.close();
});

test("profile, routine, settled goal, active plan, reminder, and brief survive restart", async () => {
  const databasePath = await makeDatabasePath("coaching-restart");
  let repository = createLocalCoachingRepository({ databasePath });
  repository.saveProfile({
    displayName: "Test Athlete",
    motivation: "Complete the synthetic training plan consistently",
    constraints: { injury: null },
    preferences: { coachingTone: "calm" },
  });
  repository.saveRoutine(routine);
  const { goal, plan } = createSettledGoalAndPlan(repository);
  repository.saveReminderPreferences({
    enabled: true,
    localTime: "06:30",
    externalStatus: "prepared",
  });
  repository.storeDailyBrief({
    localDate: "2026-08-10",
    planId: plan.id,
    workoutId: plan.workouts[0].id,
    message: "Keep today easy; it builds the consistency your goal needs.",
    payload: { goalId: goal.id },
  });
  repository.close();

  repository = createLocalCoachingRepository({ databasePath });
  assert.equal(repository.loadProfile().motivation, "Complete the synthetic training plan consistently");
  assert.equal(repository.loadRoutine().days.length, 4);
  assert.equal(repository.loadSettledGoal().id, goal.id);
  assert.equal(repository.loadActivePlan().id, plan.id);
  assert.equal(repository.getDailyBrief("2026-08-10").workoutId, plan.workouts[0].id);
  assert.equal(repository.loadReminderPreferences().localTime, "06:30");
  repository.close();
});

test("settling goals and activating plans transactionally supersede prior primary versions", async () => {
  const databasePath = await makeDatabasePath("coaching-lifecycle");
  const repository = createLocalCoachingRepository({ databasePath });
  const first = createSettledGoalAndPlan(repository);

  const secondDraft = repository.createGoal({
    goalType: "race",
    title: "Revised half marathon goal",
    targetDate: "2026-09-06",
  });
  const secondProposal = repository.saveValidatedPlan(planInput(secondDraft.id, "Revised draft plan"));
  assert.equal(repository.loadSettledGoal().id, first.goal.id, "saving a draft proposal does not replace the approved goal");
  assert.equal(repository.loadActivePlan().id, first.plan.id, "saving a draft proposal does not replace the active plan");
  const secondPlan = repository.activatePlan(secondProposal.id);
  const secondGoal = repository.loadSettledGoal();

  assert.equal(repository.loadSettledGoal().id, secondGoal.id);
  assert.equal(repository.loadActivePlan().id, secondPlan.id);
  assert.equal(repository.listGoals().find((goal) => goal.id === first.goal.id).lifecycle, "superseded");
  assert.equal(repository.loadPlan(first.plan.id).lifecycle, "superseded");

  const verify = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(verify.prepare(`
    SELECT COUNT(*) AS count FROM coaching_goals
    WHERE athlete_id = 'athlete_001' AND lifecycle = 'settled' AND is_primary = 1
  `).get().count, 1);
  assert.equal(verify.prepare(`
    SELECT COUNT(*) AS count FROM coaching_plans
    WHERE athlete_id = 'athlete_001' AND lifecycle = 'active'
  `).get().count, 1);
  verify.close();
  repository.close();
});

test("calendar adjustments preserve prescriptions, persist effective state, and enforce revisions", async () => {
  const databasePath = await makeDatabasePath("coaching-revision");
  let repository = createLocalCoachingRepository({ databasePath });
  const { plan } = createSettledGoalAndPlan(repository);
  const workout = plan.workouts[0];

  const moved = repository.adjustWorkout({
    workoutId: workout.id,
    operation: "reschedule",
    toDate: "2026-08-11",
    expectedRevision: 1,
    actor: "user",
    reason: "Work conflict",
    requestedAt: "2026-08-09T06:00:00.000Z",
  });
  assert.equal(moved.localDate, "2026-08-11");
  assert.equal(moved.prescribedLocalDate, "2026-08-10");
  assert.equal(moved.effectiveLocalDate, "2026-08-11");
  assert.equal(moved.calendarStatus, "upcoming");
  assert.equal(moved.revision, 2);
  assert.throws(
    () => repository.adjustWorkout({
      workoutId: workout.id,
      operation: "reschedule",
      toDate: "2026-08-12",
      expectedRevision: 1,
    }),
    (error) => error instanceof CoachingRepositoryError
      && error.code === "REVISION_CONFLICT"
      && error.details.currentRevision === 2,
  );

  const skipped = repository.adjustWorkout({ workoutId: workout.id, operation: "skip", expectedRevision: 2 });
  assert.equal(skipped.calendarStatus, "skipped");
  assert.equal(skipped.effectiveLocalDate, "2026-08-11");
  assert.equal(skipped.revision, 3);
  repository.close();

  repository = createLocalCoachingRepository({ databasePath });
  const persisted = repository.loadPlan(plan.id).workouts.find((candidate) => candidate.id === workout.id);
  assert.equal(persisted.prescribedLocalDate, "2026-08-10");
  assert.equal(persisted.effectiveLocalDate, "2026-08-11");
  assert.equal(persisted.calendarStatus, "skipped");
  assert.equal(persisted.revision, 3);
  assert.throws(
    () => repository.adjustWorkout({ workoutId: workout.id, operation: "restore", expectedRevision: 2 }),
    (error) => error instanceof CoachingRepositoryError
      && error.code === "REVISION_CONFLICT"
      && error.details.currentRevision === 3,
  );
  const restored = repository.adjustWorkout({ workoutId: workout.id, operation: "restore", expectedRevision: 3 });
  assert.equal(restored.calendarStatus, "upcoming");
  assert.equal(restored.prescribedLocalDate, "2026-08-10");
  assert.equal(restored.effectiveLocalDate, "2026-08-11");
  assert.equal(restored.revision, 4);

  const verify = new DatabaseSync(databasePath, { readOnly: true });
  const storedPrescription = verify.prepare(`
    SELECT local_date AS localDate, revision FROM coaching_planned_workouts WHERE id = ?
  `).get(workout.id);
  assert.equal(storedPrescription.localDate, "2026-08-10");
  assert.equal(storedPrescription.revision, 1);
  verify.close();

  const adjustmentEvents = repository.listPlanAuditEvents({ planId: plan.id })
    .filter((event) => event.eventType === "calendar_adjusted");
  assert.deepEqual(
    adjustmentEvents.map((event) => event.event.operation),
    ["reschedule", "skip", "restore"],
  );
  assert.equal(adjustmentEvents[0].event.actor, "user");
  assert.equal(adjustmentEvents[0].event.reason, "Work conflict");
  assert.deepEqual(adjustmentEvents[0].event.prior, {
    effectiveDate: "2026-08-10", status: "upcoming", revision: 1,
  });
  assert.deepEqual(adjustmentEvents[0].event.result, {
    effectiveDate: "2026-08-11", status: "upcoming", revision: 2,
  });
  repository.close();
});

test("daily briefs are idempotent and history coverage includes the oldest normalized activity", async () => {
  const databasePath = await makeDatabasePath("coaching-coverage");
  const database = openLocalDatabase({ databasePath });
  database.exec(`
    CREATE TABLE activities (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      distance_m REAL NOT NULL
    );
    INSERT INTO activities VALUES
      ('old-run', 'athlete_001', 'gpx', '2001-01-01T05:00:00.000Z', 5000),
      ('recent-run', 'athlete_001', 'csv', '2026-08-03T05:00:00.000Z', 21097.5),
      ('other-athlete', 'athlete_002', 'csv', '2026-08-04T05:00:00.000Z', 10000);
  `);
  database.close();

  const repository = createLocalCoachingRepository({ databasePath });
  const coverage = repository.getHistoryCoverage();
  assert.equal(coverage.activityCount, 2);
  assert.equal(coverage.earliestOccurredAt, "2001-01-01T05:00:00.000Z");
  assert.equal(coverage.latestOccurredAt, "2026-08-03T05:00:00.000Z");
  assert.equal(coverage.totalDistanceM, 26097.5);
  assert.deepEqual(coverage.sourceTypes, ["csv", "gpx"]);

  const snapshot = repository.saveContextSnapshot({ metadata: { secondBrainRevision: "abc123" } });
  assert.equal(snapshot.historyCoverage.earliestOccurredAt, "2001-01-01T05:00:00.000Z");
  assert.equal(repository.saveContextSnapshot({ metadata: { secondBrainRevision: "abc123" } }).id, snapshot.id);

  const first = repository.storeDailyBrief({
    localDate: "2026-08-12",
    message: "First message",
  });
  const second = repository.storeDailyBrief({
    localDate: "2026-08-12",
    message: "Updated message",
  });
  assert.equal(second.id, first.id);
  assert.equal(repository.getDailyBrief("2026-08-12").message, "Updated message");

  const verify = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(verify.prepare(`
    SELECT COUNT(*) AS count FROM coaching_daily_briefs
    WHERE athlete_id = 'athlete_001' AND local_date = '2026-08-12'
  `).get().count, 1);
  assert.equal(verify.prepare(`
    SELECT COUNT(*) AS count FROM coaching_context_snapshots
    WHERE athlete_id = 'athlete_001'
  `).get().count, 1);
  verify.close();
  repository.close();
});

test("equivalent proposals reuse one durable record and withdrawal survives restart", async () => {
  const databasePath = await makeDatabasePath("coaching-proposal-idempotency");
  let repository = createLocalCoachingRepository({ databasePath });
  const goal = repository.settleGoal(repository.createGoal({
    goalType: "race",
    title: "Synthetic proposal lifecycle",
    targetDate: "2026-09-06",
  }).id);
  const input = {
    ...planInput(goal.id, "Content-addressed proposal"),
    summary: {
      contentHash: "a".repeat(64),
      proposalStatus: "proposed",
      sourceProposal: { id: "proposal_artifact_1" },
      review: { historyStatus: "current" },
    },
  };
  const first = repository.saveValidatedPlan(input);
  const repeated = repository.saveValidatedPlan(input);
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.version, first.version);

  const withdrawn = repository.withdrawPlan({
    planId: first.id,
    expectedRevision: first.revision,
    reason: "User declined this draft",
  });
  assert.equal(withdrawn.summary.proposalStatus, "withdrawn");
  assert.equal(withdrawn.revision, first.revision + 1);
  assert.throws(
    () => repository.activatePlan(withdrawn.id, { expectedRevision: withdrawn.revision }),
    (error) => error instanceof CoachingRepositoryError && error.code === "INVALID_STATE",
  );
  repository.close();

  repository = createLocalCoachingRepository({ databasePath });
  const durable = repository.saveValidatedPlan(input);
  assert.equal(durable.id, withdrawn.id);
  assert.equal(durable.revision, withdrawn.revision);
  assert.equal(durable.summary.proposalStatus, "withdrawn");
  assert.equal(
    repository.listPlanAuditEvents({ planId: withdrawn.id }).some((event) => event.eventType === "plan_withdrawn"),
    true,
  );
  repository.close();
});
