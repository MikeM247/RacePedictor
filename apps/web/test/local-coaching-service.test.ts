import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
// @ts-expect-error The existing local ingestion package is JavaScript without a declaration file.
import { importGarminCsv } from "../../../packages/db/src/local-garmin-pipeline.js";
import {
  calculatePlanProposalContentHash,
  LocalCoachingServiceError,
  createLocalCoachingService,
} from "../lib/local-coaching-service.ts";

const csvHeader = "Activity Type,Date,Favorite,Title,Distance,Time,Avg HR,Max HR,Aerobic TE,Avg Run Cadence,Max Run Cadence,Avg Pace,Best Pace,Total Ascent,Total Descent,Moving Time,Elapsed Time";
const csvActivity = (date: string, title: string, distance: string) =>
  `Running,${date},false,${title},${distance},00:45:00,145,170,3.0,160,175,6:00,5:00,40,35,00:44:00,00:45:00`;

test("orchestrates the local Codex coaching exchange without implicit activation or scheduling", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-coaching-service-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const exchangePath = path.join(directory, "Second Brain", "Coach Exchange");
  const vaultPath = path.join(directory, "vault");
  const sourcePath = path.join(directory, "Activities.csv");
  await writeFile(sourcePath, [
    csvHeader,
    csvActivity("2001-01-01 06:00:00", "Oldest Run", "5.00"),
    csvActivity("2026-08-05 06:00:00", "Current Run", "8.00"),
  ].join("\n"), "utf8");
  await importGarminCsv({ sourcePath, vaultPath, databasePath });

  await mkdir(exchangePath, { recursive: true });
  await mkdir(path.join(vaultPath, "Areas", "Health & Fitness", "Running"), { recursive: true });
  await writeFile(path.join(vaultPath, "Areas", "Health & Fitness", "Running", "Running Context.md"), "Synthetic running context.\n", "utf8");
  await mkdir(path.join(vaultPath, "Templates", "Running Activity Context.md"), { recursive: true });
  const personalNotePath = path.join(exchangePath, "Synthetic coaching notes.md");
  await writeFile(personalNotePath, "Never overwrite this note.\n", "utf8");
  const fixedNow = new Date("2026-08-05T04:15:00.000Z");
  const service = createLocalCoachingService({ databasePath, exchangePath, vaultPath, clock: () => fixedNow });

  const profile = service.saveProfile({
    displayName: "Test Athlete",
    timezone: "Africa/Johannesburg",
    units: "metric",
    why: "Maintain a consistent synthetic training routine.",
    experience: "intermediate",
    constraints: ["Keep Fridays easy"],
  });
  const routine = service.saveRoutine({
    timezone: "Africa/Johannesburg",
    desiredSessionsPerWeek: 4,
    preferredLongRunDay: "sunday",
    days: [
      { day: "monday", available: true, startTime: "06:00", endTime: "07:00", maxDurationMinutes: 60, allowedKinds: ["run", "strength"] },
      { day: "tuesday", available: false },
      { day: "wednesday", available: true, startTime: "06:00", endTime: "07:00", maxDurationMinutes: 60, allowedKinds: ["run"] },
      { day: "thursday", available: false },
      { day: "friday", available: true, startTime: "06:00", endTime: "07:00", maxDurationMinutes: 60, allowedKinds: ["run", "strength"] },
      { day: "saturday", available: false },
      { day: "sunday", available: true, startTime: "06:30", endTime: "09:00", maxDurationMinutes: 150, allowedKinds: ["run"] },
    ],
  });
  const goal = service.settleGoal(service.createGoal({
    title: "Strong half marathon",
    why: profile.why,
    target: { kind: "performance", distanceMeters: 21097.5, targetDate: "2026-09-06" },
  }).id);

  const firstContext = await service.publishCoachingContext();
  const secondContext = await service.publishCoachingContext();
  assert.equal(secondContext.fingerprint, firstContext.fingerprint);
  const contextEnvelope = JSON.parse(await readFile(firstContext.jsonPath, "utf8"));
  assert.equal(contextEnvelope.schema, "coaching-context.v1");
  assert.equal(contextEnvelope.activities.length, 2);
  assert.equal(contextEnvelope.activities[0].occurredAt.slice(0, 10), "2001-01-01");
  assert.equal(contextEnvelope.artifact.historyFingerprint, firstContext.fingerprint);
  assert.equal(contextEnvelope.artifact.digest, firstContext.contentHash);
  assert.equal(contextEnvelope.artifact.activePlan, null);
  assert.equal(contextEnvelope.artifact.noteReferences.length, 3);
  assert.equal(contextEnvelope.artifact.noteReferences.find((note: any) => note.kind === "running_context").status, "available");
  assert.equal(contextEnvelope.artifact.noteReferences.find((note: any) => note.kind === "weekly_reflections").status, "missing");
  assert.equal(contextEnvelope.artifact.noteReferences.find((note: any) => note.kind === "activity_notes").status, "unreadable");
  assert.deepEqual(contextEnvelope.artifact.warnings.map((warning: any) => warning.code).sort(), [
    "OPTIONAL_NOTE_MISSING",
    "OPTIONAL_NOTE_UNREADABLE",
  ]);
  assert.match(await readFile(firstContext.markdownPath, "utf8"), /Oldest Run|Activities: 2/);
  assert.equal(await readFile(personalNotePath, "utf8"), "Never overwrite this note.\n");

  const proposalPath = path.join(exchangePath, "coaching-plan-proposal.v1.json");
  await writeFile(proposalPath, JSON.stringify({ schema: "coaching-plan-proposal.v1", proposal: {} }), "utf8");
  await assert.rejects(
    () => service.importPlanProposal(proposalPath),
    (error) => error instanceof LocalCoachingServiceError && error.code === "INVALID_PLAN_PROPOSAL",
  );

  const proposalBody = {
      id: "codex_proposal_1",
      athleteId: "athlete_001",
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
      goalRationale: "The half-marathon target reflects the athlete's stated outcome and timing.",
      version: 1,
      revision: 1,
      startsOn: "2026-08-05",
      endsOn: "2026-09-06",
      timezone: "Africa/Johannesburg",
      weeklyStructure: [{
        weekStartsOn: "2026-08-03",
        focus: "Establish an easy aerobic rhythm",
        sessionIds: ["workout_today"],
      }],
      workouts: [{
        id: "workout_today",
        kind: "run",
        scheduledDate: "2026-08-05",
        startTime: "06:00",
        title: "Easy aerobic run",
        purpose: "Build durable aerobic consistency.",
        prescription: "Run 45 minutes at a conversational effort and finish feeling controlled.",
        cautions: ["Stop if pain changes your gait."],
        durationMinutes: 45,
        distanceMeters: 7000,
        intensityRpe: 3,
      }],
      contextArtifactId: firstContext.artifact.id,
      createdAt: fixedNow.toISOString(),
      status: "proposed",
      rationale: "Start from current history and progress conservatively.",
      summary: "A conservative opening session that establishes repeatable training.",
      assumptions: ["The athlete is healthy enough for easy running."],
      cautions: ["Seek professional advice for persistent pain."],
      sourceHistoryFingerprint: firstContext.fingerprint,
      contentHash: "0".repeat(64),
  };
  proposalBody.contentHash = calculatePlanProposalContentHash(proposalBody);
  const proposalArtifact = {
    schema: "coaching-plan-proposal.v1",
    proposal: proposalBody,
  };
  await writeFile(proposalPath, `${JSON.stringify(proposalArtifact, null, 2)}\n`, "utf8");
  const proposal = await service.importPlanProposal(proposalPath);
  const repeatedProposal = await service.importPlanProposal(proposalPath);
  assert.equal(proposal.version, 1, "invalid input must not create a hidden plan version");
  assert.equal(repeatedProposal.id, proposal.id, "equivalent proposal imports reuse the durable draft");
  assert.equal(repeatedProposal.version, proposal.version);
  assert.equal(proposal.contentHash, proposalBody.contentHash);
  assert.equal(proposal.review?.historyStatus, "current");
  assert.equal(proposal.review?.goalTitle, goal.title);
  assert.equal(proposal.review?.materialDifferences[0].change, "initial");
  assert.equal(proposal.workouts[0].prescription, proposalBody.workouts[0].prescription);
  assert.equal(service.getActivePlan(), null, "importing a proposal must not activate it");

  const changedHistoryPath = path.join(directory, "Changed History.csv");
  await writeFile(changedHistoryPath, [csvHeader, csvActivity("2026-08-04 06:00:00", "New History Run", "6.00")].join("\n"), "utf8");
  await importGarminCsv({ sourcePath: changedHistoryPath, vaultPath, databasePath });
  assert.throws(
    () => service.activatePlan({ planId: proposal.id, expectedRevision: proposal.revision, approvedByUser: true }),
    (error) => error instanceof LocalCoachingServiceError && error.code === "STALE_HISTORY_ACKNOWLEDGEMENT_REQUIRED",
  );
  const active = service.activatePlan({
    planId: proposal.id,
    expectedRevision: proposal.revision,
    approvedByUser: true,
    acknowledgeStale: true,
  });
  assert.equal(active.status, "active");
  assert.equal(service.listActiveCalendar()[0].revision, 1);
  const moved = service.editCalendar({
    planId: active.id,
    sessionId: "workout_today",
    operation: "reschedule",
    expectedRevision: 1,
    effectiveDate: "2026-08-06",
    requestedAt: fixedNow.toISOString(),
  });
  assert.equal(moved.scheduledDate, "2026-08-06");
  assert.equal(moved.prescribedDate, "2026-08-05");
  assert.equal(moved.effectiveDate, "2026-08-06");
  assert.equal(moved.status, "upcoming");
  assert.equal(moved.revision, 2);
  assert.equal(service.getActivePlan()?.workouts[0].scheduledDate, "2026-08-05", "approved prescription remains immutable");
  const skipped = service.editCalendar({
    planId: active.id,
    sessionId: "workout_today",
    operation: "skip",
    expectedRevision: 2,
    requestedAt: fixedNow.toISOString(),
  });
  assert.equal(skipped.status, "skipped");
  const restored = service.editCalendar({
    planId: active.id,
    sessionId: "workout_today",
    operation: "restore",
    expectedRevision: 3,
    requestedAt: fixedNow.toISOString(),
  });
  assert.equal(restored.status, "upcoming");
  assert.equal(restored.revision, 4);

  const today = service.buildTodayBrief();
  assert.equal(today.date, "2026-08-05");
  assert.equal(today.source, "fallback");
  assert.equal(today.sessionId, null, "the moved workout leaves a recovery day Today");
  assert.match(today.message, /consistent synthetic training routine/);

  const reminder = service.saveReminderPreferences();
  assert.equal(reminder.preferences.localTime, "06:30");
  assert.equal(reminder.preferences.timezone, "Africa/Johannesburg");
  assert.equal(reminder.externalStatus, "not_configured");
  const handoff = await service.generateCodexReminderHandoff();
  assert.equal(handoff.externalStatus, "prepared");
  assert.equal(handoff.scheduled, false);
  assert.match(await readFile(handoff.path, "utf8"), /prepared, not yet scheduled/);
  assert.equal(service.loadReminderPreferences().externalStatus, "prepared");

  const activeContext = await service.publishCoachingContext();
  const activeContextEnvelope = JSON.parse(await readFile(activeContext.jsonPath, "utf8"));
  assert.deepEqual(activeContextEnvelope.artifact.activePlan, {
    id: active.id,
    version: active.version,
    revision: active.revision,
  });
  assert.notEqual(activeContext.fingerprint, firstContext.fingerprint, "complete-history fingerprint changes when history changes");
  assert.equal(service.buildTodayOverview().stale.isStale, false, "acknowledged history remains fresh after active-context republish");

  const rejectedProposalBody = {
    ...proposalBody,
    id: "codex_proposal_2",
    version: 2,
    startsOn: "2026-08-10",
    contextArtifactId: activeContext.artifact.id,
    sourceHistoryFingerprint: activeContext.fingerprint,
    summary: "A replacement draft used only to prove durable rejection.",
    weeklyStructure: [{
      weekStartsOn: "2026-08-10",
      focus: "Start a replacement rhythm",
      sessionIds: ["replacement_easy_run"],
    }],
    workouts: [{
      ...proposalBody.workouts[0],
      id: "replacement_easy_run",
      scheduledDate: "2026-08-10",
      prescription: "Run 40 minutes easily on a flat route.",
      durationMinutes: 40,
    }],
    contentHash: "0".repeat(64),
  };
  rejectedProposalBody.contentHash = calculatePlanProposalContentHash(rejectedProposalBody);
  await writeFile(proposalPath, `${JSON.stringify({ schema: "coaching-plan-proposal.v1", proposal: rejectedProposalBody }, null, 2)}\n`, "utf8");
  const replacement = await service.importPlanProposal(proposalPath);
  assert.equal(replacement.review?.comparedActivePlanId, active.id);
  assert.equal(replacement.review?.comparedActivePlanVersion, active.version);
  assert.equal(replacement.review?.materialDifferences.some((difference) => difference.change === "changed"), true);
  const rejected = service.rejectPlanProposal({ planId: replacement.id, expectedRevision: replacement.revision });
  assert.equal(rejected.status, "withdrawn");
  assert.equal(rejected.revision, replacement.revision + 1);
  const repeatedRejected = await service.importPlanProposal(proposalPath);
  assert.equal(repeatedRejected.id, rejected.id);
  assert.equal(repeatedRejected.status, "withdrawn");
  assert.equal(repeatedRejected.revision, rejected.revision);

  const generatedFiles = await readdir(path.join(exchangePath, "Generated"));
  assert.equal(generatedFiles.some((name) => name.endsWith(".tmp")), false);
  service.close();

  const reopened = createLocalCoachingService({ databasePath, exchangePath, vaultPath, clock: () => fixedNow });
  const durableRejected = await reopened.importPlanProposal(proposalPath);
  assert.equal(durableRejected.id, rejected.id);
  assert.equal(durableRejected.status, "withdrawn");
  assert.equal(durableRejected.revision, rejected.revision);
  assert.equal(reopened.getActivePlan()?.id, active.id, "rejection survives restart without changing the active plan");
  reopened.close();
});
