import { expect, test } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { e2eExchangePath } from "./fixture-paths.ts";
import {
  absent as absentResponse,
  coachingFixtures,
  fixtureCalendarSession as validCalendarSession,
  fixtureContext as validContext,
  fixtureGoal as validGoal,
  fixturePlan as validPlan,
  fixtureProposal as validProposal,
  fixtureToday as validToday,
} from "./coaching-fixtures.ts";
import { loadInterceptedTrainingHistory, openDetailDisclosures } from "./test-helpers.ts";
import { calculatePlanProposalContentHash } from "../lib/local-coaching-service.ts";

const localDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const weekStartsOn = (date: string) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
};

const fixtureTime = "2026-09-13T08:00:00.000Z";
const fixtureHash = "a".repeat(64);
const fixtureGoal = (id = "goal_resume") => ({
  id, athleteId: "e2e_athlete", revision: 1, title: "Autumn half marathon", why: "Finish confidently",
  target: { kind: "performance", distanceMeters: 21100, targetDate: "2026-10-12" }, status: "draft", createdAt: fixtureTime, updatedAt: fixtureTime,
});
const fixtureProposal = (id = "proposal_resume", contextArtifactId = "context_resume") => {
  const goal = fixtureGoal();
  return {
    id, athleteId: "e2e_athlete", goalId: goal.id, goalRevision: 1, routineRevision: 1, version: 2, revision: 1,
    startsOn: "2026-09-14", endsOn: "2026-10-12", timezone: "Africa/Johannesburg", contextArtifactId, createdAt: fixtureTime,
    status: "proposed", proposedGoal: goal, goalRationale: "Continue with a gradual build.", rationale: "Continue with a gradual build.", summary: "A saved plan draft.", assumptions: [], cautions: [], sourceHistoryFingerprint: fixtureHash, contentHash: fixtureHash,
    weeklyStructure: [{ weekStartsOn: "2026-09-14", focus: "Easy start", sessionIds: ["workout_resume"] }],
    workouts: [{ id: "workout_resume", kind: "run", scheduledDate: "2026-09-15", startTime: "06:00", title: "Easy run and strides", purpose: "Maintain rhythm.", prescription: "Run easily.", cautions: [], durationMinutes: 45, distanceMeters: 7000, intensityRpe: 3 }],
    review: { historyStatus: "current", requiresStaleAcknowledgement: false, goalTitle: goal.title, goalTarget: goal.target, materialDifferences: [{ field: "plan", change: "initial", summary: "First plan." }] },
  };
};
const fixtureContext = () => ({
  schema: "coaching-context.v1", artifact: { id: "context_resume", athleteId: "e2e_athlete", schemaVersion: 1, capturedAt: fixtureTime, activityCount: 0, earliestActivityDate: null, latestActivityDate: null, sources: ["manual"], historyFingerprint: fixtureHash, contentHash: fixtureHash, digest: fixtureHash, activePlan: null, noteReferences: [], warnings: [] },
  profile: { id: "profile_resume", athleteId: "e2e_athlete", revision: 1, displayName: "Runner", timezone: "Africa/Johannesburg", units: "metric", why: "Finish confidently", experience: "intermediate", constraints: [], updatedAt: fixtureTime },
  routine: { id: "routine_resume", athleteId: "e2e_athlete", revision: 1, timezone: "Africa/Johannesburg", desiredSessionsPerWeek: 1, preferredLongRunDay: "tuesday", days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => day === "tuesday" ? { day, available: true, startTime: "06:00", endTime: "08:00", maxDurationMinutes: 120, allowedKinds: ["run"] } : { day, available: false }), updatedAt: fixtureTime },
  planningGoal: fixtureGoal(), settledGoal: null, activePlan: null, historyCoverage: { athleteId: "e2e_athlete", activityCount: 0, earliestOccurredAt: null, latestOccurredAt: null, totalDistanceM: 0, sourceTypes: [] }, activities: [],
});

const currentScreenRoutes = [
  { href: "/dashboard", heading: "Home", nav: "Home" },
  { href: "/dashboard/calendar", heading: "Calendar", nav: "Plan" },
  { href: "/dashboard/plan", heading: "Plan", nav: "Plan" },
  { href: "/dashboard/activities", heading: "Training", nav: "Training" },
  { href: "/dashboard/data-quality", heading: "Data Quality", nav: "Data Quality" },
  { href: "/dashboard/settings", heading: "Settings", nav: "Settings" },
] as const;

const syntheticGpx = (date: string) => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="racepredictor-e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Synthetic coaching baseline</name><trkseg>
    <trkpt lat="-29.8000" lon="31.0000"><ele>10</ele><time>${date}T04:00:00Z</time></trkpt>
    <trkpt lat="-29.7700" lon="31.0000"><ele>20</ele><time>${date}T04:20:00Z</time></trkpt>
    <trkpt lat="-29.7400" lon="31.0000"><ele>15</ele><time>${date}T04:45:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

