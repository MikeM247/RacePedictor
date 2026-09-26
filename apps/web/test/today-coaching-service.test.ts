import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// @ts-expect-error Runtime uses Node 22 SQLite; the project retains Node 20 type declarations.
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
// @ts-expect-error Existing local importer is JavaScript without a declaration file.
import { importGarminCsv } from "../../../packages/db/src/local-garmin-pipeline.js";
import {
  calculatePlanProposalContentHash,
  LocalCoachingServiceError,
  createLocalCoachingService,
} from "../lib/local-coaching-service.ts";

test("Today uses configured IANA timezone boundaries and a truthful no-plan state", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-today-timezone-"));
  const instant = new Date("2026-08-05T22:30:00.000Z");
  const service = createLocalCoachingService({
    databasePath: path.join(directory, "state", "racepredictor.sqlite"),
    exchangePath: path.join(directory, "Coach Exchange"),
    clock: () => instant,
  });

  try {
    const defaultToday = service.buildTodayOverview();
    assert.equal(defaultToday.state, "no-plan");
    assert.equal(defaultToday.timezone, "Africa/Johannesburg");
    assert.equal(defaultToday.date, "2026-08-06");
    assert.equal(defaultToday.plan, null);

    const configured = service.saveReminderPreferences({
      timezone: "America/Los_Angeles",
      localTime: "07:15",
    });
    assert.equal(configured.preferences.localTime, "07:15");
    const westCoastToday = service.buildTodayOverview();
    assert.equal(westCoastToday.timezone, "America/Los_Angeles");
    assert.equal(westCoastToday.date, "2026-08-05");

    assert.throws(
      () => service.saveReminderPreferences({ timezone: "UTC+2" }),
      (error) => error instanceof LocalCoachingServiceError && error.code === "INVALID_TIMEZONE",
    );

    const handoff = await service.generateCodexReminderHandoff();
    const content = await readFile(handoff.path, "utf8");
    assert.match(content, /Context artifact: Coach Exchange\/Generated\/coaching-context\.v1\.json/);
    assert.match(content, /Approved plan: none/);
    assert.match(content, /Do not add, move, skip, replace/);
    assert.match(content, /Do not provide medical diagnosis or medical authority/);
    assert.match(content, /Do not review a completed run or claim automatic adaptation/);
    assert.equal(handoff.scheduled, false);
  } finally {
    service.close();
  }
});

