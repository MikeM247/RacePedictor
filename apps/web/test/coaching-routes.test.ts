import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
// @ts-expect-error Existing local importer is JavaScript without a declaration file.
import { importGarminCsv } from "../../../packages/db/src/local-garmin-pipeline.js";
import { GET as getActivePlan } from "../app/api/v1/coaching/plans/active/route.ts";
import { POST as publishContext } from "../app/api/v1/coaching/context/publish/route.ts";
import { POST as importProposal } from "../app/api/v1/coaching/proposals/import/route.ts";
import { POST as decideProposal } from "../app/api/v1/coaching/proposals/[proposalId]/decision/route.ts";
import { GET as getCalendar } from "../app/api/v1/coaching/calendar/route.ts";
import { POST as editCalendar } from "../app/api/v1/coaching/calendar/sessions/[sessionId]/edits/route.ts";
import { GET as getToday } from "../app/api/v1/coaching/today/route.ts";
import { GET as getReminders, PUT as putReminders } from "../app/api/v1/coaching/reminder-preferences/route.ts";
import { POST as createReminderHandoff } from "../app/api/v1/coaching/reminder-handoffs/route.ts";
import { PUT as updateReminderHandoffStatus } from "../app/api/v1/coaching/reminder-handoffs/status/route.ts";
import { GET as getCurrentContext } from "../app/api/v1/coaching/context/current/route.ts";
import { GET as getLatestProposal } from "../app/api/v1/coaching/proposals/latest/route.ts";
import { GET as getPlanHistory } from "../app/api/v1/coaching/plans/history/route.ts";
import { GET as getPlanVersion } from "../app/api/v1/coaching/plans/[planId]/route.ts";
import {
  contextPublishApiResponseSchema,
  currentContextApiResponseSchema,
  latestProposalApiResponseSchema,
  planHistoryApiResponseSchema,
  planVersionApiResponseSchema,
  proposalImportApiResponseSchema,
} from "../../../packages/core/src/contracts/coaching.ts";
import { calculatePlanProposalContentHash } from "../lib/local-coaching-service.ts";