test("manual history becomes an explicitly approved and safely scheduled digital coaching plan", async ({ page }) => {
  test.setTimeout(180_000);
  const today = localDate();
  const tomorrow = addDays(today, 1);
  const isSunday = new Date(`${today}T12:00:00.000Z`).getUTCDay() === 0;
  const sameWeekConflictDate = tomorrow;
  const strengthDate = addDays(today, 2);
  const targetDate = addDays(today, 42);

  await page.goto("/dashboard/data-quality");
  await page.getByLabel("CSV or GPX file").setInputFiles({
    name: "unsupported.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not activity data"),
  });
  await page.getByRole("button", { name: "Import selected file" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /CSV|GPX|supported|extension|type/i })).toBeVisible();

  await page.getByLabel("CSV or GPX file").setInputFiles({
    name: "synthetic-run.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(syntheticGpx(today)),
  });
  await page.getByRole("button", { name: "Import selected file" }).click();
  await expect(page.getByText(/Accepted activities can be viewed in Training/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Validation summary" })).toBeVisible();
  await expect(page.getByText(/Import acceptance does not establish/)).toBeVisible();

  await page.goto("/dashboard/plan");
  await expect(page.getByRole("region", { name: "Active plan" })).toBeVisible();
  await expect(page.getByLabel("Goal", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Create a plan with Codex" }).click();
  await expect(page.getByRole("heading", { name: "Set your race goal" })).toBeFocused();
  await page.getByLabel("Name").fill("Synthetic Athlete");
  await page.getByLabel("Target outcome", { exact: true }).fill("Run a confident synthetic half marathon");
  await page.getByLabel("Target date").fill(targetDate);
  await page.getByLabel("Target distance (km)").fill("21.1");
  await page.getByLabel("Why this matters").fill("Complete the synthetic coaching journey consistently.");
  await expect(page.getByRole("checkbox", { name: "Tue" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Sun" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Tue" }).uncheck();
  await page.getByRole("checkbox", { name: "Mon" }).check();
  const [publishResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/v1/coaching/context/publish") && response.request().method() === "POST",
      { timeout: 60_000 },
    ),
    page.getByRole("button", { name: "Publish context for Codex" }).click(),
  ]);
  expect(publishResponse.ok()).toBe(true);
  await expect(page.getByText("Context saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I have a proposal" }).click();

  const contextPath = path.join(e2eExchangePath, "Generated", "coaching-context.v1.json");
  await expect.poll(async () => {
    try {
      return JSON.parse(await readFile(contextPath, "utf8"));
    } catch {
      return null;
    }
  }).not.toBeNull();
  const context = JSON.parse(await readFile(contextPath, "utf8"));
  expect(context.artifact.activityCount).toBe(1);
  expect(context.historyCoverage.sourceTypes).toContain("gpx");
  expect(context.profile).toMatchObject({
    displayName: "Synthetic Athlete",
    why: "Complete the synthetic coaching journey consistently.",
  });
  expect(context.routine.days.filter((day: { available: boolean }) => day.available).map((day: { day: string }) => day.day)).toEqual([
    "monday",
    "thursday",
    "sunday",
  ]);
  expect(context.planningGoal).toMatchObject({
    title: "Run a confident synthetic half marathon",
    status: "draft",
  });
  expect(context.settledGoal).toBeNull();

  const proposalBody = {
      id: "synthetic_codex_proposal",
      athleteId: "e2e_athlete",
      goalId: context.planningGoal.id,
      goalRevision: context.planningGoal.revision,
      routineRevision: context.routine.revision,
      proposedGoal: context.planningGoal,
      goalRationale: "The half-marathon target reflects the athlete's stated outcome and timing.",
      version: 1,
      revision: 1,
      startsOn: weekStartsOn(today),
      endsOn: targetDate,
      timezone: "Africa/Johannesburg",
      weeklyStructure: Array.from(new Set([weekStartsOn(today), weekStartsOn(strengthDate)])).map((week) => ({
        weekStartsOn: week,
        focus: "Build a sustainable aerobic and strength rhythm",
        sessionIds: [
          ...(weekStartsOn(today) === week ? ["synthetic_easy_session"] : []),
          ...(weekStartsOn(strengthDate) === week ? ["synthetic_strength_session"] : []),
          ...(weekStartsOn(tomorrow) === week ? ["synthetic_future_session"] : []),
        ],
      })),
      workouts: [
        {
          id: "synthetic_easy_session",
          kind: "run",
          scheduledDate: today,
          startTime: "06:30",
          title: "Synthetic easy aerobic run",
          purpose: "Build the aerobic consistency behind the accepted goal.",
          prescription: "Run easily for 45 minutes at conversational effort.",
          cautions: ["Stop if pain changes your gait."],
          durationMinutes: 45,
          distanceMeters: 7000,
          intensityRpe: 3,
        },
        {
          id: "synthetic_strength_session",
          kind: "strength",
          scheduledDate: strengthDate,
          startTime: "17:30",
          title: "Synthetic strength foundation",
          purpose: "Support durable running form.",
          prescription: "Complete two controlled sets of the running-strength circuit.",
          cautions: ["Use controlled movement throughout."],
          durationMinutes: 30,
          intensityRpe: 4,
        },
        {
          id: "synthetic_future_session",
          kind: "run",
          scheduledDate: tomorrow,
          startTime: "06:15",
          title: "Synthetic future aerobic run",
          purpose: "Continue the approved aerobic progression.",
          prescription: "Run easily for 35 minutes at conversational effort.",
          cautions: ["Keep the effort easy."],
          durationMinutes: 35,
          intensityRpe: 3,
        },
      ],
      contextArtifactId: context.artifact.id,
      createdAt: `${today}T05:00:00.000Z`,
      status: "proposed",
      rationale: "Use the complete imported history and current weekly routine without silent adaptation.",
      summary: "A balanced first week supporting consistent running and durable movement.",
      assumptions: ["The synthetic athlete is healthy enough for easy running and strength work."],
      cautions: ["Persistent pain requires review by an appropriate professional."],
      sourceHistoryFingerprint: context.artifact.historyFingerprint,
      contentHash: "0".repeat(64),
  };
  proposalBody.contentHash = calculatePlanProposalContentHash(proposalBody);
  const proposal = {
    schema: "coaching-plan-proposal.v1",
    proposal: proposalBody,
  };

  await page.getByLabel("Codex proposal JSON").setInputFiles({
    name: "coaching-plan-proposal.v1.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(proposal)),
  });
  await page.getByRole("button", { name: "Import selected proposal" }).click();
  await expect(page.getByText("Draft imported for review. Nothing is active yet.", { exact: true })).toBeVisible();
  await expect(page.getByText("Draft proposal", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("No plan is active yet");

  await page.getByRole("button", { name: "Review and approve" }).click();
  const approval = page.getByRole("alertdialog", { name: "Activate this plan version?" });
  await expect(approval).toBeVisible();
  await approval.getByRole("button", { name: "Confirm approve" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Plan activated after explicit approval." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("Active");

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Synthetic easy aerobic run" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View session" })).toHaveAttribute("href", /synthetic_easy_session/);
  await expect(page.getByRole("link", { name: "Open active plan" })).toHaveAttribute("href", "/dashboard/plan#active-plan-heading");

  await page.goto("/dashboard/calendar");
  const futureDay = page.locator(".calendar-day").filter({ hasText: "Synthetic future aerobic run" });
  const futureDetailButton = futureDay.getByRole("button", { name: /View details for/ });
  await futureDetailButton.click();
  let planDetail = page.getByRole("dialog", { name: "Plan details" });
  let sessionCard = planDetail.locator("#session-synthetic_future_session");
  await expect(sessionCard).toBeVisible();
  await sessionCard.getByRole("button", { name: "Skip" }).click();
  const skipDialog = page.getByRole("alertdialog", { name: "Confirm skip" });
  await expect(skipDialog).toContainText(`prescribed date remains ${tomorrow}`);
  await skipDialog.getByRole("button", { name: "Confirm change" }).click();
  await expect(skipDialog.getByLabel("Reason for this change")).toBeFocused();
  await skipDialog.getByLabel("Reason for this change").fill("Recovery is more important after a difficult work week.");
  await skipDialog.getByRole("button", { name: "Confirm change" }).click();
  await expect(skipDialog).toBeHidden();
  await page.reload();
  await futureDetailButton.click();
  planDetail = page.getByRole("dialog", { name: "Plan details" });
  sessionCard = planDetail.locator("#session-synthetic_future_session");
  await expect(sessionCard).toContainText("skipped");
  await expect(sessionCard.getByRole("button", { name: "Restore" })).toBeVisible();

  await sessionCard.getByRole("button", { name: "Restore" }).click();
  const restoreDialog = page.getByRole("alertdialog", { name: "Confirm restore" });
  await restoreDialog.getByLabel("Reason for this change").fill("Recovery is complete and the session is appropriate again.");
  await restoreDialog.getByRole("button", { name: "Confirm change" }).click();
  await expect(restoreDialog).toBeHidden();
  await page.reload();
  await futureDetailButton.click();
  planDetail = page.getByRole("dialog", { name: "Plan details" });
  sessionCard = planDetail.locator("#session-synthetic_future_session");
  await expect(sessionCard).toContainText("upcoming");
  await expect(sessionCard.getByRole("button", { name: "Skip" })).toBeVisible();
  await expect(sessionCard.getByLabel("Move to date")).toHaveValue(sameWeekConflictDate);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Synthetic easy aerobic run" })).toBeVisible();

  await page.goto("/dashboard/settings");
  await expect(page.getByLabel("Local time")).toHaveValue("06:30");
  await expect(page.getByLabel("IANA timezone")).toHaveValue("Africa/Johannesburg");
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeDisabled();
  await page.getByLabel("Local time").fill("07:15");
  await page.getByLabel("IANA timezone").fill("America/Los_Angeles");
  const reminderSave = page.waitForRequest((request) => request.method() === "PUT" && request.url().endsWith("/api/v1/coaching/reminder-preferences"));
  await page.getByRole("button", { name: "Save preferences" }).click();
  expect((await reminderSave).postDataJSON()).toMatchObject({
    localTime: "07:15",
    timezone: "America/Los_Angeles",
    days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    channel: "codex_task",
  });
  await expect(page.getByRole("status").filter({ hasText: "App reminder preference saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Local time")).toHaveValue("07:15");
  await expect(page.getByLabel("IANA timezone")).toHaveValue("America/Los_Angeles");
  await page.locator(".settings-group > summary").filter({ hasText: "Reminder handoff" }).click();
  await page.getByRole("button", { name: "Prepare reminder handoff" }).click();
  await expect(page.getByLabel("Generated Codex reminder handoff")).toContainText("prepared, not yet scheduled");
  await expect(page.getByLabel("Generated Codex reminder handoff")).toContainText("Context artifact: Coach Exchange/Generated/coaching-context.v1.json");
  await expect(page.getByLabel("Generated Codex reminder handoff")).toContainText("Do not provide medical diagnosis or medical authority");
  await expect(page.getByLabel("Generated Codex reminder handoff")).toContainText("Do not review a completed run or claim automatic adaptation");
  await expect(page.getByText("Not scheduled — handoff prepared")).toBeVisible();
  await page.getByRole("button", { name: "Continue to confirmation" }).click();
  await page.reload();
  await page.locator(".settings-group > summary").filter({ hasText: "Reminder handoff" }).click();
  await expect(page.locator(".status-chip").filter({ hasText: "Prepared for Codex" })).toBeVisible();
  await expect(page.getByText("Not scheduled — handoff prepared")).toBeVisible();
  await page.getByLabel("External task reference").fill("codex-task-e2e-confirmation");
  await page.getByRole("button", { name: "Confirm scheduled externally" }).click();
  await expect(page.getByRole("status").filter({ hasText: "app does not infer or verify external delivery" })).toBeVisible();
  await expect(page.getByText("Scheduled externally — user confirmed")).toBeVisible();
  await page.reload();
  await page.locator(".settings-group > summary").filter({ hasText: "Reminder handoff" }).click();
  await expect(page.getByText("Scheduled externally — user confirmed")).toBeVisible();

  const generatedFiles = await readdir(path.join(e2eExchangePath, "Generated"));
  expect(generatedFiles.some((file) => file.endsWith(".tmp"))).toBe(false);
  expect(generatedFiles.some((file) => file.startsWith("codex-reminder-handoff.v1."))).toBe(true);

  await page.goto("/dashboard/plan");
  const replacementTargetDate = addDays(today, 56);
  await page.getByRole("button", { name: "Create a new plan with Codex" }).click();
  await page.getByLabel("Target outcome", { exact: true }).fill("Run a stronger synthetic half marathon");
  await page.getByLabel("Target date").fill(replacementTargetDate);
  await page.getByLabel("Why this matters").fill("Keep building the synthetic coaching habit with a reviewed progression.");
  await page.getByRole("button", { name: "Publish context for Codex" }).click();
  await expect(page.getByText("Context saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I have a proposal" }).click();
  await expect.poll(async () => {
    const latest = JSON.parse(await readFile(contextPath, "utf8"));
    return latest.planningGoal?.title;
  }).toBe("Run a stronger synthetic half marathon");
  const replacementContext = JSON.parse(await readFile(contextPath, "utf8"));
  expect(replacementContext.activePlan).toMatchObject({ version: 1 });
  expect(replacementContext.activePlan.id).toMatch(/^plan_/);
  expect(replacementContext.settledGoal).toMatchObject({ title: "Run a confident synthetic half marathon", status: "settled" });
  expect(replacementContext.planningGoal).toMatchObject({ title: "Run a stronger synthetic half marathon", status: "draft" });

  const replacementProposalBody = {
    id: "synthetic_codex_proposal_v2",
    athleteId: "e2e_athlete",
    goalId: replacementContext.planningGoal.id,
    goalRevision: replacementContext.planningGoal.revision,
    routineRevision: replacementContext.routine.revision,
    proposedGoal: replacementContext.planningGoal,
    goalRationale: "The replacement goal preserves the athlete's intent while extending the reviewed timeline.",
    version: 2,
    revision: 1,
    startsOn: today,
    endsOn: replacementTargetDate,
    timezone: "Africa/Johannesburg",
    weeklyStructure: [{
      weekStartsOn: weekStartsOn(today),
      focus: "Progress the reviewed aerobic routine",
      sessionIds: ["synthetic_replacement_session"],
    }],
    workouts: [{
      id: "synthetic_replacement_session",
      kind: "run",
      scheduledDate: today,
      startTime: "06:30",
      title: "Synthetic replacement aerobic run",
      purpose: "Progress the approved consistency goal.",
      prescription: "Run easily for 50 minutes and finish controlled.",
      cautions: ["Stop if pain changes your gait."],
      durationMinutes: 50,
      distanceMeters: 8000,
      intensityRpe: 4,
    }],
    contextArtifactId: replacementContext.artifact.id,
    createdAt: `${today}T06:00:00.000Z`,
    status: "proposed",
    rationale: "Replace the first plan only after explicit review and approval.",
    summary: "A reviewed second plan version with a modest progression.",
    assumptions: ["The athlete remains ready for controlled easy running."],
    cautions: ["Persistent pain requires review by an appropriate professional."],
    sourceHistoryFingerprint: replacementContext.artifact.historyFingerprint,
    contentHash: "0".repeat(64),
  };
  replacementProposalBody.contentHash = calculatePlanProposalContentHash(replacementProposalBody);
  await page.getByLabel("Codex proposal JSON").setInputFiles({
    name: "coaching-plan-proposal.v2.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "coaching-plan-proposal.v1", proposal: replacementProposalBody })),
  });
  await page.getByRole("button", { name: "Import selected proposal" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft imported for review. Nothing is active yet." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("Approval record1");
  const versionHistory = page.getByRole("region", { name: "Approved plan version history" });
  await expect(versionHistory).toContainText("Approved record 1");
  await expect(versionHistory).toContainText("Active");

  await page.getByRole("button", { name: "Review and approve" }).click();
  const replacementDialog = page.getByRole("alertdialog", { name: "Activate this plan version?" });
  await expect(replacementDialog).toContainText("retires the reviewed active plan");
  const decisionRequest = page.waitForRequest((request) => request.method() === "POST" && request.url().includes("/api/v1/coaching/proposals/") && request.url().endsWith("/decision"));
  await replacementDialog.getByRole("button", { name: "Confirm approve" }).click();
  expect((await decisionRequest).postDataJSON()).toMatchObject({ replacingPlanId: replacementContext.activePlan.id });
  await expect(replacementDialog).toContainText("Plan activated after explicit approval");
  await replacementDialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("Approval record2");
  await expect(versionHistory).toContainText("Approved record 2");
  const retiredVersion = versionHistory.locator("details").filter({ hasText: "Approved record 1" });
  await expect(retiredVersion).toContainText("Retired");
  await retiredVersion.locator("summary").click();
  await expect(retiredVersion).toContainText("Run easily for 45 minutes at conversational effort.");
});

test("the complete digital-coach journey remains usable at the 390px baseline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const today = localDate();
  const tomorrow = addDays(today, 1);
  const moveDate = addDays(tomorrow, 1);
  const targetDate = addDays(today, 42);
  let approved = false;
  let moved = false;
  let published = false;
  let reminderStatus: "not_configured" | "prepared" | "scheduled" = "not_configured";
  const mobileGoal = validGoal({ id: "goal_mobile_journey", title: "Mobile half marathon", why: "Build confidence and consistency.", target: { kind: "performance", distanceMeters: 21_100, targetDate } });
  const mobileWorkout = {
    id: "session_mobile_journey", kind: "run", scheduledDate: tomorrow, startTime: "06:00", title: "Mobile confidence run",
    purpose: "Build confidence through repeatable easy running.", prescription: "Run easily for 40 minutes at conversational effort.",
    cautions: ["Stop if pain changes your gait."], durationMinutes: 40, distanceMeters: 6_000, intensityRpe: 3,
  };
  const session = () => validCalendarSession({ ...mobileWorkout, prescribedDate: tomorrow, originalDate: tomorrow, effectiveDate: moved ? moveDate : tomorrow, scheduledDate: moved ? moveDate : tomorrow, revision: moved ? 2 : 1 });
  const proposal = validProposal({
    id: "proposal_mobile_journey", goalId: mobileGoal.id, proposedGoal: mobileGoal, version: 1, revision: 1,
    startsOn: weekStartsOn(today), endsOn: targetDate, contextArtifactId: "context_mobile_journey", workouts: [mobileWorkout],
    weeklyStructure: [{ weekStartsOn: weekStartsOn(today), focus: "Consistency", sessionIds: ["session_mobile_journey"] }],
    summary: "A conservative mobile coaching plan.", rationale: "Build consistent aerobic work.", goalRationale: "The mobile goal is achievable through a gradual build.",
    assumptions: ["Easy running is currently appropriate."], cautions: ["Persistent pain needs professional review."],
    review: { historyStatus: "current", requiresStaleAcknowledgement: false, goalTitle: mobileGoal.title, goalTarget: mobileGoal.target, materialDifferences: [{ field: "plan", change: "added", summary: "Creates the first approved plan." }] },
  });
  const plan = validPlan({
    id: "plan_mobile_journey", goalId: mobileGoal.id, version: 1, revision: 1, startsOn: weekStartsOn(today), endsOn: targetDate,
    contextArtifactId: "context_mobile_journey", workouts: [mobileWorkout], weeklyStructure: proposal.weeklyStructure,
    approval: { ...validPlan().approval, summary: proposal.summary, rationale: proposal.rationale, goalRationale: proposal.goalRationale, assumptions: proposal.assumptions, cautions: proposal.cautions },
  });

  await page.route("**/api/v1/imports/upload", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.importUpload()) }));
  await page.route("**/api/v1/coaching/context/publish", (route) => {
    published = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.contextPublish({ artifactId: "context_mobile_journey", artifact: { ...validContext().artifact, id: "context_mobile_journey" } })) });
  });
  await page.route("**/api/v1/coaching/proposals/import", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.proposalImport(proposal)) }));
  await page.route("**/api/v1/coaching/proposals/proposal_mobile_journey/decision", (route) => {
    approved = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.decision(plan, proposal.id)) });
  });
  await page.route("**/api/v1/coaching/plans/active", (route) => approved
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.activePlan(plan)) })
    : route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify(absentResponse()) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.history(approved ? [plan] : [])) }));
  await page.route("**/api/v1/coaching/proposals/latest", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.latestProposal(null)) }));
  await page.route("**/api/v1/coaching/calendar?**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.calendar(approved ? [session()] : [], url.searchParams.get("from") ?? today, url.searchParams.get("to") ?? targetDate)) });
  });
  await page.route("**/api/v1/coaching/calendar/sessions/session_mobile_journey/edits", (route) => {
    moved = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.calendarEdit(session())) });
  });
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.today({
    date: today, sessionId: session().id, goal: { id: mobileGoal.id, title: mobileGoal.title, why: mobileGoal.why, targetDate, countdown: { days: 42, label: "42 days to target" } },
    plan: { id: plan.id, version: plan.version, startsOn: plan.startsOn, endsOn: plan.endsOn }, planVersion: plan.version,
    session: { ...session(), effectiveDate: today, scheduledDate: today }, links: { plan: "/dashboard/plan#active-plan-heading", calendar: "/dashboard/calendar", session: `/dashboard/calendar?session=session_mobile_journey&date=${today}#session-session_mobile_journey` },
  })) }));
  await page.route("**/api/v1/coaching/reminder-preferences", (route) => {
    if (route.request().method() === "PUT") reminderStatus = "not_configured";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.reminderPreferences({ externalStatus: reminderStatus, externalReference: reminderStatus === "prepared" ? "Coach Exchange/Generated/coaching-context.v1.json" : reminderStatus === "scheduled" ? "codex-mobile-task" : null })) });
  });
  await page.route("**/api/v1/coaching/reminder-handoffs", (route) => {
    reminderStatus = "prepared";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.reminderHandoff()) });
  });
  await page.route("**/api/v1/coaching/reminder-handoffs/status", (route) => {
    reminderStatus = "scheduled";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.reminderStatus({ externalStatus: "scheduled", externalReference: "codex-mobile-task" })) });
  });
  await page.route("**/api/v1/coaching/context/current", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.currentContext(published ? validContext({ artifact: { ...validContext().artifact, id: "context_mobile_journey" } }) : null)) }));

  await page.goto("/dashboard/data-quality");
  await page.getByLabel("CSV or GPX file").setInputFiles({ name: "mobile-run.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(syntheticGpx(today)) });
  await page.getByRole("button", { name: "Import selected file" }).click();
  await expect(page.getByRole("heading", { name: "Validation summary" })).toBeVisible();

  await page.goto("/dashboard/plan");
  await page.getByRole("button", { name: "Create a plan with Codex" }).click();
  await page.getByLabel("Target outcome", { exact: true }).fill("Mobile half marathon");
  await page.getByLabel("Target date").fill(targetDate);
  await page.getByLabel("Why this matters").fill("Build confidence and consistency.");
  await page.getByRole("button", { name: "Publish context for Codex" }).click();
  await expect(page.getByText("Context saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I have a proposal" }).click();
  await page.getByLabel("Codex proposal JSON").setInputFiles({ name: "mobile-plan.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await page.getByRole("button", { name: "Import selected proposal" }).click();
  await expect(page.getByText("Draft proposal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review and approve" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm approve" }).click();
  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("Active");

  await page.goto(`/dashboard/calendar?date=${tomorrow}`);
  const mobileSession = page.locator("#session-session_mobile_journey");
  await expect(mobileSession).toContainText("Run easily for 40 minutes");
  await mobileSession.getByLabel("Move to date").fill(moveDate);
  await mobileSession.getByRole("button", { name: "Review move" }).click();
  await page.getByRole("alertdialog").getByLabel("Reason for this change").fill("Move the run around a work commitment.");
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm change" }).click();
  await expect(mobileSession).toContainText(`moved from ${tomorrow} to ${moveDate}`);
  await expect(mobileSession).toContainText("Run easily for 40 minutes");

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Mobile confidence run" })).toBeVisible();
  await expect(page.getByText("Approved prescription: Run easily for 40 minutes")).toBeVisible();

  await page.goto("/dashboard/settings");
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeDisabled();
  await page.locator("details.settings-group").filter({ hasText: "Recurring motivation setup" }).locator("summary").click();
  await page.getByRole("button", { name: "Prepare reminder handoff" }).click();
  await page.getByRole("button", { name: "Continue to confirmation" }).click();
  await expect(page.getByText("Not scheduled — handoff prepared")).toBeVisible();
  await page.getByLabel("External task reference").fill("codex-mobile-task");
  await page.getByRole("button", { name: "Confirm scheduled externally" }).click();
  await expect(page.getByText("Scheduled externally — user confirmed")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

const noPlanToday = validToday({
  date: "2026-08-05",
  sessionId: null,
  state: "no-plan",
  status: "no-plan",
  message: "No active coaching plan is approved yet.",
  localCue: "Settle a goal and approve a plan before relying on daily coaching.",
  goal: null,
  plan: null,
  planVersion: null,
  session: null,
  scheduleWarnings: [],
  links: { plan: "/dashboard/plan", calendar: "/dashboard/calendar", session: null },
});

test("Plan keeps the active version in focus across Today navigation and hides superseded drafts", async ({ page }) => {
  const activePlan = validPlan({
    id: "plan_active_focus", version: 2, revision: 2, startsOn: "2026-08-09", endsOn: "2026-10-04",
    approval: { ...validPlan().approval, summary: "Approval record2" },
  });
  const supersededDraft = validProposal({ id: "superseded_draft", status: "withdrawn" });
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.activePlan(activePlan)) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.history([activePlan])) }));
  await page.route("**/api/v1/coaching/proposals/latest", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.latestProposal(supersededDraft)) }));
  await page.route("**/api/v1/coaching/context/current", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.currentContext(null)) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.today(noPlanToday)) }));

  await page.goto("/dashboard/plan");
  const activePlanRegion = page.getByRole("region", { name: "Active plan" });
  await expect(activePlanRegion).toContainText("Approval record2");
  await expect(page.getByLabel("Goal", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Create a new plan with Codex" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review saved draft" })).toHaveCount(0);

  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/plan$/);
  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("Approval record2");
  await expect(page.getByLabel("Goal", { exact: true })).toBeHidden();
  await expect(page.getByRole("heading", { name: "This page couldn’t load" })).toHaveCount(0);
});

