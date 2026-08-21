import { expect, test } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { e2eExchangePath } from "./fixture-paths.ts";
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
  await expect(page.getByRole("status").filter({ hasText: "Import finished" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Validation summary" })).toBeVisible();
  await expect(page.getByText("No corrective action is needed.")).toBeVisible();

  await page.goto("/dashboard/plan");
  await expect(page.getByRole("region", { name: "Active plan" })).toBeVisible();
  await expect(page.getByLabel("Goal", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Create a plan with Codex" }).click();
  await expect(page.getByRole("heading", { name: "Create a plan with Codex" })).toBeFocused();
  await page.getByLabel("Name").fill("Synthetic Athlete");
  await page.getByLabel("Goal", { exact: true }).fill("Run a confident synthetic half marathon");
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
  await expect(page.getByRole("status").filter({ hasText: /Context .* is ready/ })).toBeVisible();

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
  await expect(page.getByRole("status").filter({ hasText: "Draft imported for review. Nothing is active yet." })).toBeVisible();
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
  await expect(page.getByRole("region", { name: "Active goal" })).toContainText("Run a confident synthetic half marathon");
  await expect(page.getByRole("region", { name: "Active goal" })).toContainText("days to target");
  await expect(page.getByRole("link", { name: "Open this session" })).toHaveAttribute("href", /synthetic_easy_session/);
  await expect(page.getByRole("link", { name: "Open active plan" })).toHaveAttribute("href", "/dashboard/plan#active-plan-heading");

  await page.goto("/dashboard/calendar");
  await page.getByRole("button", { name: /Synthetic future aerobic run/ }).click();
  const sessionCard = page.locator("#session-synthetic_future_session");
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
  await page.getByRole("button", { name: /Synthetic future aerobic run/ }).click();
  await expect(sessionCard).toContainText("skipped");
  await expect(sessionCard.getByRole("button", { name: "Restore" })).toBeVisible();

  await sessionCard.getByRole("button", { name: "Restore" }).click();
  const restoreDialog = page.getByRole("alertdialog", { name: "Confirm restore" });
  await restoreDialog.getByLabel("Reason for this change").fill("Recovery is complete and the session is appropriate again.");
  await restoreDialog.getByRole("button", { name: "Confirm change" }).click();
  await expect(restoreDialog).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: /Synthetic future aerobic run/ }).click();
  await expect(sessionCard).toContainText("upcoming");
  await expect(sessionCard.getByRole("button", { name: "Skip" })).toBeVisible();
  await expect(sessionCard.getByLabel("Move to date")).toHaveValue(sameWeekConflictDate);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Synthetic easy aerobic run" })).toBeVisible();
  await expect(page.getByText("Plan v1")).toBeVisible();
  await expect(page.getByText(/synthetic coaching journey/).first()).toBeVisible();

  await page.goto("/dashboard/settings");
  await expect(page.getByLabel("Local time")).toHaveValue("06:30");
  await expect(page.getByLabel("IANA timezone")).toHaveValue("Africa/Johannesburg");
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeEnabled();
  await page.getByLabel("Local time").fill("07:15");
  await page.getByLabel("IANA timezone").fill("America/Los_Angeles");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Not configured" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Local time")).toHaveValue("07:15");
  await expect(page.getByLabel("IANA timezone")).toHaveValue("America/Los_Angeles");
  await page.getByRole("button", { name: "Generate handoff" }).click();
  await expect(page.getByLabel("Generated Codex reminder handoff")).toContainText("prepared, not yet scheduled");
  await expect(page.getByLabel("Generated Codex reminder handoff")).toContainText("Context artifact: Coach Exchange/Generated/coaching-context.v1.json");
  await expect(page.getByLabel("Generated Codex reminder handoff")).toContainText("Do not provide medical diagnosis or medical authority");
  await expect(page.getByLabel("Generated Codex reminder handoff")).toContainText("Do not review a completed run or claim automatic adaptation");
  await expect(page.getByText("Not scheduled — handoff prepared")).toBeVisible();
  await page.reload();
  await expect(page.locator(".status-chip").filter({ hasText: "Prepared for Codex" })).toBeVisible();
  await expect(page.getByText("Not scheduled — handoff prepared")).toBeVisible();
  await page.getByLabel("External task reference").fill("codex-task-e2e-confirmation");
  await page.getByRole("button", { name: "Confirm scheduled externally" }).click();
  await expect(page.getByRole("status").filter({ hasText: "app does not infer or verify external delivery" })).toBeVisible();
  await expect(page.getByText("Scheduled externally — user confirmed")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Scheduled externally — user confirmed")).toBeVisible();

  const generatedFiles = await readdir(path.join(e2eExchangePath, "Generated"));
  expect(generatedFiles.some((file) => file.endsWith(".tmp"))).toBe(false);
  expect(generatedFiles.some((file) => file.startsWith("codex-reminder-handoff.v1."))).toBe(true);

  await page.goto("/dashboard/plan");
  const replacementTargetDate = addDays(today, 56);
  await page.getByRole("button", { name: "Create a new plan with Codex" }).click();
  await page.getByLabel("Goal", { exact: true }).fill("Run a stronger synthetic half marathon");
  await page.getByLabel("Target date").fill(replacementTargetDate);
  await page.getByLabel("Why this matters").fill("Keep building the synthetic coaching habit with a reviewed progression.");
  await page.getByRole("button", { name: "Publish context for Codex" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Context .* is ready/ })).toBeVisible();
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
  await expect(page.getByRole("status").filter({ hasText: "Draft imported for review. Nothing is active yet." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("Approval record1");
  const versionHistory = page.getByRole("region", { name: "Approved plan version history" });
  await expect(versionHistory).toContainText("Approved record 1");
  await expect(versionHistory).toContainText("Active");

  await page.getByRole("button", { name: "Review and approve" }).click();
  const replacementDialog = page.getByRole("alertdialog", { name: "Activate this plan version?" });
  await expect(replacementDialog).toContainText("retires active plan v1");
  const decisionRequest = page.waitForRequest((request) => request.method() === "POST" && request.url().includes("/api/v1/coaching/proposals/") && request.url().endsWith("/decision"));
  await replacementDialog.getByRole("button", { name: "Confirm approve" }).click();
  expect((await decisionRequest).postDataJSON()).toMatchObject({ replacingPlanId: replacementContext.activePlan.id });
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
  let reminderStatus = "not_configured";
  const plan = { id: "plan_mobile_journey", version: 1, revision: 1, startsOn: weekStartsOn(today), endsOn: targetDate, status: "active" };
  const session = () => ({
    id: "session_mobile_journey", kind: "run", title: "Mobile confidence run",
    purpose: "Build confidence through repeatable easy running.", prescription: "Run easily for 40 minutes at conversational effort.",
    cautions: ["Stop if pain changes your gait."], durationMinutes: 40, distanceMeters: 6000, intensityRpe: 3,
    scheduledDate: tomorrow, prescribedDate: tomorrow, effectiveDate: moved ? moveDate : tomorrow,
    status: "upcoming", revision: moved ? 2 : 1, warnings: [],
  });
  const proposal = {
    id: "proposal_mobile_journey", version: 1, revision: 1, startsOn: weekStartsOn(today), endsOn: targetDate,
    status: "proposed", summary: "A conservative mobile coaching plan.", rationale: "Build consistent aerobic work.",
    workouts: [session()], weeklyStructure: [{ weekStartsOn: weekStartsOn(today), focus: "Consistency", sessionIds: ["session_mobile_journey"] }],
    assumptions: ["Easy running is currently appropriate."], cautions: ["Persistent pain needs professional review."],
    review: { historyStatus: "current", goalTitle: "Mobile half marathon", goalTarget: { kind: "performance", distanceMeters: 21100, targetDate }, materialDifferences: [{ field: "plan", change: "added", summary: "Creates the first approved plan." }] },
  };

  await page.route("**/api/v1/imports/upload", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { status: "completed", normalizedCount: 1, duplicateCount: 0, rejectedCount: 0, parseWarnings: [] } }) }));
  await page.route("**/api/v1/coaching/context/publish", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { artifactId: "context_mobile_journey" } }) }));
  await page.route("**/api/v1/coaching/proposals/import", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { proposal } }) }));
  await page.route("**/api/v1/coaching/proposals/proposal_mobile_journey/decision", (route) => {
    approved = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { plan } }) });
  });
  await page.route("**/api/v1/coaching/plans/active", (route) => approved
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: plan }) })
    : route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "No active plan" } }) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { plans: approved ? [plan] : [] } }) }));
  await page.route("**/api/v1/coaching/calendar?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { sessions: approved ? [session()] : [] } }) }));
  await page.route("**/api/v1/coaching/calendar/sessions/session_mobile_journey/edits", (route) => {
    moved = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: session() }) });
  });
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {
    date: today, timezone: "Africa/Johannesburg", state: "upcoming", message: "Your approved easy session supports the settled goal.",
    localCue: "Start gently and remember why consistency matters.", goal: { id: "goal_mobile_journey", title: "Mobile half marathon", targetDate, countdown: { label: "42 days to target" } },
    plan, session: { ...session(), effectiveDate: today }, stale: { isStale: false, reason: null }, scheduleWarnings: [],
    links: { plan: "/dashboard/plan#active-plan-heading", calendar: "/dashboard/calendar", session: `/dashboard/calendar?session=session_mobile_journey&date=${today}#session-session_mobile_journey` },
  } }) }));
  await page.route("**/api/v1/coaching/reminder-preferences", (route) => {
    if (route.request().method() === "PUT") reminderStatus = "not_configured";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { enabled: true, localTime: "06:30", timezone: "Africa/Johannesburg", externalStatus: reminderStatus } }) });
  });
  await page.route("**/api/v1/coaching/reminder-handoffs", (route) => {
    reminderStatus = "prepared";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { externalStatus: "prepared", handoff: "Prepared, not yet scheduled. Use the approved local coaching context." } }) });
  });
  await page.route("**/api/v1/coaching/reminder-handoffs/status", (route) => {
    reminderStatus = "scheduled";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { externalStatus: "scheduled", externalReference: "codex-mobile-task" } }) });
  });
  await page.route("**/api/v1/coaching/context/current", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { exchangeReference: "Coach Exchange/Generated/coaching-context.v1.json" } }) }));

  await page.goto("/dashboard/data-quality");
  await page.getByLabel("CSV or GPX file").setInputFiles({ name: "mobile-run.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(syntheticGpx(today)) });
  await page.getByRole("button", { name: "Import selected file" }).click();
  await expect(page.getByRole("heading", { name: "Validation summary" })).toBeVisible();

  await page.goto("/dashboard/plan");
  await page.getByRole("button", { name: "Create a plan with Codex" }).click();
  await page.getByLabel("Goal", { exact: true }).fill("Mobile half marathon");
  await page.getByLabel("Target date").fill(targetDate);
  await page.getByLabel("Why this matters").fill("Build confidence and consistency.");
  await page.getByRole("button", { name: "Publish context for Codex" }).click();
  await expect(page.getByRole("status").filter({ hasText: "context_mobile_journey" })).toBeVisible();
  await page.getByLabel("Codex proposal JSON").setInputFiles({ name: "mobile-plan.json", mimeType: "application/json", buffer: Buffer.from("{}") });
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
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByRole("button", { name: "Generate handoff" }).click();
  await expect(page.getByText("Not scheduled — handoff prepared")).toBeVisible();
  await page.getByLabel("External task reference").fill("codex-mobile-task");
  await page.getByRole("button", { name: "Confirm scheduled externally" }).click();
  await expect(page.getByText("Scheduled externally — user confirmed")).toBeVisible();
  await expect(page.getByText("Coach Exchange/Generated/coaching-context.v1.json")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

const noPlanToday = {
  date: "2026-08-05",
  timezone: "Africa/Johannesburg",
  state: "no-plan",
  message: "No active coaching plan is approved yet.",
  localCue: "Settle a goal and approve a plan before relying on daily coaching.",
  goal: null,
  plan: null,
  session: null,
  scheduleWarnings: [],
  links: { plan: "/dashboard/plan", calendar: "/dashboard/calendar", session: null },
};

test("Plan keeps the active version in focus across Today navigation and hides superseded drafts", async ({ page }) => {
  const activePlan = {
    id: "plan_active_focus",
    version: 2,
    revision: 2,
    startsOn: "2026-08-09",
    endsOn: "2026-10-04",
    timezone: "Africa/Johannesburg",
    status: "active",
    workouts: [],
  };
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: activePlan }) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { plans: [activePlan] } }) }));
  await page.route("**/api/v1/coaching/proposals/latest", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { proposal: { id: "superseded_draft", status: "proposed", version: 1, revision: 1 } } }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: noPlanToday }) }));

  await page.goto("/dashboard/plan");
  const activePlanRegion = page.getByRole("region", { name: "Active plan" });
  await expect(activePlanRegion).toContainText("Approval record2");
  await expect(page.getByLabel("Goal", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Create a new plan with Codex" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review saved draft" })).toHaveCount(0);

  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/plan$/);
  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("Approval record2");
  await expect(page.getByLabel("Goal", { exact: true })).toBeHidden();
  await expect(page.getByRole("heading", { name: "This page couldn’t load" })).toHaveCount(0);
});

