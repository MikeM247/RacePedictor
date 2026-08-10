import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
      endsOn: "2026-08-09",
      timezone: "Africa/Johannesburg",
      weeklyStructure: [{ weekStartsOn: "2026-08-03", focus: "Easy consistency", sessionIds: ["today_easy_run"] }],
      workouts: [{
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

    const refreshedContext = await service.publishCoachingContext();
    assert.equal(refreshedContext.fingerprint, sourceContext.fingerprint);
    assert.notEqual(refreshedContext.artifact.id, sourceContext.artifact.id);
    assert.equal(refreshedContext.artifact.activePlan?.id, active.id);
    const today = service.buildTodayOverview({ date: "2026-08-06" });
    assert.equal(today.state, "upcoming");
    assert.deepEqual(today.stale, { isStale: false, reason: null });
    assert.equal(today.session?.id, "today_easy_run");
  } finally {
    service.close();
  }
});