test("Plan proposal validation exposes field-level repair details", async ({ page }) => {
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify(absentResponse()) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.history()) }));
  await page.route("**/api/v1/coaching/proposals/latest", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.latestProposal(null)) }));
  await page.route("**/api/v1/coaching/context/current", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.currentContext(null)) }));
  await page.route("**/api/v1/coaching/proposals/import", (route) => route.fulfill({
    status: 400,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: [{ path: ["proposal", "workouts", 0, "prescription"], message: "Required" }] } }),
  }));
  await page.goto("/dashboard/plan");
  await page.getByRole("button", { name: "Create a plan with Codex" }).click();
  await page.getByRole("button", { name: "I already have a proposal" }).click();
  await page.getByLabel("Codex proposal JSON").setInputFiles({ name: "invalid-proposal.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await page.getByRole("button", { name: "Import selected proposal" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "proposal.workouts.0.prescription" })).toContainText("proposal.workouts.0.prescription: Required");
});

test("Plan surfaces the latest saved draft without opening the creation workflow", async ({ page }) => {
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify(absentResponse()) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.history()) }));
  await page.route("**/api/v1/coaching/proposals/latest", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(coachingFixtures.latestProposal(validProposal())),
  }));
  await page.route("**/api/v1/coaching/context/current", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.currentContext(null)) }));

  await page.goto("/dashboard/plan");

  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("No plan is active yet");
  await expect(page.getByLabel("Goal", { exact: true })).toBeHidden();
  await expect(page.getByText("Draft proposal", { exact: true })).toBeHidden();
  await expect(page.getByText("A newer saved draft is ready for review.")).toBeVisible();
  await page.getByRole("button", { name: "Review saved draft" }).click();
  await expect(page.getByRole("heading", { name: "Review proposal" })).toBeFocused();
  await expect(page.getByText("Saved draft loaded for review. Nothing is active until you approve it.")).toBeVisible();
  await expect(page.getByText("Draft proposal", { exact: true })).toBeVisible();
  await expect(page.getByText("Autumn half marathon")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Easy run and strides" })).toBeVisible();
});