test("Plan proposal validation exposes field-level repair details", async ({ page }) => {
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "No active plan" } }) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { plans: [] } }) }));
  await page.route("**/api/v1/coaching/proposals/import", (route) => route.fulfill({
    status: 400,
    contentType: "application/json",
    body: JSON.stringify({ error: { message: "Request validation failed", details: [{ path: ["proposal", "workouts", 0, "prescription"], message: "Required" }] } }),
  }));
  await page.goto("/dashboard/plan");
  await page.getByRole("button", { name: "Create a plan with Codex" }).click();
  await page.getByLabel("Codex proposal JSON").setInputFiles({ name: "invalid-proposal.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByRole("alert").filter({ hasText: "proposal.workouts.0.prescription" })).toContainText("proposal.workouts.0.prescription: Required");
});

test("Plan surfaces the latest saved draft without opening the creation workflow", async ({ page }) => {
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "No active plan" } }) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { plans: [] } }) }));
  await page.route("**/api/v1/coaching/proposals/latest", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { proposal: {
      id: "RP-HM-GATERITE-20261004-SUB2",
      status: "proposed",
      version: 1,
      revision: 1,
      startsOn: "2026-08-10",
      endsOn: "2026-10-04",
      summary: "Eight-week Gaterite Challenge half-marathon plan.",
      rationale: "Build recoverable race-specific fitness toward a conditional sub-two-hour goal.",
      assumptions: ["Wednesday recovery runs remain optional."],
      cautions: ["Monitor right-Achilles morning stiffness."],
      weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Absorb a supported long run", sessionIds: ["gaterite-w1-tue"] }],
      workouts: [{
        id: "gaterite-w1-tue", kind: "run", scheduledDate: "2026-08-11", title: "Easy run and strides",
        purpose: "Maintain rhythm.", prescription: "Run 8 km easy, then complete four relaxed strides.",
        cautions: ["Keep the easy running conversational."], durationMinutes: 60, distanceMeters: 8000, intensityRpe: 3,
      }],
      review: {
        historyStatus: "current", requiresStaleAcknowledgement: false,
        goalTitle: "Gaterite Challenge 21.1 km under 2:00:00",
        goalTarget: { kind: "performance", distanceMeters: 21097.5, targetTimeSeconds: 7199, targetDate: "2026-10-04", eventName: "Gaterite Challenge 21.1 km" },
        materialDifferences: [{ field: "plan", change: "initial", summary: "This would be the first approved plan." }],
      },
    } } }),
  }));

  await page.goto("/dashboard/plan");

  await expect(page.getByRole("region", { name: "Active plan" })).toContainText("No plan is active yet");
  await expect(page.getByLabel("Goal", { exact: true })).toBeHidden();
  await expect(page.getByText("Draft proposal", { exact: true })).toBeHidden();
  await expect(page.getByText("A newer saved draft is ready for review.")).toBeVisible();
  await page.getByRole("button", { name: "Review saved draft" }).click();
  await expect(page.getByRole("heading", { name: "Import and review proposal" })).toBeFocused();
  await expect(page.getByText("Saved draft loaded for review. Nothing is active until you approve it.")).toBeVisible();
  await expect(page.getByText("Draft proposal", { exact: true })).toBeVisible();
  await expect(page.getByText("Gaterite Challenge 21.1 km under 2:00:00")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Easy run and strides" })).toBeVisible();
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
  await page.getByRole("button", { name: "Retry Today" }).click();
  await expect(page.getByRole("heading", { name: "No active coaching plan yet" })).toBeVisible();
  await expect(page.getByText("No active plan", { exact: true })).toBeVisible();
});

