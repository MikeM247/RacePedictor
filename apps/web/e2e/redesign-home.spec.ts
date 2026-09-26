import { expect, test, type Page } from "@playwright/test";
import { coachingFixtures, fixturePlan } from "./coaching-fixtures.ts";

const overview = {
  fetchStatus: "success",
  stale: { isStale: false },
  data: {
    predictionSummary: { athleteId: "f02-athlete", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "f02-model", generatedAt: "2026-09-15T08:00:00.000Z" },
    predictionOptions: [],
    driverContributions: [{ key: "load", label: "Recent load", contributionPct: -12, direction: "negative", confidence: 0.8 }],
    featureTrendPoints: [],
    importProgress: { status: "completed", stagedCount: 1, normalizedCount: 1, duplicateCount: 0, rejectedCount: 0 },
  },
};
const status = { athleteId: "f02-athlete", providerConnection: { state: "current", displayStatus: "connected" }, ingestion: { state: "current" }, activityData: { state: "current" }, localDevice: { state: "current" }, secondBrain: { state: "current" }, updatedAt: "2026-09-15T08:00:00.000Z" };
const latest = { id: "f02-latest", athleteId: "f02-athlete", title: "Latest pending run", occurredAt: "2026-09-15T06:00:00.000Z", localOccurredAt: "2026-09-15T08:00:00.000+02:00", sport: "run", distanceM: 8_000, elapsedTimeS: 2_400, avgPaceSecPerKm: 300, elevationGainM: 40, hrAvailable: true, cadenceAvailable: true };
const older = { ...latest, id: "f02-older", title: "Older reviewed run", occurredAt: "2026-09-14T06:00:00.000Z" };

type MatchState = "suggested" | "confirmed" | "ambiguous" | "unplanned" | "none";
type ReviewStatus = "not_requested" | "queued" | "processing" | "retry_wait" | "attention" | "ready";

const detail = (activity = latest) => ({ activity: { ...activity, endedAt: "2026-09-15T06:40:00.000Z", sourceType: "gpx", elevationLossM: 40, dedupeHash: "f".repeat(64), createdAt: "2026-09-15T07:00:00.000Z", splits: [], routeSignature: null } });
const review = (matchState: MatchState = "ambiguous", overrides: Record<string, unknown> = {}) => ({
  id: "f02-review", athleteId: "f02-athlete", activityId: latest.id, revision: 7, inputFingerprint: "f".repeat(64),
  headline: "A controlled recorded session.",
  assessment: "Pace remained controlled through the recorded session. This one session does not establish a target-race change.",
  nextStep: "If recovery remains normal, follow the approved easy session.",
  comparison: { matchState, planId: "plan-v2", sessionId: matchState === "confirmed" ? "session-v2" : null, planVersion: 2, sessionTitle: matchState === "confirmed" ? "Easy run" : null, plannedDurationMinutes: 45, actualDurationMinutes: 40, plannedDistanceMeters: 8_000, actualDistanceMeters: 8_000, plannedIntensityRpe: 3, actualPerceivedEffort: 3, interpretation: "The supplied comparison remains qualified and does not establish race readiness." },
  evidence: [{ source: "activity", label: "Recorded duration", reference: latest.id }], limitations: ["Heart-rate data was not supplied.", "The target-race effect is not established."],
  generatedAt: "2026-09-15T08:00:00.000Z", publishedAt: "2026-09-15T08:01:00.000Z", model: "f02-model", promptVersion: "f02.v1", ...overrides,
});