test("Plan treats documented no-plan absence as normal while independently restoring draft, history, and context", async ({ page }) => {
  const calls = { active: 0, history: 0, proposal: 0, context: 0 };
  await page.route("**/api/v1/coaching/plans/active", (route) => {
    calls.active += 1;
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "NOT_FOUND", message: "No active plan" } }) });
  });
  await page.route("**/api/v1/coaching/plans/history", (route) => {
    calls.history += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { plans: [] } }) });
  });
  await page.route("**/api/v1/coaching/proposals/latest", (route) => {
    calls.proposal += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { proposal: fixtureProposal() } }) });
  });
  await page.route("**/api/v1/coaching/context/current", (route) => {
    calls.context += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { context: fixtureContext() } }) });
  });

  await page.goto("/dashboard/plan");
  await expect.poll(() => Math.min(calls.active, calls.history, calls.proposal, calls.context)).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("alert").filter({ hasText: "Active-plan status could not be checked" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("No plan is active yet");
  await expect(page.getByRole("button", { name: "Review saved draft" })).toBeVisible();

  await page.getByRole("button", { name: "Review saved draft" }).click();
  await expect(page.getByRole("heading", { name: "Review proposal" })).toBeFocused();
  await page.getByRole("button", { name: "Import another proposal" }).click();
  await expect(page.getByRole("heading", { name: "Import your Codex proposal" })).toBeFocused();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Continue with your published context" })).toBeFocused();
  await expect(page.getByText("coaching-context.v1.json")).toBeVisible();
});