test("Today shows stale context, goal countdown, warnings, and specific links", async ({ page }) => {
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {
      date: "2026-08-05",
      timezone: "Africa/Johannesburg",
      state: "stale",
      message: "Imported activity history changed after the active plan context was captured.",
      localCue: "Review the latest app-owned context before relying on the approved schedule; no plan change has been made.",
      goal: { id: "goal_synthetic", title: "Synthetic half marathon", why: "Synthetic purpose", targetDate: "2026-09-16", countdown: { days: 42, label: "42 days to target" } },
      plan: { id: "plan_synthetic", version: 3, startsOn: "2026-08-03", endsOn: "2026-09-16" },
      session: { id: "session_synthetic", status: "upcoming", title: "Synthetic threshold session", purpose: "Practice controlled effort.", prescription: "Run three controlled threshold intervals.", durationMinutes: 40, scheduledDate: "2026-08-05", effectiveDate: "2026-08-05" },
      scheduleWarnings: ["Imported history is newer than the active plan context."],
      links: { plan: "/dashboard/plan#active-plan-heading", calendar: "/dashboard/calendar", session: "/dashboard/calendar?session=session_synthetic&date=2026-08-05#session-session_synthetic" },
    } }),
  }));

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Synthetic threshold session" })).toBeVisible();
  await expect(page.getByText("Approved prescription: Run three controlled threshold intervals.")).toBeVisible();
  await expect(page.getByText("Stale context", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Active goal" })).toContainText("42 days to target");
  await expect(page.getByText("Schedule warnings", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open this session" })).toHaveAttribute("href", /session_synthetic/);
  await expect(page.getByRole("link", { name: "Open active plan" })).toHaveAttribute("href", "/dashboard/plan#active-plan-heading");
});

test("Calendar deep links reveal a prescribed session outside the current week and show stale context", async ({ page }) => {
  const sessionDate = "2026-09-16";
  await page.route("**/api/v1/coaching/calendar?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { sessions: [{
      id: "session_deep_link", kind: "run", title: "Deep-link progression run",
      purpose: "Build controlled stamina.", prescription: "Run 50 minutes with a controlled final 10 minutes.",
      cautions: ["Keep the finish controlled."], durationMinutes: 50, distanceMeters: 8000,
      intensityRpe: 5, startTime: "06:15", scheduledDate: sessionDate, prescribedDate: sessionDate,
      effectiveDate: sessionDate, originalDate: sessionDate, status: "upcoming", revision: 1, warnings: [],
    }] } }),
  }));
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { id: "plan_deep_link", version: 2, startsOn: "2026-09-01", endsOn: "2026-09-30" } }),
  }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { stale: { isStale: true, reason: "Imported activity history is newer than this plan." } } }),
  }));

  await page.goto(`/dashboard/calendar?date=${sessionDate}&session=session_deep_link#session-session_deep_link`);
  await expect(page.getByRole("region", { name: "Seven-day training week" })).toBeVisible();
  await expect(page.locator(".calendar-day")).toHaveCount(7);
  const card = page.locator("#session-session_deep_link");
  await expect(card).toContainText("Current prescription: Run 50 minutes");
  await expect(card).toContainText("Approved source prescription");
  await expect(card).toContainText("Current target: 8 km · 50 min · RPE 5");
  await expect(page.getByRole("heading", { name: "Schedule context needs review" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("session-session_deep_link");
});

test("Calendar shows recorded runs and retained historical plans together without inferring completion", async ({ page }) => {
  const date = "2026-08-13";
  await page.route("**/api/v1/coaching/calendar?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {
      sessions: [],
      activities: [{
        id: "activity-recorded-run", athleteId: "e2e_athlete", localDate: date, title: "Morning Run",
        sport: "run", occurredAt: "2026-08-13T04:30:00.000Z", localOccurredAt: "2026-08-13T06:30:00.000Z",
        distanceM: 10000, elapsedTimeS: 3600, avgPaceSecPerKm: 360, elevationGainM: 120,
        hrAvailable: false, cadenceAvailable: false,
      }],
      historicalSessions: [{
        id: "retired-plan-run", planId: "retired-plan", planVersion: 2, kind: "run", scheduledDate: date,
        title: "Easy 10 km", purpose: "Maintain aerobic volume.", prescription: "Run 10 km at an easy effort.",
        cautions: [], durationMinutes: 60, distanceMeters: 10000, intensityRpe: 3,
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

  await page.goto(`/dashboard/calendar?date=${date}`);
  await page.locator("details.calendar-supporting-records > summary").click();
  const actual = page.locator("#activity-activity-recorded-run");
  await expect(actual).toContainText("Morning Run");
  await expect(actual).toContainText("Actual workout: 10 km · 1:00:00 · 6:00/km · +120 m");
  await actual.locator("summary").click();
  await expect(actual).toContainText("Same-day plan records are shown below without inferring that any plan was completed.");
  await expect(actual).toContainText("Easy 10 km · historical plan v2");
  const historical = page.locator("#historical-session-retired-plan-retired-plan-run");
  await expect(historical).toContainText("Historical planned session · read-only.");
  await expect(historical).toContainText("Run 10 km at an easy effort.");
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
  const card = page.locator("#session-session_reasoned_amendment");
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
  await expect(amendButton).toBeFocused();
  await amendButton.click();
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
  await expect(card).toContainText("Current prescription: Run easily on the treadmill for 30 minutes.");
  await card.getByText("Approved source prescription").click();
  await expect(card).toContainText("Run easily for 50 minutes.");
  await card.getByText("Change history (1)").click();
  await expect(card).toContainText("Work travel leaves a shorter treadmill window.");
});

test("Settings rehydrates prepared handoff status and its coaching-context reference", async ({ page }) => {
  await page.route("**/api/v1/coaching/reminder-preferences", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { enabled: true, localTime: "06:30", timezone: "Africa/Johannesburg", externalStatus: "prepared" } }),
  }));
  await page.route("**/api/v1/coaching/context/current", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { exchangeReference: "Coach Exchange/Generated/coaching-context.v1.json" } }),
  }));
  await page.goto("/dashboard/settings");
  await expect(page.locator(".status-chip").filter({ hasText: "Prepared for Codex" })).toBeVisible();
  await expect(page.getByText("Not scheduled — handoff prepared")).toBeVisible();
  await expect(page.getByText("Coach Exchange/Generated/coaching-context.v1.json")).toBeVisible();
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
  await expect(card.getByRole("link", { name: "Open this session" })).toBeVisible();
  await expect(card.getByRole("link", { name: "Open active plan" })).toBeVisible();
  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