const jsonRequest = (url: string, body: unknown, method = "POST") => new Request(url, {
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const body = async (response: Response) => response.json() as Promise<Record<string, any>>;
const getRequest = (path: string) => new Request(`http://localhost${path}`);

test("coaching routes publish, import, approve, schedule, brief, and hand off without live Codex", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-coaching-routes-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const exchangePath = path.join(directory, "Second Brain", "Coach Exchange");
  const sourcePath = path.join(directory, "Activities.csv");
  process.env.RACEPREDICTOR_DATABASE_PATH = databasePath;
  process.env.RACEPREDICTOR_COACH_EXCHANGE_PATH = exchangePath;
  process.env.RACEPREDICTOR_VAULT_PATH = path.join(directory, "vault");
  process.env.RACEPREDICTOR_ATHLETE_ID = "athlete_001";

  try {
    await writeFile(sourcePath, [
      "Activity Type,Date,Title,Distance,Elapsed Time,Avg Pace,Total Ascent,Total Descent",
      "Running,2026-08-01 06:00:00,History Run,8.00,00:48:00,6:00,40,35",
    ].join("\n"), "utf8");
    await importGarminCsv({ sourcePath, vaultPath: path.join(directory, "vault"), databasePath });

    const contextRequest = {
      profile: {
        displayName: "Test Athlete",
        why: "Maintain a consistent synthetic training routine.",
        timezone: "Africa/Johannesburg",
        units: "metric",
      },
      goalDraft: { title: "Strong half marathon", targetDate: "2026-09-06", distanceMeters: 21097.5 },
      weeklyRoutine: {
        timezone: "Africa/Johannesburg",
        availableDays: ["tuesday", "thursday", "saturday"],
        preferredLongRunDay: "saturday",
      },
    };
    const publishedResponse = await publishContext(jsonRequest("http://localhost/api/v1/coaching/context/publish", contextRequest));
    assert.equal(publishedResponse.status, 200);
    const publishedEnvelope = await body(publishedResponse);
    assert.equal(contextPublishApiResponseSchema.safeParse(publishedEnvelope).success, true);
    const published = publishedEnvelope.data;
    assert.equal(published.artifact.activityCount, 1);
    assert.equal(published.goal.status, "draft", "publishing context must not settle a planning goal");
    const firstReloadedContextEnvelope = await body(await getCurrentContext(getRequest("/api/v1/coaching/context/current")));
    assert.equal(currentContextApiResponseSchema.safeParse(firstReloadedContextEnvelope).success, true);
    const firstReloadedContext = firstReloadedContextEnvelope.data.context;
    assert.equal(firstReloadedContext.planningGoal.id, published.goal.id);
    assert.equal(firstReloadedContext.settledGoal, null);

    const proposalBody = {
        id: "codex_http_proposal",
        athleteId: "athlete_001",
        goalId: published.goal.id,
        goalRevision: published.goal.revision,
        routineRevision: published.routine.revision,
        proposedGoal: published.goal,
        goalRationale: "The half-marathon target reflects the athlete's stated outcome and timing.",
        version: 1,
        revision: 1,
        startsOn: "2026-08-05",
        endsOn: "2026-09-06",
        timezone: "Africa/Johannesburg",
        weeklyStructure: [{
          weekStartsOn: "2026-08-03",
          focus: "Establish a sustainable aerobic and strength rhythm",
          sessionIds: ["route_workout_today", "route_workout_tomorrow"],
        }],
        workouts: [
          {
            id: "route_workout_today",
            kind: "run",
            scheduledDate: "2026-08-05",
            startTime: "06:00",
            title: "Easy aerobic run",
            purpose: "Build durable aerobic consistency.",
            prescription: "Run 45 minutes at conversational effort.",
            cautions: ["Stop if pain changes your gait."],
            durationMinutes: 45,
            distanceMeters: 7000,
            intensityRpe: 3,
          },
          {
            id: "route_workout_tomorrow",
            kind: "strength",
            scheduledDate: "2026-08-06",
            startTime: "17:30",
            title: "Strength foundation",
            purpose: "Support durable running form.",
            prescription: "Complete two controlled sets of the prescribed running-strength circuit.",
            cautions: ["Keep every repetition controlled."],
            durationMinutes: 30,
            intensityRpe: 4,
          },
        ],
        contextArtifactId: published.artifactId,
        createdAt: "2026-08-05T04:00:00.000Z",
        status: "proposed",
        rationale: "Progress conservatively from current history.",
        summary: "A balanced opening week with easy aerobic work and strength.",
        assumptions: ["The athlete is healthy enough for easy running and controlled strength work."],
        cautions: ["Persistent pain requires review by an appropriate professional."],
        sourceHistoryFingerprint: published.artifact.historyFingerprint,
        contentHash: "0".repeat(64),
    };
    proposalBody.contentHash = calculatePlanProposalContentHash(proposalBody);
    const proposalArtifact = {
      schema: "coaching-plan-proposal.v1",
      proposal: proposalBody,
    };
    const importedResponse = await importProposal(jsonRequest("http://localhost/api/v1/coaching/proposals/import", proposalArtifact));
    assert.equal(importedResponse.status, 200);
    const importedEnvelope = await body(importedResponse);
    assert.equal(proposalImportApiResponseSchema.safeParse(importedEnvelope).success, true);
    const proposal = importedEnvelope.data.proposal;
    const latestProposalEnvelope = await body(await getLatestProposal(getRequest("/api/v1/coaching/proposals/latest")));
    assert.equal(latestProposalApiResponseSchema.safeParse(latestProposalEnvelope).success, true);
    assert.equal(latestProposalEnvelope.data.proposal.id, proposal.id);
    assert.equal((await getActivePlan(getRequest("/api/v1/coaching/plans/active"))).status, 404, "import must not activate a proposal");

    const conflict = await decideProposal(
      jsonRequest(`http://localhost/api/v1/coaching/proposals/${proposal.id}/decision`, {
        decision: "approve", expectedRevision: 99,
      }),
      { params: Promise.resolve({ proposalId: proposal.id }) },
    );
    assert.equal(conflict.status, 409);
    assert.equal((await body(conflict)).error.code, "PLAN_ACTIVATION_REJECTED");

    const approved = await decideProposal(
      jsonRequest(`http://localhost/api/v1/coaching/proposals/${proposal.id}/decision`, {
        decision: "approve", expectedRevision: proposal.revision,
      }),
      { params: Promise.resolve({ proposalId: proposal.id }) },
    );
    assert.equal(approved.status, 200);
    const firstApproval = (await body(approved)).data;
    assert.equal(firstApproval.plan.status, "active");
    assert.equal(firstApproval.goal.id, published.goal.id);
    assert.equal(firstApproval.goal.status, "settled");
    assert.equal((await body(await getActivePlan(getRequest("/api/v1/coaching/plans/active")))).data.status, "active");

    const replacementPublishedResponse = await publishContext(jsonRequest(
      "http://localhost/api/v1/coaching/context/publish",
      {
        ...contextRequest,
        goalDraft: {
          ...contextRequest.goalDraft,
          title: "Revised strong half marathon",
        },
      },
    ));
    assert.equal(replacementPublishedResponse.status, 200);
    const replacementPublished = (await body(replacementPublishedResponse)).data;
    assert.equal(replacementPublished.goal.status, "draft");
    assert.equal((await body(await getActivePlan(getRequest("/api/v1/coaching/plans/active")))).data.id, firstApproval.plan.id, "publishing a replacement draft preserves the active plan");
    const replacementContext = (await body(await getCurrentContext(getRequest("/api/v1/coaching/context/current")))).data.context;
    assert.equal(replacementContext.planningGoal.id, replacementPublished.goal.id);
    assert.equal(replacementContext.settledGoal.id, firstApproval.goal.id);
    assert.equal(replacementContext.activePlan.id, firstApproval.plan.id);

    const rejectedProposalBody = {
      ...proposalBody,
      id: "codex_http_rejected_proposal",
      goalId: replacementPublished.goal.id,
      goalRevision: replacementPublished.goal.revision,
      routineRevision: replacementPublished.routine.revision,
      proposedGoal: replacementPublished.goal,
      goalRationale: "This revised goal reflects the newly published planning discussion.",
      version: 2,
      summary: "A replacement draft used to verify durable rejection through the route.",
      weeklyStructure: [{
        weekStartsOn: "2026-08-03",
        focus: "Replacement draft",
        sessionIds: ["rejected_route_run", "rejected_route_strength"],
      }],
      workouts: [
        { ...proposalBody.workouts[0], id: "rejected_route_run", durationMinutes: 40 },
        { ...proposalBody.workouts[1], id: "rejected_route_strength", durationMinutes: 25 },
      ],
      contextArtifactId: replacementPublished.artifactId,
      sourceHistoryFingerprint: replacementPublished.artifact.historyFingerprint,
      contentHash: "0".repeat(64),
    };
    rejectedProposalBody.contentHash = calculatePlanProposalContentHash(rejectedProposalBody);
    const rejectedArtifact = { schema: "coaching-plan-proposal.v1", proposal: rejectedProposalBody };
    const replacementImport = await importProposal(jsonRequest("http://localhost/api/v1/coaching/proposals/import", rejectedArtifact));
    assert.equal(replacementImport.status, 200);
    const replacement = (await body(replacementImport)).data.proposal;
    assert.equal(replacement.review.comparedActivePlanId, proposal.id);
    const rejectedResponse = await decideProposal(
      jsonRequest(`http://localhost/api/v1/coaching/proposals/${replacement.id}/decision`, {
        decision: "reject", expectedRevision: replacement.revision,
      }),
      { params: Promise.resolve({ proposalId: replacement.id }) },
    );
    assert.equal(rejectedResponse.status, 200);
    const rejected = (await body(rejectedResponse)).data.proposal;
    assert.equal(rejected.status, "withdrawn");
    const repeatedRejectedImport = await importProposal(jsonRequest("http://localhost/api/v1/coaching/proposals/import", rejectedArtifact));
    const repeatedRejected = (await body(repeatedRejectedImport)).data.proposal;
    assert.equal(repeatedRejected.id, rejected.id);
    assert.equal(repeatedRejected.status, "withdrawn");
    assert.equal(repeatedRejected.revision, rejected.revision);
    assert.equal((await body(await getLatestProposal(getRequest("/api/v1/coaching/proposals/latest")))).data.proposal.status, "withdrawn");
    assert.equal((await body(await getActivePlan(getRequest("/api/v1/coaching/plans/active")))).data.id, firstApproval.plan.id, "rejecting a replacement preserves the active plan");

    const invalidContext = await publishContext(jsonRequest("http://localhost/api/v1/coaching/context/publish", {
      ...contextRequest,
      profile: { ...contextRequest.profile, timezone: "Mars/Olympus_Mons" },
    }));
    assert.equal(invalidContext.status, 400);
    const invalidContextError = (await body(invalidContext)).error;
    assert.equal(invalidContextError.code, "VALIDATION_ERROR");
    assert.deepEqual(invalidContextError.details[0].path, ["profile", "timezone"]);

    const calendarResponse = await getCalendar(new Request(
      "http://localhost/api/v1/coaching/calendar?from=2026-08-03&to=2026-08-09",
    ));
    const session = (await body(calendarResponse)).data.sessions[0];
    assert.equal(session.id, "route_workout_today");

    const revisionConflict = await editCalendar(
      jsonRequest(`http://localhost/api/v1/coaching/calendar/sessions/${session.id}/edits`, {
        operation: "reschedule", expectedRevision: 99, date: "2026-08-06",
      }),
      { params: Promise.resolve({ sessionId: session.id }) },
    );
    assert.equal(revisionConflict.status, 409);
    assert.equal((await body(revisionConflict)).error.code, "REVISION_CONFLICT");

    const movedResponse = await editCalendar(
      jsonRequest(`http://localhost/api/v1/coaching/calendar/sessions/${session.id}/edits`, {
        operation: "reschedule", expectedRevision: session.revision, date: "2026-08-06",
      }),
      { params: Promise.resolve({ sessionId: session.id }) },
    );
    const moved = (await body(movedResponse)).data.session;
    assert.equal(moved.scheduledDate, "2026-08-06");
    assert.equal(moved.prescribedDate, "2026-08-05");
    assert.equal(moved.effectiveDate, "2026-08-06");
    assert.equal(moved.originalDate, "2026-08-05");
    assert.equal(moved.status, "upcoming");
    assert.equal(moved.revision, 2);
    assert.equal(moved.warnings.length, 1, "moving onto an active session exposes a same-day warning");

    const persistedCalendar = (await body(await getCalendar(new Request(
      "http://localhost/api/v1/coaching/calendar?from=2026-08-03&to=2026-08-09",
    )))).data.sessions;
    const persistedMoved = persistedCalendar.find((candidate: any) => candidate.id === session.id);
    assert.equal(persistedMoved.prescribedDate, "2026-08-05");
    assert.equal(persistedMoved.effectiveDate, "2026-08-06");
    assert.equal(persistedMoved.warnings.length, 1);

    const todayResponse = await getToday(new Request("http://localhost/api/v1/coaching/today?date=2026-08-06"));
    const today = (await body(todayResponse)).data;
    assert.equal(today.sessionId, session.id);
    assert.equal(today.session.title, "Easy aerobic run");

    const skippedResponse = await editCalendar(
      jsonRequest(`http://localhost/api/v1/coaching/calendar/sessions/${session.id}/edits`, {
        operation: "skip", expectedRevision: moved.revision, reason: "Recovery needed",
      }),
      { params: Promise.resolve({ sessionId: session.id }) },
    );
    const skipped = (await body(skippedResponse)).data.session;
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.prescribedDate, "2026-08-05");
    assert.equal(skipped.effectiveDate, "2026-08-06");
    assert.equal(skipped.revision, 3);

    const staleRestore = await editCalendar(
      jsonRequest(`http://localhost/api/v1/coaching/calendar/sessions/${session.id}/edits`, {
        operation: "restore", expectedRevision: moved.revision,
      }),
      { params: Promise.resolve({ sessionId: session.id }) },
    );
    assert.equal(staleRestore.status, 409);
    assert.equal((await body(staleRestore)).error.code, "REVISION_CONFLICT");

    const restoredResponse = await editCalendar(
      jsonRequest(`http://localhost/api/v1/coaching/calendar/sessions/${session.id}/edits`, {
        operation: "restore", expectedRevision: skipped.revision,
      }),
      { params: Promise.resolve({ sessionId: session.id }) },
    );
    const restored = (await body(restoredResponse)).data.session;
    assert.equal(restored.status, "upcoming");
    assert.equal(restored.prescribedDate, "2026-08-05");
    assert.equal(restored.effectiveDate, "2026-08-06");
    assert.equal(restored.revision, 4);

    const invalidDate = await getToday(new Request("http://localhost/api/v1/coaching/today?date=2026-02-30"));
    assert.equal(invalidDate.status, 400);
    assert.equal((await body(invalidDate)).error.code, "VALIDATION_ERROR");

    const reminderDefaults = (await body(await getReminders(getRequest("/api/v1/coaching/reminder-preferences")))).data;
    assert.equal(reminderDefaults.localTime, "06:30");
    const savedReminder = await putReminders(jsonRequest(
      "http://localhost/api/v1/coaching/reminder-preferences",
      { enabled: true, localTime: "07:00", timezone: "Africa/Johannesburg", channel: "codex_task", motivationalContext: true },
      "PUT",
    ));
    assert.equal((await body(savedReminder)).data.localTime, "07:00");
    const handoffResponse = await createReminderHandoff(jsonRequest(
      "http://localhost/api/v1/coaching/reminder-handoffs",
      { enabled: true, localTime: "07:00", timezone: "Africa/Johannesburg" },
    ));
    const handoff = (await body(handoffResponse)).data;
    assert.equal(handoff.externalStatus, "prepared");
    assert.equal(handoff.externalReference, handoff.path);
    assert.equal(handoff.scheduled, false);
    assert.match(handoff.handoff, /prepared, not yet scheduled/);

    const scheduledHandoffResponse = await updateReminderHandoffStatus(jsonRequest(
      "http://localhost/api/v1/coaching/reminder-handoffs/status",
      { externalStatus: "scheduled", externalReference: "codex-task://daily-coach" },
      "PUT",
    ));
    assert.equal(scheduledHandoffResponse.status, 200);
    const scheduledHandoff = (await body(scheduledHandoffResponse)).data;
    assert.equal(scheduledHandoff.externalStatus, "scheduled");
    assert.equal(scheduledHandoff.externalReference, "codex-task://daily-coach");
    const persistedReminder = (await body(await getReminders(getRequest("/api/v1/coaching/reminder-preferences")))).data;
    assert.equal(persistedReminder.externalStatus, "scheduled");
    assert.equal(persistedReminder.externalReference, "codex-task://daily-coach");

    const finalPublishedResponse = await publishContext(jsonRequest(
      "http://localhost/api/v1/coaching/context/publish",
      {
        ...contextRequest,
        goalDraft: {
          ...contextRequest.goalDraft,
          title: "Race-ready half marathon",
        },
      },
    ));
    assert.equal(finalPublishedResponse.status, 200);
    const finalPublished = (await body(finalPublishedResponse)).data;
    const approvedReplacementBody = {
      ...proposalBody,
      id: "codex_http_approved_replacement",
      goalId: finalPublished.goal.id,
      goalRevision: finalPublished.goal.revision,
      routineRevision: finalPublished.routine.revision,
      proposedGoal: finalPublished.goal,
      goalRationale: "The final target captures the approved outcome from the planning conversation.",
      version: 3,
      weeklyStructure: [{
        weekStartsOn: "2026-08-03",
        focus: "Approved replacement rhythm",
        sessionIds: ["approved_replacement_run", "approved_replacement_strength"],
      }],
      workouts: [
        { ...proposalBody.workouts[0], id: "approved_replacement_run", durationMinutes: 50 },
        { ...proposalBody.workouts[1], id: "approved_replacement_strength", durationMinutes: 35 },
      ],
      contextArtifactId: finalPublished.artifactId,
      sourceHistoryFingerprint: finalPublished.artifact.historyFingerprint,
      summary: "The approved replacement increases the opening sessions conservatively.",
      contentHash: "0".repeat(64),
    };
    approvedReplacementBody.contentHash = calculatePlanProposalContentHash(approvedReplacementBody);
    const approvedReplacementArtifact = { schema: "coaching-plan-proposal.v1", proposal: approvedReplacementBody };
    const finalImportResponse = await importProposal(jsonRequest(
      "http://localhost/api/v1/coaching/proposals/import",
      approvedReplacementArtifact,
    ));
    assert.equal(finalImportResponse.status, 200);
    const finalProposal = (await body(finalImportResponse)).data.proposal;

    const failedReplacementApproval = await decideProposal(
      jsonRequest(`http://localhost/api/v1/coaching/proposals/${finalProposal.id}/decision`, {
        decision: "approve",
        expectedRevision: finalProposal.revision,
      }),
      { params: Promise.resolve({ proposalId: finalProposal.id }) },
    );
    assert.equal(failedReplacementApproval.status, 409, "an active plan must be explicitly named for replacement");
    assert.equal((await body(await getActivePlan(getRequest("/api/v1/coaching/plans/active")))).data.id, firstApproval.plan.id, "failed approval preserves the old active plan");

    const finalApprovalResponse = await decideProposal(
      jsonRequest(`http://localhost/api/v1/coaching/proposals/${finalProposal.id}/decision`, {
        decision: "approve",
        expectedRevision: finalProposal.revision,
        replacingPlanId: firstApproval.plan.id,
      }),
      { params: Promise.resolve({ proposalId: finalProposal.id }) },
    );
    assert.equal(finalApprovalResponse.status, 200);
    const finalApproval = (await body(finalApprovalResponse)).data;
    assert.equal(finalApproval.goal.id, finalPublished.goal.id);
    assert.equal(finalApproval.goal.status, "settled");
    assert.equal(finalApproval.plan.id, finalProposal.id);
    assert.equal(finalApproval.plan.status, "active");

    const historyResponse = await getPlanHistory(getRequest("/api/v1/coaching/plans/history"));
    assert.equal(historyResponse.status, 200);
    const historyEnvelope = await body(historyResponse);
    assert.equal(planHistoryApiResponseSchema.safeParse(historyEnvelope).success, true);
    const planHistory = historyEnvelope.data.plans;
    assert.deepEqual(planHistory.map((plan: any) => plan.status), ["active", "retired"]);
    assert.equal(planHistory[0].id, finalProposal.id);
    assert.equal(planHistory[1].id, firstApproval.plan.id);
    const retiredPlanResponse = await getPlanVersion(
      new Request(`http://localhost/api/v1/coaching/plans/${firstApproval.plan.id}`),
      { params: Promise.resolve({ planId: firstApproval.plan.id }) },
    );
    assert.equal(retiredPlanResponse.status, 200);
    const retiredPlanEnvelope = await body(retiredPlanResponse);
    assert.equal(planVersionApiResponseSchema.safeParse(retiredPlanEnvelope).success, true);
    const retiredPlan = retiredPlanEnvelope.data.plan;
    assert.equal(retiredPlan.id, firstApproval.plan.id);
    assert.equal(retiredPlan.status, "retired");
  } finally {
    delete process.env.RACEPREDICTOR_DATABASE_PATH;
    delete process.env.RACEPREDICTOR_COACH_EXCHANGE_PATH;
    delete process.env.RACEPREDICTOR_VAULT_PATH;
    delete process.env.RACEPREDICTOR_ATHLETE_ID;
  }
});