test("Today distinguishes loading, error recovery, and no-plan", async ({ page }) => {
  let serveInitialFailure = true;
  let releaseRequest!: () => void;
  const pendingRequest = new Promise<void>((resolve) => { releaseRequest = resolve; });
  await page.route("**/api/v1/coaching/today", async (route) => {
    if (serveInitialFailure) {
      await pendingRequest;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Synthetic Today outage" } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: noPlanToday }) });
  });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Loading today's coaching context…" })).toBeVisible();
  serveInitialFailure = false;
  releaseRequest();
  await expect(page.getByRole("heading", { name: "Today's coaching context is unavailable" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic Today outage" })).toBeVisible();
  await page.getByRole("button", { name: "Retry today" }).click();
  await expect(page.getByRole("heading", { name: "No active coaching plan yet" })).toBeVisible();
  await expect(page.getByText("No active plan", { exact: true })).toBeVisible();
});

test("Today shows stale context and specific links when the local Home snapshot is unavailable", async ({ page }) => {
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(coachingFixtures.today({
      date: "2026-08-05", sessionId: "session_synthetic", state: "stale", status: "stale",
      message: "Imported activity history changed after the active plan context was captured.",
      localCue: "Review the latest app-owned context before relying on the approved schedule; no plan change has been made.",
      goal: { id: "goal_synthetic", title: "Synthetic half marathon", why: "Synthetic purpose", targetDate: "2026-09-16", countdown: { days: 42, label: "42 days to target" } },
      plan: { id: "plan_synthetic", version: 3, startsOn: "2026-08-03", endsOn: "2026-09-16" },
      planVersion: 3,
      session: validCalendarSession({ id: "session_synthetic", title: "Synthetic threshold session", purpose: "Practice controlled effort.", prescription: "Run three controlled threshold intervals.", durationMinutes: 40, scheduledDate: "2026-08-05", prescribedDate: "2026-08-05", effectiveDate: "2026-08-05", originalDate: "2026-08-05" }),
      scheduleWarnings: ["Imported history is newer than the active plan context."],
      stale: { isStale: true, reason: "Imported activity history is newer than the active plan context." },
      links: { plan: "/dashboard/plan#active-plan-heading", calendar: "/dashboard/calendar", session: "/dashboard/calendar?session=session_synthetic&date=2026-08-05#session-session_synthetic" },
    })),
  }));

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Synthetic threshold session" })).toBeVisible();
  await expect(page.getByText("Approved prescription: Run three controlled threshold intervals.")).toBeVisible();
  await expect(page.getByText("Stale context", { exact: true })).toBeVisible();
  await expect(page.getByText("Imported activity history changed after the active plan context was captured.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View session" })).toHaveAttribute("href", /session_synthetic/);
  await expect(page.getByRole("link", { name: "Open active plan" })).toHaveAttribute("href", "/dashboard/plan#active-plan-heading");
});

test("Calendar deep links reveal a prescribed session outside the current week and show stale context", async ({ page }) => {
  const sessionDate = "2026-09-16";
  const requestedRanges: string[] = [];
  await page.clock.setFixedTime(new Date("2026-09-17T08:00:00.000+02:00"));
  await page.route("**/api/v1/coaching/calendar?**", (route) => {
    const request = new URL(route.request().url());
    const from = request.searchParams.get("from") ?? "2026-09-14";
    const to = request.searchParams.get("to") ?? "2026-10-11";
    requestedRanges.push(from);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(coachingFixtures.calendar([
        validCalendarSession({
          id: "session_deep_link", title: "Deep-link progression run", purpose: "Build controlled stamina.",
          prescription: "Run 50 minutes with a controlled final 10 minutes.", cautions: ["Keep the finish controlled."],
          durationMinutes: 50, distanceMeters: 8_000, intensityRpe: 5, startTime: "06:15", scheduledDate: sessionDate,
          prescribedDate: sessionDate, effectiveDate: sessionDate, originalDate: sessionDate,
        }),
      ], from, to)),
    });
  });
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(coachingFixtures.activePlan(validPlan({ id: "plan_deep_link", version: 2, startsOn: "2026-09-01", endsOn: "2026-09-30" }))),
  }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.today({ stale: { isStale: true, reason: "Imported activity history is newer than this plan." } })),
  }));

  await page.goto(`/dashboard/calendar?date=${sessionDate}&session=session_deep_link#session-session_deep_link`);
  await expect(page.getByRole("region", { name: "Four-week training calendar" })).toBeVisible();
  await expect(page.locator(".calendar-day")).toHaveCount(28);
  await expect(page.locator("section.calendar-day[aria-label='16 Sept 2026']")).toContainText("No run recorded");
  const panelHeights = await page.locator(".calendar-week-row").first().locator(".calendar-day").evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)));
  expect(new Set(panelHeights).size).toBe(1);
  const detail = page.getByRole("dialog", { name: "Plan details" });
  await expect(detail).toBeVisible();
  const card = detail.locator("#session-session_deep_link");
  await expect(card).toContainText("Current prescription: Run 50 minutes");
  await expect(card).toContainText("Approved source prescription");
  await expect(card).toContainText("Current target: 8 km · 50 min · RPE 5");
  await expect(page.getByRole("heading", { name: "Schedule context needs review" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Close details" })).toBeFocused();
  await detail.getByRole("button", { name: "Close details" }).click();
  const calendar = page.getByRole("region", { name: "Four-week training calendar" });
  await calendar.focus();
  await page.keyboard.press("PageDown");
  await expect.poll(() => requestedRanges).toContain("2026-09-21");
  await expect(page.locator(".calendar-range-announcement")).toContainText("21 Sept 2026");
  await calendar.dispatchEvent("touchstart", { touches: [{ identifier: 1, clientY: 80 }] });
  await calendar.dispatchEvent("touchend", { changedTouches: [{ identifier: 1, clientY: 220 }] });
  await expect.poll(() => requestedRanges.filter((range) => range === "2026-09-14").length).toBe(2);
  await expect(page.getByRole("dialog", { name: "Plan details" })).toHaveCount(0);
});

test("Calendar shows full recorded runs before current active-plan context", async ({ page }) => {
  const date = "2026-08-13";
  await page.route("**/api/v1/coaching/calendar?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {
      sessions: [{
        id: "active-plan-run", kind: "run", scheduledDate: date, prescribedDate: date, effectiveDate: date,
        originalDate: date, title: "Easy 10 km", purpose: "Maintain aerobic volume.", prescription: "Run 10 km at an easy effort.",
        cautions: [], durationMinutes: 60, distanceMeters: 10000, intensityRpe: 3, status: "upcoming", revision: 1, warnings: [],
      }],
      activities: [{
        id: "activity-recorded-run", athleteId: "e2e_athlete", localDate: date, title: "Morning Run",
        sport: "run", occurredAt: "2026-08-13T04:30:00.000Z", localOccurredAt: "2026-08-13T06:30:00.000Z",
        distanceM: 10000, elapsedTimeS: 3600, avgPaceSecPerKm: 360, elevationGainM: 120,
        hrAvailable: false, cadenceAvailable: false,
      }],
    } }),
  }));
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { id: "active-plan", startsOn: "2026-08-12", endsOn: "2026-10-04", timezone: "Africa/Johannesburg" } }),
  }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: { stale: { isStale: false, reason: null } } }),
  }));
  await page.route("**/api/v1/activities/activity-recorded-run", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: { activity: {
      id: "activity-recorded-run", athleteId: "e2e_athlete", title: "Morning Run", sport: "run",
      occurredAt: "2026-08-13T04:30:00.000Z", localOccurredAt: "2026-08-13T06:30:00.000Z", endedAt: "2026-08-13T05:30:00.000Z",
      sourceType: "manual", distanceM: 10000, elapsedTimeS: 3600, avgPaceSecPerKm: 360, elevationGainM: 120, elevationLossM: 95,
      hrAvailable: false, cadenceAvailable: false, dedupeHash: "a".repeat(64), createdAt: "2026-08-13T05:31:00.000Z", splits: [], routeSignature: null,
    } } }),
  }));

  await page.goto(`/dashboard/calendar?date=${date}`);
  await expect(page.locator(".calendar-day")).toHaveCount(28);
  await expect(page.locator("section.calendar-day[aria-label='14 Aug 2026']")).toContainText("No run recorded");
  await page.getByRole("button", { name: "View details for 13 Aug 2026" }).click();
  const detail = page.getByRole("dialog", { name: "Run details" });
  await expect(detail.getByRole("heading", { name: "Morning Run" })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Run at a glance" })).toBeVisible();
  await expect(detail).toContainText("10.00 km");
  await expect(detail).toContainText("Active plan · session scheduled for this date");
  await expect(detail).toContainText(/does not indicate that any recorded run completed the prescription/i);
  await expect(detail).toContainText("Run 10 km at an easy effort.");
  await expect(detail).not.toContainText("historical plan");
});