async function mockHome(page: Page, options: {
  activities?: typeof latest[];
  reviewStatus?: ReviewStatus;
  reviewData?: ReturnType<typeof review> | null;
  reviewFailure?: boolean;
  goalState?: "ready" | "projection_pending" | "goal_only" | "no_active_plan" | "unavailable";
} = {}) {
  const activities = options.activities ?? [latest];
  const reviewStatus = options.reviewStatus ?? "ready";
  const reviewData = options.reviewData === undefined ? review() : options.reviewData;
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: status }) }));
  await page.route("**/api/v1/activities**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/activities") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { items: activities } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail(path.endsWith(older.id) ? older : latest)) });
  });
  await page.route("**/api/v1/activities/*/coach-review", (route) => {
    if (options.reviewFailure) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Review service unavailable" } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { activityId: latest.id, status: reviewStatus, review: reviewData, requestId: reviewStatus === "not_requested" ? null : "f02-request", updatedAt: "2026-09-15T08:01:00.000Z", readRevision: reviewData?.revision ?? null } }) });
  });
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { athleteId: "f02-athlete", date: "2026-09-15", timezone: "Africa/Johannesburg", state: "rest", status: "rest", message: "Intentional recovery day.", goal: null, plan: { id: "f02-plan", version: 3, startsOn: "2026-09-14", endsOn: "2027-04-18" }, session: { id: "f02-rest", kind: "rest", scheduledDate: "2026-09-15", effectiveDate: "2026-09-15", status: "upcoming", title: "Rest", purpose: "Recovery", prescription: "Rest or gentle mobility.", durationMinutes: 0, amendments: [] }, todayScheduleKind: "prescribed_rest", nextWorkout: null, localCue: "Protect recovery today.", links: { plan: "/dashboard/plan", calendar: "/dashboard/calendar", session: null } } }) }));
  await page.route("**/api/v1/coaching/goal-context/active", (route) => {
    const goal = { id: "f02-goal", athleteId: "f02-athlete", revision: 2, title: "City marathon", why: "Complete the approved marathon target", target: { kind: "performance", distanceMeters: 42_195, targetDate: "2027-04-18", targetTimeSeconds: 14_400, eventName: "City Marathon" } };
    const plan = { id: "f02-plan", version: 3, revision: 2, startsOn: "2026-09-14", endsOn: "2027-04-18", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) };
    const context = options.goalState === "projection_pending" ? {
      state: "projection_pending", plan, goal: null, milestones: null, projection: null,
    } : options.goalState === "goal_only" ? {
      state: "goal_only", plan: null, goal, milestones: null, projection: null,
    } : options.goalState === "no_active_plan" ? {
      state: "no_active_plan", plan: null, goal: null, milestones: null, projection: null,
    } : options.goalState === "unavailable" ? {
      state: "unavailable", plan, goal: null, milestones: null, projection: null,
    } : {
      state: "ready", plan,
      goal,
      milestones: [{ id: "f02-half", title: "Half marathon", distanceMeters: 21_097.5, targetDate: "2027-02-01", targetTimeSeconds: 7_200, eventName: "February Half" }],
      projection: { contextHash: "b".repeat(64), publishedAt: "2026-09-15T08:00:00.000Z" },
    };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { context } }) });
  });
}