test("republishing context after activation keeps Today fresh when history is unchanged", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-today-context-refresh-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const exchangePath = path.join(directory, "Coach Exchange");
  const vaultPath = path.join(directory, "vault");
  const instant = new Date("2026-08-06T04:00:00.000Z");
  await mkdir(exchangePath, { recursive: true });
  const sourcePath = path.join(directory, "Activities.csv");
  await writeFile(sourcePath, [
    "Activity Type,Date,Title,Distance,Elapsed Time,Avg Pace,Total Ascent,Total Descent",
    "Running,2026-08-01 06:00:00,Synthetic history run,5.00,00:30:00,6:00,20,15",
  ].join("\n"), "utf8");
  await importGarminCsv({ sourcePath, vaultPath, databasePath });
  const service = createLocalCoachingService({ databasePath, exchangePath, vaultPath, clock: () => instant });

  try {
    const profile = service.saveProfile({
      displayName: "Synthetic Athlete",
      timezone: "Africa/Johannesburg",
      units: "metric",
      why: "Follow the synthetic plan consistently.",
      experience: "intermediate",
      constraints: [],
    });
    const routine = service.saveRoutine({
      timezone: "Africa/Johannesburg",
      desiredSessionsPerWeek: 1,
      preferredLongRunDay: "thursday",
      days: [
        { day: "monday", available: false },
        { day: "tuesday", available: false },
        { day: "wednesday", available: false },
        { day: "thursday", available: true, startTime: "06:00", endTime: "07:30", maxDurationMinutes: 90, allowedKinds: ["run"] },
        { day: "friday", available: false },
        { day: "saturday", available: false },
        { day: "sunday", available: false },
      ],
    });
    const goal = service.settleGoal(service.createGoal({
      title: "Synthetic 10 km",
      why: profile.why,
      target: { kind: "performance", distanceMeters: 10_000, targetDate: "2026-09-06" },
    }).id);
    const sourceContext = await service.publishCoachingContext();
    const proposalBody = {
      id: "today_refresh_proposal",
      athleteId: service.athleteId,
      goalId: goal.id,
      goalRevision: goal.revision,
      routineRevision: routine.revision,
      proposedGoal: {
        id: goal.id,
        athleteId: goal.athleteId,
        revision: goal.revision,
        title: goal.title,
        why: goal.why,
        target: goal.target,
        status: "draft",
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt,
      },
      goalRationale: "The 10 km target reflects the athlete's stated objective.",
      version: 1,
      revision: 1,
      startsOn: "2026-08-03",
      endsOn: "2026-08-16",
      timezone: "Africa/Johannesburg",
      weeklyStructure: [
        { weekStartsOn: "2026-08-03", focus: "Easy consistency", sessionIds: ["yesterday_rest", "today_easy_run", "skipped_future", "amended_future"] },
        { weekStartsOn: "2026-08-10", focus: "Adjusted consistency", sessionIds: ["moved_future"] },
      ],
      workouts: [{
        id: "yesterday_rest",
        kind: "rest",
        scheduledDate: "2026-08-05",
        title: "Rest / gentle mobility",
        purpose: "Recover between sessions.",
        prescription: "Rest.",
        cautions: [],
        durationMinutes: 0,
      }, {
        id: "today_easy_run",
        kind: "run",
        scheduledDate: "2026-08-06",
        startTime: "06:00",
        title: "Easy consistency run",
        purpose: "Build a repeatable aerobic rhythm.",
        prescription: "Run easily for 40 minutes at conversational effort.",
        cautions: [],
        durationMinutes: 40,
        intensityRpe: 3,
      }, {
        id: "skipped_future",
        kind: "run",
        scheduledDate: "2026-08-07",
        title: "Session to skip",
        purpose: "Keep the easy rhythm.",
        prescription: "Run easily for 30 minutes.",
        cautions: [],
        durationMinutes: 30,
      }, {
        id: "moved_future",
        kind: "run",
        scheduledDate: "2026-08-10",
        title: "Moved session",
        purpose: "Keep the easy rhythm.",
        prescription: "Run easily for 30 minutes.",
        cautions: [],
        durationMinutes: 30,
      }, {
        id: "amended_future",
        kind: "run",
        scheduledDate: "2026-08-08",
        title: "Planned next session",
        purpose: "Keep the easy rhythm.",
        prescription: "Run easily for 35 minutes.",
        cautions: [],
        durationMinutes: 35,
      }],
      contextArtifactId: sourceContext.artifact.id,
      createdAt: instant.toISOString(),
      status: "proposed",
      rationale: "Use current complete history and the settled routine.",
      summary: "One easy run starts a sustainable week.",
      assumptions: ["The athlete is healthy enough for easy running."],
      cautions: [],
      sourceHistoryFingerprint: sourceContext.fingerprint,
      contentHash: "0".repeat(64),
    };
    proposalBody.contentHash = calculatePlanProposalContentHash(proposalBody);
    const proposalPath = path.join(exchangePath, "coaching-plan-proposal.v1.json");
    await writeFile(proposalPath, JSON.stringify({ schema: "coaching-plan-proposal.v1", proposal: proposalBody }), "utf8");
    const proposal = await service.importPlanProposal(proposalPath);
    const active = service.activatePlan({ planId: proposal.id, expectedRevision: proposal.revision, approvedByUser: true });

    const editRequestedAt = instant.toISOString();
    const skipRevision = service.listActiveCalendar().find((session) => session.id === "skipped_future")!.revision;
    service.editCalendar({
      planId: active.id,
      sessionId: "skipped_future",
      operation: "skip",
      expectedRevision: skipRevision,
      reason: "Synthetic verification skip",
      requestedAt: editRequestedAt,
    });
    const moveRevision = service.listActiveCalendar().find((session) => session.id === "moved_future")!.revision;
    service.editCalendar({
      planId: active.id,
      sessionId: "moved_future",
      operation: "reschedule",
      expectedRevision: moveRevision,
      reason: "Synthetic verification move",
      effectiveDate: "2026-08-11",
      requestedAt: editRequestedAt,
    });
    const amendRevision = service.listActiveCalendar().find((session) => session.id === "amended_future")!.revision;
    service.editCalendar({
      planId: active.id,
      sessionId: "amended_future",
      operation: "amend",
      expectedRevision: amendRevision,
      reason: "Synthetic verification amendment",
      changes: { title: "Amended next session", prescription: "Run easily for 25 minutes." },
      requestedAt: editRequestedAt,
    });
    service.saveReminderPreferences({ timezone: "America/Los_Angeles", localTime: "07:15" });

    const refreshedContext = await service.publishCoachingContext();
    assert.equal(refreshedContext.fingerprint, sourceContext.fingerprint);
    assert.notEqual(refreshedContext.artifact.id, sourceContext.artifact.id);
    assert.equal(refreshedContext.artifact.activePlan?.id, active.id);
    const today = service.buildTodayOverview({ date: "2026-08-06" });
    assert.equal(today.state, "upcoming");
    assert.deepEqual(today.stale, { isStale: false, reason: null });
    assert.equal(today.session?.id, "today_easy_run");
    assert.equal(today.todayScheduleKind, "prescribed_session");
    assert.equal(today.nextWorkout?.id, "amended_future", "next work uses the amended effective session and ignores skipped and moved entries");
    assert.equal(today.nextWorkout?.title, "Amended next session");
    assert.equal(today.nextWorkout?.prescription, "Run easily for 25 minutes.");
    const automaticToday = service.buildTodayOverview();
    assert.equal(automaticToday.date, "2026-08-06", "the active plan timezone wins over a different reminder timezone");
    assert.equal(automaticToday.timezone, "Africa/Johannesburg");
    assert.deepEqual(today.scheduleWarnings, [], "a past rest day is not a missed workout");
    const restDay = service.buildTodayOverview({ date: "2026-08-05" });
    assert.equal(restDay.state, "rest");
    assert.equal(restDay.todayScheduleKind, "prescribed_rest");
    assert.equal(restDay.nextWorkout?.id, "today_easy_run");
    const skippedDay = service.buildTodayOverview({ date: "2026-08-07" });
    assert.equal(skippedDay.state, "skipped");
    assert.equal(skippedDay.todayScheduleKind, "prescribed_session");
    assert.equal(skippedDay.session?.id, "skipped_future");
    assert.equal(skippedDay.nextWorkout?.id, "amended_future");
    const amendedDay = service.buildTodayOverview({ date: "2026-08-08" });
    assert.equal(amendedDay.session?.title, "Amended next session");
    assert.equal(amendedDay.nextWorkout?.id, "moved_future");
    assert.equal(amendedDay.nextWorkout?.scheduledDate, "2026-08-11");
    const afterPlan = service.buildTodayOverview({ date: "2026-08-17" });
    assert.equal(afterPlan.todayScheduleKind, "unscheduled");
    assert.equal(afterPlan.nextWorkout, null);

    const newRunPath = path.join(directory, "NewRun.csv");
    await writeFile(newRunPath, [
      "Activity Type,Date,Title,Distance,Elapsed Time,Avg Pace,Total Ascent,Total Descent",
      "Running,2026-08-07 06:00:00,New training after approval,6.00,00:36:00,6:00,20,15",
    ].join("\n"), "utf8");
    await importGarminCsv({ sourcePath: newRunPath, vaultPath, databasePath });
    const db = new DatabaseSync(databasePath);
    try {
      // A newly connected provider must not change the approved-period coverage either.
      db.prepare("UPDATE activities SET source_type = 'strava' WHERE title = ?").run("New training after approval");
      assert.equal(service.buildTodayOverview().stale.isStale, false, "new training is expected, not stale history");
      const fullContext = await service.publishCoachingContext();
      assert.notEqual(fullContext.fingerprint, sourceContext.fingerprint, "planning context still includes every new activity");
      assert.equal(service.buildTodayOverview().stale.isStale, false, "republishing cannot invalidate the approved baseline");

      db.prepare("UPDATE activities SET title = 'Corrected source run' WHERE title = 'Synthetic history run'").run();
      assert.equal(service.buildTodayOverview().stale.isStale, true, "corrections to the approved history require review");
      db.prepare("UPDATE activities SET title = 'Synthetic history run' WHERE title = 'Corrected source run'").run();
      assert.equal(service.buildTodayOverview().stale.isStale, false);

      const lateRunPath = path.join(directory, "LateHistory.csv");
      await writeFile(lateRunPath, [
        "Activity Type,Date,Title,Distance,Elapsed Time,Avg Pace,Total Ascent,Total Descent",
        "Running,2026-08-02 06:00:00,Late historical import,4.00,00:24:00,6:00,10,10",
      ].join("\n"), "utf8");
      await importGarminCsv({ sourcePath: lateRunPath, vaultPath, databasePath });
      assert.equal(service.buildTodayOverview().stale.isStale, true, "late imports from before approval still require review");
      db.prepare("DELETE FROM activities WHERE title = 'Late historical import'").run();
      assert.equal(service.buildTodayOverview().stale.isStale, false);

      db.prepare("DELETE FROM activities WHERE title = 'Synthetic history run'").run();
      assert.equal(service.buildTodayOverview().stale.isStale, true, "deletion of approved history requires review");
      const reloadedPlan = service.getActivePlan();
      assert.equal(reloadedPlan?.approval.contentHash, active.approval.contentHash, "freshness checks and calendar amendments do not alter the approval hash");
      assert.equal(reloadedPlan?.workouts.find((workout) => workout.id === "amended_future")?.scheduledDate, "2026-08-08", "an amendment retains the approved source date");
    } finally {
      db.close();
    }
  } finally {
    service.close();
  }
});