test("Calendar recovers from errors, marks today, and warns before conflicting or out-of-range moves on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const today = localDate();
  const tomorrow = addDays(today, 1);
  const planEnd = addDays(today, 14);
  let calendarFails = true;
  await page.route("**/api/v1/coaching/calendar?**", (route) => {
    if (calendarFails) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Synthetic calendar outage" } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { sessions: [
      { id: "session_today", kind: "run", title: "Today easy run", purpose: "Build consistency.", prescription: "Run easily for 35 minutes.", durationMinutes: 35, scheduledDate: today, prescribedDate: today, effectiveDate: today, status: "upcoming", revision: 1, warnings: [] },
      { id: "session_tomorrow", kind: "strength", title: "Tomorrow strength", purpose: "Support running.", prescription: "Complete two controlled sets.", durationMinutes: 25, scheduledDate: tomorrow, prescribedDate: tomorrow, effectiveDate: tomorrow, status: "upcoming", revision: 1, warnings: [] },
      { id: "session_future_two", kind: "run", title: "Future easy run", purpose: "Build consistency.", prescription: "Run easily for 30 minutes.", durationMinutes: 30, scheduledDate: addDays(today, 2), prescribedDate: addDays(today, 2), effectiveDate: addDays(today, 2), status: "upcoming", revision: 1, warnings: [] },
    ] } }) });
  });
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "plan_mobile", version: 1, startsOn: today, endsOn: planEnd } }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { stale: { isStale: false, reason: null } } }) }));

  await page.goto(`/dashboard/calendar?date=${today}`);
  await expect(page.getByRole("heading", { name: "Calendar could not be loaded" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic calendar outage" })).toContainText("Synthetic calendar outage");
  calendarFails = false;
  await page.getByRole("button", { name: "Retry calendar" }).click();
  const todayCard = page.locator("#session-session_today");
  await expect(todayCard).toBeVisible();
  await expect(todayCard.getByText("Today", { exact: true })).toBeVisible();
  await expect(todayCard.getByRole("button", { name: "Amend session" })).toHaveCount(0);
  await expect(todayCard).toContainText("Past and current-day sessions are read-only");

  const tomorrowCard = page.locator("#session-session_tomorrow");
  await tomorrowCard.getByLabel("Move to date").fill(addDays(today, 2));
  const reviewMoveButton = tomorrowCard.getByRole("button", { name: "Review move" });
  await reviewMoveButton.click();
  let dialog = page.getByRole("alertdialog", { name: "Confirm reschedule" });
  await expect(dialog.getByLabel("Reason for this change")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(reviewMoveButton).toBeFocused();
  await reviewMoveButton.click();
  dialog = page.getByRole("alertdialog", { name: "Confirm reschedule" });
  await expect(dialog.getByRole("alert")).toContainText("Same-day conflict");
  await dialog.getByRole("button", { name: "Confirm change" }).click();
  await expect(dialog.getByLabel("Reason for this change")).toBeFocused();
  await dialog.getByLabel("Reason for this change").fill("Avoid overlapping work meetings.");
  await expect(dialog.getByRole("button", { name: "Confirm change" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await tomorrowCard.getByLabel("Move to date").fill(addDays(planEnd, 1));
  await tomorrowCard.getByRole("button", { name: "Review move" }).click();
  dialog = page.getByRole("alertdialog", { name: "Confirm reschedule" });
  await expect(dialog.getByRole("alert")).toContainText("Outside approved plan range");
  await expect(dialog.getByRole("button", { name: "Confirm change" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("Calendar saves a reasoned future-session amendment and preserves its approved source", async ({ page }) => {
  const today = localDate();
  const sessionDate = addDays(today, 1);
  const original = {
    id: "session_reasoned_amendment", kind: "run", title: "Approved aerobic run",
    purpose: "Build aerobic durability.", prescription: "Run easily for 50 minutes.",
    cautions: ["Keep the effort conversational."], durationMinutes: 50, distanceMeters: 8000,
    intensityRpe: 4, startTime: "06:00", scheduledDate: sessionDate,
  };
  let effective = { ...original, prescribedDate: sessionDate, effectiveDate: sessionDate, originalDate: sessionDate, status: "upcoming", revision: 1, warnings: [], original, amendments: [] as Record<string, unknown>[] };
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "plan_reasoned", startsOn: today, endsOn: addDays(today, 30), timezone: "Africa/Johannesburg" } }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { stale: { isStale: false, reason: null } } }) }));
  await page.route("**/api/v1/coaching/calendar?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { sessions: [effective] } }) }));
  await page.route("**/api/v1/coaching/calendar/sessions/session_reasoned_amendment/edits", async (route) => {
    const request = route.request().postDataJSON();
    expect(request).toMatchObject({ operation: "amend", expectedRevision: 1, reason: "Work travel leaves a shorter treadmill window." });
    expect(request.changes).toMatchObject({ prescription: "Run easily on the treadmill for 30 minutes.", durationMinutes: 30 });
    effective = {
      ...effective,
      prescription: request.changes.prescription,
      durationMinutes: request.changes.durationMinutes,
      revision: 2,
      amendments: [{ id: "amendment_2", planId: "plan_reasoned", sessionId: original.id, operation: "amend", actor: "owner", changedAt: new Date().toISOString(), reason: request.reason, changedFields: ["prescription", "durationMinutes"], before: { prescription: original.prescription, durationMinutes: 50 }, after: { prescription: request.changes.prescription, durationMinutes: 30 }, expectedRevision: 1, resultingRevision: 2 }],
    };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session: effective, operation: "amend" } }) });
  });

  await page.goto(`/dashboard/calendar?date=${sessionDate}`);
  const sessionDay = page.locator(".calendar-day").filter({ hasText: "Approved aerobic run" });
  const sessionDetailButton = sessionDay.getByRole("button", { name: /View details for/ });
  await sessionDetailButton.click();
  let planDetail = page.getByRole("dialog", { name: "Plan details" });
  let card = planDetail.locator("#session-session_reasoned_amendment");
  const amendButton = card.getByRole("button", { name: "Amend session" });
  await amendButton.click();
  let dialog = page.getByRole("dialog", { name: "Amend future session" });
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(sessionDetailButton).toBeFocused();
  await sessionDetailButton.click();
  planDetail = page.getByRole("dialog", { name: "Plan details" });
  card = planDetail.locator("#session-session_reasoned_amendment");
  const reopenedAmendButton = card.getByRole("button", { name: "Amend session" });
  await reopenedAmendButton.click();
  dialog = page.getByRole("dialog", { name: "Amend future session" });
  const saveAmendment = dialog.getByRole("button", { name: "Save reasoned amendment" });
  await expect(saveAmendment).toBeDisabled();
  await dialog.getByLabel("Reason for this amendment").fill("Work travel leaves a shorter treadmill window.");
  await expect(saveAmendment).toBeDisabled();
  await dialog.getByLabel("Title").fill("");
  await expect(saveAmendment).toBeEnabled();
  await saveAmendment.click();
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await dialog.getByLabel("Title").fill("Approved aerobic run");
  await expect(saveAmendment).toBeDisabled();
  await dialog.getByLabel("Prescription").fill("Run easily on the treadmill for 30 minutes.");
  await dialog.getByLabel("Duration (minutes)").fill("30");
  await expect(saveAmendment).toBeEnabled();
  await saveAmendment.click();
  await expect(page.getByRole("status").filter({ hasText: "Session amended" })).toBeVisible();
  await sessionDetailButton.click();
  planDetail = page.getByRole("dialog", { name: "Plan details" });
  card = planDetail.locator("#session-session_reasoned_amendment");
  await expect(card).toContainText("Current prescription: Run easily on the treadmill for 30 minutes.");
  await card.getByText("Approved source prescription").click();
  await expect(card).toContainText("Run easily for 50 minutes.");
  await card.getByText("Change history (1)").click();
  await expect(card).toContainText("Work travel leaves a shorter treadmill window.");
});