test("F02 Home keeps three groups ordered, presents a qualified latest review, and reads without writes", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`); });
  await mockHome(page);
  await page.goto("/dashboard");
  const groups = page.locator(".home-group");
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toHaveAttribute("aria-labelledby", "goal-and-milestone-heading");
  await expect(groups.nth(1)).toHaveAttribute("aria-labelledby", "today-focus-heading");
  await expect(groups.nth(2)).toHaveAttribute("aria-labelledby", "latest-activity-heading");
  await expect(page.getByRole("heading", { name: "City marathon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next milestone: Half marathon · February Half" })).toBeVisible();
  await expect(page.getByText(/Race-day progress cannot yet be assessed/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest pending run" })).toBeVisible();
  await expect(page.getByText("This one session does not establish a target-race change.")).toBeVisible();
  await expect(page.getByText(/Goal impact cannot be assessed from the available review evidence/)).toBeVisible();
  await expect(page.getByText(/Plan version 2/)).toBeVisible();
  await expect(page.getByText("Heart-rate data was not supplied.")).toBeVisible();
  await expect(page.getByText("This advisory review does not change your approved prescription.")).toBeVisible();
  const sessionLink = page.getByRole("link", { name: "View full session review" });
  await expect(sessionLink).toHaveAttribute("href", /activityId=f02-latest.*returnTo=%2Fdashboard/);
  await expect(page.getByRole("link", { name: "View calendar" })).toHaveAttribute("href", "/dashboard/calendar");
  await page.getByRole("button", { name: "View current-fitness details" }).click();
  await expect(page.getByRole("heading", { name: "Current-fitness estimate" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Home" }).click();
  await expect(page.getByRole("button", { name: "View current-fitness details" })).toBeFocused();
  await Promise.all([
    page.waitForURL(/\/dashboard\/activities\?activityId=f02-latest/),
    sessionLink.click(),
  ]);
  await expect(page).toHaveURL(/recovery=/);
  await expect(page.getByRole("heading", { name: "Latest pending run" })).toBeVisible();
  const telemetry = page.locator("details.detail-disclosure").first();
  await telemetry.locator("summary").click();
  await expect(telemetry).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "← Back to Home" }).click();
  await expect(page).toHaveURL(/recovery=/);
  await expect(page.getByRole("link", { name: "View full session review" })).toBeFocused();
  expect(writes).toEqual([]);
});

test("F02 restores the Home session launcher after Calendar browser Back", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  await mockHome(page);
  await page.unroute("**/api/v1/coaching/today");
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.today()) }));
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.activePlan(fixturePlan())) }));
  await page.route("**/api/v1/coaching/calendar**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.calendar()) }));

  await page.goto("/dashboard");
  const launcher = page.getByRole("link", { name: "View session" });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(page).toHaveURL(/\/dashboard\/calendar\?session=session_resume/);
  await expect(page.getByRole("heading", { name: "Plan details" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\?recovery=/);
  await expect(launcher).toBeFocused();
  expect(writes).toEqual([]);
});

test("F02 keeps the newest pending activity instead of substituting an older reviewed one", async ({ page }) => {
  await mockHome(page, { activities: [older, latest], reviewStatus: "queued", reviewData: null });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Latest pending run" })).toBeVisible();
  await expect(page.getByText("Review queued", { exact: true })).toBeVisible();
  await expect(page.getByText("Older reviewed run", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Goal impact cannot be assessed without sufficient review evidence/)).toBeVisible();
});

test("F02 makes review failure local to Recent training while the other groups remain usable", async ({ page }) => {
  await mockHome(page, { reviewFailure: true });
  await page.goto("/dashboard");
  await expect(page.getByText(/Feedback could not be checked/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your approved goal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intentional recovery day" })).toBeVisible();
});

test("F02 Home reports cloud projection pending without displaying inferred goal values", async ({ page }) => {
  await mockHome(page, { goalState: "projection_pending" });
  await page.goto("/dashboard");
  await expect(page.getByText(/waiting for paired-device publication/)).toBeVisible();
  await expect(page.getByText("City marathon", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Latest pending run" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View calendar" })).toBeVisible();
});

test("F02 Home distinguishes a settled goal without a plan from unavailable cloud goal context", async ({ page }) => {
  await mockHome(page, { goalState: "goal_only" });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "City marathon" })).toBeVisible();
  await expect(page.getByText(/no active approved plan with milestones/)).toBeVisible();
  await expect(page.getByText(/Race-day progress cannot yet be assessed/)).toHaveCount(0);

  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: { context: { state: "unavailable", plan: null, goal: null, milestones: null, projection: null } } }),
  }));
  await page.reload();
  await expect(page.getByText(/could not be verified/)).toBeVisible();
  await expect(page.getByText("City marathon", { exact: true })).toHaveCount(0);
});

for (const [state, label] of [["suggested", "Suggested plan match — not confirmed"], ["confirmed", "Confirmed plan match"], ["ambiguous", "Plan match is uncertain"], ["unplanned", "Unplanned session"], ["none", "No planned session linked"]] as const) {
  test(`F02 preserves the ${state} match qualification`, async ({ page }) => {
    await mockHome(page, { reviewData: review(state) });
    await page.goto("/dashboard");
    await expect(page.getByText(label, { exact: false })).toBeVisible();
    await expect(page.getByText(/does not establish race readiness/)).toBeVisible();
  });
}

for (const [state, label] of [["not_requested", "No review requested"], ["queued", "Review queued"], ["processing", "Review in progress"], ["retry_wait", "Review delayed"], ["attention", "Review needs attention"], ["ready", "Reviewed"]] as const) {
  test(`F02 retains the ${state} review status`, async ({ page }) => {
    const data = state === "ready" ? review() : null;
    await mockHome(page, { reviewStatus: state, reviewData: data });
    await page.goto("/dashboard");
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    if (state !== "ready") await expect(page.getByText(/Goal impact cannot be assessed without sufficient review evidence/)).toBeVisible();
  });
}

test("F02 keeps long caveats readable without horizontal overflow at contract widths", async ({ page }) => {
  const longReview = review("ambiguous", {
    assessment: `The supplied assessment has no safe short summary because ${Array.from({ length: 72 }, () => "the qualification must remain visible").join(" ")} rather than being reduced to a stronger claim for the runner.`,
    limitations: ["This material limitation is intentionally long so that the visual check proves it wraps in the Home sequence, remains readable beside the review it qualifies, and is never hidden merely to make the default screen shorter."],
  });
  await mockHome(page, { reviewData: longReview });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");
    await expect(page.getByText(/Full review passage shown because safely shortening/)).toBeVisible();
    await expect(page.getByText(/This material limitation is intentionally long/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test("F02 Home reflows without overflow at the 200% zoom effective viewport", async ({ page }) => {
  await mockHome(page);
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "City marathon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intentional recovery day" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(720);
});

test("F02 records first-screen summaries at common phone and desktop heights", async ({ page }) => {
  await mockHome(page);
  const review: Array<{ width: number; height: number; goalPanelBottom: number; todaySummaryBottom: number; activityIdentityBottom: number; activityTakeawayBottom: number; goalAndTodayFit: boolean; allGroupsFit: boolean }> = [];
  for (const { width, height } of [{ width: 390, height: 844 }, { width: 1024, height: 900 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize({ width, height });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "City marathon" })).toBeVisible();
    const layout = await page.evaluate(() => {
      const bottom = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        return element ? Math.ceil(element.getBoundingClientRect().bottom) : 0;
      };
      const goalPanelBottom = bottom(".home-goal-content--ready");
      const todaySummaryBottom = bottom(".home-today .today-coach-card");
      const activityIdentityBottom = bottom(".home-activity .home-session-heading");
      const activityTakeawayBottom = bottom(".home-activity .home-review-commentary");
      return {
        height: window.innerHeight,
        goalPanelBottom,
        todaySummaryBottom,
        activityIdentityBottom,
        activityTakeawayBottom,
        goalAndTodayFit: goalPanelBottom > 0 && todaySummaryBottom > 0 && todaySummaryBottom <= window.innerHeight,
        allGroupsFit: goalPanelBottom > 0 && todaySummaryBottom > 0 && activityTakeawayBottom > 0 && activityTakeawayBottom <= window.innerHeight,
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    expect(layout.noHorizontalOverflow).toBe(true);
    review.push({ width, height, goalPanelBottom: layout.goalPanelBottom, todaySummaryBottom: layout.todaySummaryBottom, activityIdentityBottom: layout.activityIdentityBottom, activityTakeawayBottom: layout.activityTakeawayBottom, goalAndTodayFit: layout.goalAndTodayFit, allGroupsFit: layout.allGroupsFit });
    await test.info().attach(`home-${width}-first-screen.png`, { body: await page.screenshot(), contentType: "image/png" });
  }
  expect(review[0]?.goalAndTodayFit).toBe(true);
  expect(review[1]?.allGroupsFit).toBe(true);
  expect(review[2]?.allGroupsFit).toBe(true);
  test.info().annotations.push({ type: "first-screen-layout", description: JSON.stringify(review) });
});