test("Settings rehydrates prepared handoff status and its coaching-context reference", async ({ page }) => {
  await page.route("**/api/v1/coaching/reminder-preferences", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(coachingFixtures.reminderPreferences({ externalStatus: "prepared", externalReference: "Coach Exchange/Generated/coaching-context.v1.json" })),
  }));
  await page.route("**/api/v1/coaching/context/current", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(coachingFixtures.currentContext(validContext())),
  }));
  await page.goto("/dashboard/settings");
  await page.locator("details.settings-group").filter({ hasText: "Recurring motivation setup" }).locator("summary").click();
  await expect(page.getByRole("heading", { name: "Recurring motivation setup" })).toBeVisible();
  await expect(page.locator(".status-chip").filter({ hasText: "Prepared for Codex" })).toBeVisible();
  await expect(page.getByText("Not scheduled — handoff prepared")).toBeVisible();
  await expect(page.getByText("Prepared artifact: Coach Exchange/Generated/coaching-context.v1.json")).toBeVisible();
});

test("Today keeps a missed-session warning and actions usable at the mobile baseline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {
      date: "2026-08-06",
      timezone: "America/Los_Angeles",
      state: "missed",
      message: "Synthetic easy run was scheduled for 2026-08-05 and is still marked upcoming.",
      localCue: "Check the past session in Calendar before choosing today's training; no plan change has been made.",
      goal: { id: "goal_mobile", title: "Synthetic consistency goal", why: "Synthetic purpose", targetDate: "2026-09-01", countdown: { days: 26, label: "26 days to target" } },
      plan: { id: "plan_mobile", version: 1, startsOn: "2026-08-03", endsOn: "2026-09-01" },
      session: { id: "session_missed", status: "upcoming", title: "Synthetic easy run", purpose: "Build aerobic consistency.", durationMinutes: 35, scheduledDate: "2026-08-05", effectiveDate: "2026-08-05" },
      scheduleWarnings: ["Synthetic easy run is past and still marked upcoming. No automatic run review or plan change has occurred."],
      links: { plan: "/dashboard/plan#active-plan-heading", calendar: "/dashboard/calendar", session: "/dashboard/calendar?session=session_missed&date=2026-08-05#session-session_missed" },
    } }),
  }));

  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "Past session needs attention" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Missed · unconfirmed");
  await expect(card.getByRole("link", { name: "View session" })).toBeVisible();
  await expect(card.getByRole("link", { name: "Open active plan" })).toBeVisible();
  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("all current screens keep one active route and no horizontal overflow at desktop and tablet baselines", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);

    for (const route of currentScreenRoutes) {
      await page.goto(route.href);
      await expect(page).toHaveURL(new RegExp(`${route.href.replaceAll("/", "\\/")}$`));
      await expect(page.getByRole("heading", { level: 1, name: route.heading, exact: true })).toHaveCount(1);
      const currentLinks = page.getByLabel("Application navigation").locator('a[aria-current="page"]');
      await expect(currentLinks).toHaveCount(1);
      await expect(currentLinks).toHaveAccessibleName(new RegExp(`^${route.nav}`));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      if (viewport.width === 1024 && route.heading === "Calendar") {
        await expect(page.getByRole("button", { name: "Agenda", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: "Weeks", exact: true })).toHaveCount(0);
      }
    }

    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Your training dashboard, online" })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  }

  expect(pageErrors, "uncaught page errors").toEqual([]);
  expect(
    consoleErrors.filter((message) => !message.startsWith("Failed to load resource:")),
    "unexpected browser console errors",
  ).toEqual([]);
});

test("local Activities filters imported history and restores selected-row focus after mobile detail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const today = localDate();
  const activityTitle = "Synthetic coaching baseline";
  const activity = {
    id: "activity-local-focus",
    athleteId: "e2e_athlete",
    title: activityTitle,
    occurredAt: `${today}T04:00:00.000Z`,
    localOccurredAt: `${today}T06:00:00.000+02:00`,
    sport: "run",
    distanceM: 6_000,
    elapsedTimeS: 2_700,
    avgPaceSecPerKm: 450,
    elevationGainM: 20,
    hrAvailable: false,
    cadenceAvailable: false,
  };

  await page.route("**/api/v1/activities**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/v1/activities/activity-local-focus"
      ? { activity: {
        ...activity,
        sourceType: "gpx",
        endedAt: `${today}T04:45:00.000Z`,
        elevationLossM: 15,
        dedupeHash: "f".repeat(64),
        createdAt: `${today}T05:00:00.000Z`,
        splits: [],
        routeSignature: null,
      } }
      : { items: [activity] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/dashboard/activities");
  const initialState = page.getByRole("heading", { name: /No activities yet|Unable to load activities/ });
  await expect(initialState).toBeVisible();
  if (await page.getByRole("button", { name: "Try again" }).isVisible()) {
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Recent activities" })).toBeVisible();
  }
  await page.locator(".activity-filter-disclosure summary").click();
  await page.getByLabel("Search activities").fill(activityTitle);
  await page.getByLabel("Activity type").selectOption("run");
  await page.getByLabel("From").fill(today);
  await page.getByLabel("To", { exact: true }).fill(today);
  const filteredList = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/activities" && url.searchParams.get("search") === activityTitle;
  });
  await page.getByRole("button", { name: "Apply filters" }).click();
  const filterResponse = await filteredList;
  expect(filterResponse.ok()).toBe(true);
  const filterUrl = new URL(filterResponse.url());
  expect(filterUrl.searchParams.get("sport")).toBe("run");
  expect(filterUrl.searchParams.get("from")).toBe(today);
  expect(filterUrl.searchParams.get("to")).toBe(today);

  const activityRow = page.getByRole("button", { name: new RegExp(activityTitle) });
  await expect(activityRow).toBeVisible();
  await activityRow.click();
  await expect(page.getByRole("heading", { name: activityTitle })).toBeVisible();
  await page.locator("details.detail-disclosure").first().locator("summary").click();
  await expect(page.getByText("No additional telemetry was included in this activity.")).toBeVisible();
  await page.getByRole("button", { name: "Back to Training" }).click();
  await expect(activityRow).toBeVisible();
  await expect(activityRow).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("Activities presents a scannable Night Ops record for a run with telemetry, splits, and route data", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const activityId = "activity-night-ops-record";
  const activity = {
    id: activityId,
    athleteId: "e2e_athlete",
    title: "Morning Run",
    occurredAt: "2026-08-27T02:48:00.000Z",
    localOccurredAt: "2026-08-27T04:48:00.000+02:00",
    sport: "run",
    distanceM: 6_010,
    elapsedTimeS: 3_080,
    avgPaceSecPerKm: 513,
    elevationGainM: 119,
    hrAvailable: true,
    cadenceAvailable: true,
  };
  const split = (splitIndex: number, paceSecPerKm: number) => ({
    id: `${activityId}-split-${splitIndex}`,
    activityId,
    athleteId: "e2e_athlete",
    splitIndex,
    startOffsetS: splitIndex * 510,
    endOffsetS: (splitIndex + 1) * 510,
    durationS: 510,
    distanceM: 1_000,
    paceSecPerKm,
    elevGainM: 0,
    elevLossM: 0,
    createdAt: "2026-08-27T05:00:00.000Z",
  });

  await page.route("**/api/v1/activities**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === `/api/v1/activities/${activityId}`
      ? { activity: {
        ...activity,
        endedAt: "2026-08-27T03:39:20.000Z",
        sourceType: "gpx",
        elevationLossM: 88,
        avgHrBpm: 116,
        maxHrBpm: 137,
        avgCadenceSpm: 173,
        calories: 426,
        avgPowerW: 227,
        dedupeHash: "n".repeat(64),
        createdAt: "2026-08-27T05:00:00.000Z",
        splits: [split(0, 536), split(1, 550), split(2, 489)],
        routeSignature: {
          id: `${activityId}-route`, activityId, athleteId: "e2e_athlete",
          startLat: -29.8, startLon: 31, endLat: -29.74, endLon: 31,
          bboxMinLat: -29.8, bboxMinLon: 31, bboxMaxLat: -29.74, bboxMaxLon: 31,
          routeHash: "route-hash", createdAt: "2026-08-27T05:00:00.000Z",
        },
      } }
      : { items: [activity] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/dashboard/activities");
  await loadInterceptedTrainingHistory(page);
  await expect(page.getByRole("button", { name: /Morning Run/ })).toBeVisible();
  await page.getByRole("button", { name: /Morning Run/ }).click();

  await expect(page.getByRole("heading", { name: "Run at a glance" })).toBeVisible();
  await expect(page.getByText("Activity record", { exact: true })).toBeVisible();
  await openDetailDisclosures(page, 1);
  await expect(page.getByText("5 signals", { exact: true })).toBeVisible();
  await openDetailDisclosures(page, 2);
  const splits = page.getByRole("list", { name: "Per kilometre splits" });
  await expect(splits).toContainText("KM 01");
  await expect(splits).toContainText("8:56/km");
  await expect(splits).toContainText("KM 03");
  await expect(splits).toContainText("8:09/km");
  await openDetailDisclosures(page, 3);
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await expect(page.getByText("Route data is available for this activity.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
});

test("Activities exposes queued Coach's review feedback and renders the completed review", async ({ page }) => {
  const activityId = "activity-coach-review";
  const activity = {
    id: activityId,
    athleteId: "e2e_athlete",
    title: "Coach review run",
    occurredAt: "2026-08-27T02:48:00.000Z",
    localOccurredAt: "2026-08-27T04:48:00.000+02:00",
    sport: "run",
    distanceM: 8_200,
    elapsedTimeS: 2_890,
    avgPaceSecPerKm: 352,
    elevationGainM: 70,
    hrAvailable: false,
    cadenceAvailable: false,
  };
  let ready = false;
  const review = {
    id: "review-coach-review",
    athleteId: "e2e_athlete",
    activityId,
    revision: 1,
    inputFingerprint: "a".repeat(64),
    headline: "A controlled aerobic run",
    assessment: "The run delivered useful aerobic work close to the planned duration.",
    nextStep: "Keep the next easy run conversational.",
    comparison: {
      matchState: "suggested",
      planId: "plan-1",
      sessionId: "session-1",
      planVersion: 1,
      sessionTitle: "Easy run",
      plannedDurationMinutes: 45,
      actualDurationMinutes: 48.2,
      plannedDistanceMeters: 8_000,
      actualDistanceMeters: 8_200,
      plannedIntensityRpe: 3,
      actualPerceivedEffort: null,
      interpretation: "Elapsed time was 3.2 minutes over the effective prescription.",
    },
    evidence: [{ source: "activity", label: "Distance and elapsed time" }],
    limitations: ["Heart-rate data is unavailable, so intensity cannot be inferred from heart rate."],
    generatedAt: "2026-08-27T05:00:00.000Z",
    publishedAt: "2026-08-27T05:00:00.000Z",
    model: "test-model",
    promptVersion: "activity-coach-review.v1",
  };

  await page.route("**/api/v1/activities**", (route) => {
    const requestPath = new URL(route.request().url()).pathname;
    const body = requestPath === `/api/v1/activities/${activityId}`
      ? { activity: {
        ...activity,
        endedAt: "2026-08-27T03:36:10.000Z",
        sourceType: "gpx",
        elevationLossM: 62,
        dedupeHash: "c".repeat(64),
        createdAt: "2026-08-27T05:00:00.000Z",
        splits: [],
        routeSignature: null,
      } }
      : { items: [activity] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route(`**/api/v1/activities/${activityId}/coach-review`, async (route) => {
    if (route.request().method() === "POST") {
      ready = true;
      return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ data: {
        activityId, requestId: "request-coach-review", status: "queued", reused: false, updatedAt: "2026-08-27T05:00:00.000Z",
      } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {
      activityId, status: ready ? "ready" : "not_requested", review: ready ? review : null,
      requestId: ready ? "request-coach-review" : null, updatedAt: ready ? "2026-08-27T05:00:00.000Z" : null, readRevision: null,
    } }) });
  });

  await page.goto("/dashboard/activities");
  await loadInterceptedTrainingHistory(page);
  await expect(page.getByRole("button", { name: /Coach review run/ })).toBeVisible();
  await page.getByRole("button", { name: /Coach review run/ }).click();
  await expect(page.getByRole("heading", { name: "Coach's review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request coach feedback" })).toBeVisible();
  await page.getByRole("button", { name: "Request coach feedback" }).click();
  await expect(page.getByRole("button", { name: "Review queued" })).toBeVisible();
  await page.getByRole("button", { name: "Check for updated feedback" }).click();
  await expect(page.getByRole("heading", { name: "A controlled aerobic run" })).toBeVisible();
  await expect(page.getByText("Keep the next easy run conversational.")).toBeVisible();
  await page.getByText("Compare with the plan").click();
  await expect(page.getByText("Easy run", { exact: true })).toBeVisible();
  await page.getByText("Review evidence").click();
  await expect(page.getByText(/Heart-rate data is unavailable/)).toBeVisible();
});

test("core screens render without overflow with reduced motion and forced colors", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  expect(await page.evaluate(() => ({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    forcedColors: window.matchMedia("(forced-colors: active)").matches,
  }))).toEqual({ reducedMotion: true, forcedColors: true });

  for (const route of currentScreenRoutes) {
    await page.goto(route.href);
    await expect(page.getByRole("heading", { level: 1, name: route.heading, exact: true })).toBeVisible();
    await expect(page.getByLabel("Application navigation")
      .getByRole("link", { name: route.nav, exact: true })).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  }
});

test("core shell has no horizontal overflow at a compact viewport proxy", async ({ page }) => {
  test.setTimeout(90_000);
  const zoomProxy = { width: 720, height: 450 };
  await page.setViewportSize(zoomProxy);

  for (const route of currentScreenRoutes) {
    await page.goto(route.href);
    await expect(page.getByRole("heading", { level: 1, name: route.heading, exact: true })).toBeVisible();
    await expect(page.getByLabel("Application navigation")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(zoomProxy.width);
  }
});
