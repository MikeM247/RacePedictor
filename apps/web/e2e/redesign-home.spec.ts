import { expect, test, type Page } from "@playwright/test";
import { coachingFixtures, fixturePlan, fixtureCalendarSession } from "./coaching-fixtures.ts";
import { assertHomeLayout } from "./home-layout-assertions.ts";
import { expectAxeClean } from "./test-helpers.ts";
import type { RaceMilestone } from "../../../packages/core/src/contracts/coaching.ts";

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
  goalTitle?: string;
  checkIn?: { revision: number; status: "saved" | "skipped"; answers: Record<string, unknown> };
  milestones?: RaceMilestone[];
  today?: ReturnType<typeof coachingFixtures.today>;
} = {}) {
  const activities = options.activities ?? [latest];
  const reviewStatus = options.reviewStatus ?? "ready";
  const reviewData = options.reviewData === undefined ? review() : options.reviewData;
  let checkIn = options.checkIn ?? { revision: 1, status: "saved" as const, answers: { overallFeeling: "good" } };
  await page.route("**/api/v1/coaching/race-history", route => route.fulfill({ json: { data: { items: [], publishedAt: null } } }));
  await page.route("**/api/v1/dashboard/appearance", route => route.fulfill({ json: { data: { heroImageUrl: "/road-to-comrades.webp" } } }));
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: status }) }));
  await page.route("**/api/v1/wellbeing-check-ins**", async (route) => {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (route.request().method() === "GET") {
      const entry = checkIn ? { id: "f02-checkin", athleteId: "f02-athlete", localDate: date, timezone: "Africa/Johannesburg", answers: checkIn.answers, status: checkIn.status, recordedAt: "2026-10-12T08:00:00.000Z", skippedAt: null, revision: checkIn.revision, questionnaireVersion: "daily-wellbeing.v1", createdAt: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-12T08:00:00.000Z" } : null;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { items: entry ? [entry] : [] } }) });
    }
    const request = route.request().postDataJSON() as { expectedRevision: number; status: "saved" | "skipped"; answers: Record<string, unknown> };
    const entry = { id: "f02-checkin", athleteId: "f02-athlete", localDate: date, timezone: "Africa/Johannesburg", answers: request.answers, status: request.status, recordedAt: new Date().toISOString(), revision: request.expectedRevision + 1 };
    checkIn = { revision: entry.revision, status: entry.status, answers: entry.answers };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: entry }) });
  });
  await page.route("**/api/v1/activities**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/activities") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { items: activities } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail(path.endsWith(older.id) ? older : latest)) });
  });
  await page.route("**/api/v1/coaching/calendar**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { from: "2026-09-14", to: "2026-09-20", timezone: "Africa/Johannesburg", sessions: [], activities: [], activitiesReadStatus: "available" } }) }));
  await page.route("**/api/v1/activities/*/coach-review", (route) => {
    if (options.reviewFailure) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Review service unavailable" } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { activityId: latest.id, status: reviewStatus, review: reviewData, requestId: reviewStatus === "not_requested" ? null : "f02-request", updatedAt: "2026-09-15T08:01:00.000Z", readRevision: reviewData?.revision ?? null } }) });
  });
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { athleteId: "f02-athlete", date: "2026-09-15", timezone: "Africa/Johannesburg", state: "rest", status: "rest", message: "Intentional recovery day.", goal: null, plan: { id: "f02-plan", version: 3, startsOn: "2026-09-14", endsOn: "2027-04-18" }, session: { id: "f02-rest", kind: "rest", scheduledDate: "2026-09-15", effectiveDate: "2026-09-15", status: "upcoming", title: "Rest", purpose: "Recovery", prescription: "Rest or gentle mobility.", durationMinutes: 0, amendments: [] }, todayScheduleKind: "prescribed_rest", nextWorkout: null, localCue: "Protect recovery today.", links: { plan: "/dashboard/plan", calendar: "/dashboard/calendar", session: null } } }) }));
  await page.route("**/api/v1/coaching/goal-context/active", (route) => {
    const goalTitle = options.goalTitle ?? "City marathon";
    const goal = { id: "f02-goal", athleteId: "f02-athlete", revision: 2, title: goalTitle, why: "Complete the approved marathon target", target: { kind: "performance", distanceMeters: 42_195, targetDate: "2027-04-18", targetTimeSeconds: 14_400, eventName: goalTitle } };
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
      milestones: options.milestones ?? [{ id: "f02-half", title: "Oldies 10 km sub-60", distanceMeters: 10_000, targetDate: "2027-02-01", targetTimeSeconds: 3_600, eventName: "JGS Oldies 10 km" }],
      projection: { contextHash: "b".repeat(64), publishedAt: "2026-09-15T08:00:00.000Z" },
    };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { context } }) });
  });
  if (options.today) await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(options.today) }));
}

test("Home shows the approved goal, next workout, latest run and milestone without a page-load write", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`); });
  await mockHome(page);
  await page.goto("/dashboard");
  const groups = page.locator(".home-group");
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toHaveAttribute("aria-labelledby", "goal-and-milestone-heading");
  await expect(groups.nth(1)).toHaveAttribute("aria-labelledby", "latest-activity-heading");
  await expect(groups.nth(2)).toHaveAttribute("aria-labelledby", "today-focus-heading");
  await expect(page.getByRole("heading", { name: "City marathon" })).toBeVisible();
  await expect(page.getByRole("link", { name: "JGS Oldies 10 km", exact: true })).toBeVisible();
  await expect(page.locator(".road-timeline-group--ahead .road-stop")).toHaveText(["JGS Oldies 10 km", "City marathon"]);
  await expect(page.getByRole("heading", { name: "Intentional recovery day" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest pending run" })).toBeVisible();
  await expect(page.getByText("This one session does not establish a target-race change.")).toHaveCount(0);
  await expect(page.getByText("Plan adherence", { exact: true })).toHaveCount(0);
  await expect(page.locator(".home-activity")).not.toContainText("Plan version 2");
  await expect(page.getByText("Heart-rate data was not supplied.")).toHaveCount(0);
  await expect(page.getByText("Performance", { exact: true })).toHaveCount(0);
  const sessionLink = page.getByRole("link", { name: "Review run" });
  await expect(sessionLink).toHaveAttribute("href", /activityId=f02-latest.*returnTo=%2Fdashboard/);
  await expect(page.getByRole("link", { name: "View calendar" })).toHaveAttribute("href", "/dashboard/calendar");
  await page.getByRole("link", { name: "Readiness" }).click();
  await expect(page).toHaveURL(/\/dashboard\/readiness/);
  await expect(page.getByRole("heading", { name: "Current-fitness estimate" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await Promise.all([
    page.waitForURL(/\/dashboard\/activities\?activityId=f02-latest/),
    sessionLink.click(),
  ]);
  await expect(page).toHaveURL(/recovery=/);
  await expect(page.getByRole("heading", { name: "Latest pending run" })).toBeVisible();
  const telemetry = page.locator("details.detail-disclosure").first();
  if (!await telemetry.evaluate((element) => element.hasAttribute("open"))) await telemetry.locator("summary").click();
  await expect(telemetry).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "← Back to Home" }).click();
  await expect(page).toHaveURL(/recovery=/);
  await expect(page.getByRole("link", { name: "Review run" })).toBeFocused();
  expect(writes).toEqual([]);
});

test("Home keeps the full hero photo and brings milestones into view on desktop", async ({ page }, testInfo) => {
  await mockHome(page);
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "City marathon" })).toBeVisible();
    await expect(page.getByText("Every run has a reason.", { exact: true })).toBeVisible();
    await expect(page.locator(".road-journey")).toBeVisible();

    if (viewport.width === 1366) {
      const footer = await page.locator(".road-hero-footer").boundingBox();
      const journey = await page.locator(".road-journey").boundingBox();
      const actions = await page.locator(".road-journey-actions").boundingBox();
      const photo = await page.locator(".road-hero-photo").boundingBox();
      expect(footer).not.toBeNull();
      expect(journey).not.toBeNull();
      expect(actions).not.toBeNull();
      expect(photo).not.toBeNull();
      expect(journey!.y - (footer!.y + footer!.height)).toBeGreaterThanOrEqual(16);
      expect(journey!.y - (footer!.y + footer!.height)).toBeLessThanOrEqual(24);
      expect(journey!.y + journey!.height).toBeLessThanOrEqual(viewport.height);
      expect(actions!.y + actions!.height).toBeLessThanOrEqual(viewport.height);
      expect(photo!.width / photo!.height).toBeCloseTo(1672 / 941, 2);
      await expect(page.getByRole("link", { name: "JGS Oldies 10 km", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Manage achievements" })).toBeVisible();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`home-${viewport.width}x${viewport.height}.png`) });
  }
});

test("Home lets long goal titles expand the hero before the milestone panel", async ({ page }) => {
  const longTitle = "The Johannesburg City Marathon And Comrades Ultra Distance Challenge For 2027";
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockHome(page);
  await page.goto("/dashboard");
  const regularPanelTop = (await page.locator(".road-journey").boundingBox())!.y;

  await mockHome(page, { goalTitle: longTitle });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: longTitle, exact: true })).toBeVisible();
  const title = await page.locator(".road-hero-content h2").boundingBox();
  const footer = await page.locator(".road-hero-footer").boundingBox();
  const panel = await page.locator(".road-journey").boundingBox();
  expect(title).not.toBeNull();
  expect(footer).not.toBeNull();
  expect(panel).not.toBeNull();
  expect(title!.y + title!.height).toBeLessThan(footer!.y);
  expect(panel!.y - (footer!.y + footer!.height)).toBeGreaterThanOrEqual(16);
  expect(panel!.y).toBeGreaterThan(regularPanelTop);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366);
});

test("Home keeps the hero and milestone panel clear while goal context loads and fails", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockHome(page);
  await page.route("**/api/v1/coaching/goal-context/active", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Unavailable" } }) });
  });
  await page.goto("/dashboard");

  const expectClearFlow = async () => {
    const footer = await page.locator(".road-hero-footer").boundingBox();
    const panel = await page.locator(".road-journey").boundingBox();
    expect(footer).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(panel!.y - (footer!.y + footer!.height)).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366);
  };

  await expect(page.locator(".road-hero-state")).toHaveText("Loading your goal…");
  await expectClearFlow();
  await expect(page.locator(".road-hero-state")).toHaveText("Your goal is temporarily unavailable.");
  await expect(page.locator(".road-journey .road-inline-state")).toContainText("Your goal could not be loaded.");
  await expectClearFlow();
});

test("Home shows only milestone names in the timeline and expanded list", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-17T07:00:00Z") });
  await mockHome(page, { milestones: [
    { id: "past-race", title: "Past race target", eventName: "Past race", targetDate: "2026-10-16", distanceMeters: 5000, targetTimeSeconds: 1800 },
    { id: "named-race", title: "Oldies 10 km sub-60", eventName: "JGS Oldies 10 km", targetDate: "2026-11-01", distanceMeters: 10000, targetTimeSeconds: 3600 },
    { id: "fallback-race", title: "A long milestone name for the half marathon sub-120", targetDate: "2026-12-01", distanceMeters: 21097.5, targetTimeSeconds: 7200 },
  ] });
  const achievementNames = ["First finish", "Comrades PB", "10 km sub-60", "Half-marathon goal"];
  await page.route("**/api/v1/coaching/race-history", route => route.fulfill({ json: { data: {
    items: achievementNames.map((title, index) => ({
      id: `name-only-${index}`, title, confirmedBy: "user", achievement: index === 1 ? "personal_best" : "goal_achieved",
      raceDate: `2026-10-0${index + 1}`, distanceMeters: 10000, elapsedTimeSeconds: 3500,
      ...(index === 2 ? { activityId: latest.id } : {}),
    })), publishedAt: null,
  } } }));
  const upcomingNames = ["Past race", "JGS Oldies 10 km", "A long milestone name for the half marathon sub-120", "City marathon"];
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");
    await expect(page.locator(".road-timeline-group--achieved .road-stop")).toHaveText(achievementNames.slice(-3));
    await expect(page.locator(".road-timeline-group--ahead .road-stop")).toHaveText(upcomingNames.slice(0, 3));
    const collapsedPageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.locator(".road-all-milestones > summary").click();
    const expanded = page.locator(".road-all-milestones");
    await expect(expanded.locator(".road-stop")).toHaveText([...achievementNames, ...upcomingNames]);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(collapsedPageHeight);
    await expect(page.locator(".road-journey time, .road-stop-detail, .road-status")).toHaveCount(0);
    await expect(expanded.getByRole("link", { name: "10 km sub-60", exact: true })).toHaveAttribute("href", `/dashboard/activities?activityId=${latest.id}&returnTo=%2Fdashboard`);
    await expect(expanded.getByRole("link", { name: "JGS Oldies 10 km", exact: true })).toHaveAttribute("href", "/dashboard/plan");
    await expect(expanded.locator("span.road-stop-title", { hasText: "Comrades PB" })).toBeVisible();
    for (const link of await page.locator(".road-journey a.road-stop-title").all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expectAxeClean(page, `Names-only milestones ${width}`);
  }
});

test("F02 restores the Home session launcher after Calendar browser Back", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  await mockHome(page);
  await page.unroute("**/api/v1/coaching/today");
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.today({ todayScheduleKind: "prescribed_session", nextWorkout: null })) }));
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.activePlan(fixturePlan())) }));
  await page.route("**/api/v1/coaching/calendar**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.calendar()) }));

  await page.goto("/dashboard");
  const launcher = page.getByRole("link", { name: "View workout" });
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
  await expect(page.getByRole("link", { name: "Review run" })).toBeVisible();
  await expect(page.getByText("Older reviewed run", { exact: true })).toHaveCount(0);
});

test("F02 makes review failure local to Recent training while the other groups remain usable", async ({ page }) => {
  await mockHome(page, { reviewFailure: true });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "City marathon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intentional recovery day" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review run" })).toBeVisible();
});

test("F02 Home reports cloud projection pending without displaying inferred goal values", async ({ page }) => {
  await mockHome(page, { goalState: "projection_pending" });
  await page.goto("/dashboard");
  await expect(page.getByText("Your approved goal is syncing.")).toBeVisible();
  await expect(page.getByText("City marathon", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Latest pending run" })).toBeVisible();
  await expect(page.getByRole("link", { name: /View calendar/ })).toBeVisible();
});

test("Home distinguishes a settled goal without a plan from unavailable cloud goal context", async ({ page }) => {
  await mockHome(page, { goalState: "goal_only" });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "City marathon" })).toBeVisible();
  await expect(page.getByText("Your approved plan is not available right now.")).toBeVisible();
  await expect(page.getByText(/Race-day progress cannot yet be assessed/)).toHaveCount(0);

  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: { context: { state: "unavailable", plan: null, goal: null, milestones: null, projection: null } } }),
  }));
  await page.reload();
  await expect(page.getByText(/could not be verified/)).toBeVisible();
  await expect(page.getByText("City marathon", { exact: true })).toHaveCount(0);
});

test("Recovery choices save a new feeling while retaining the rest of the saved check-in", async ({ page }) => {
  await mockHome(page, { checkIn: { revision: 4, status: "saved", answers: { overallFeeling: "very_good", sleepQuality: "good", readiness: "normal", notes: "Keep this note" } } });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Check-in saved · Edit" }).click();
  const good = page.getByRole("button", { name: "Good", exact: true });
  const okay = page.getByRole("button", { name: "Okay", exact: true });
  const low = page.getByRole("button", { name: "Low", exact: true });
  await expect(good).toHaveAttribute("aria-pressed", "false");
  await expect(okay).toHaveAttribute("aria-pressed", "false");
  await expect(low).toHaveAttribute("aria-pressed", "false");
  const saveRequest = page.waitForRequest((request) => request.method() === "PUT" && request.url().includes("/api/v1/wellbeing-check-ins/"));
  await okay.click();
  await page.getByRole("button", { name: "Save check-in", exact: true }).click();
  const request = await saveRequest;
  const body = request.postDataJSON() as { expectedRevision: number; status: string; answers: Record<string, unknown> };
  expect(body).toMatchObject({ expectedRevision: 4, status: "saved", answers: { overallFeeling: "normal", sleepQuality: "good", readiness: "normal", notes: "Keep this note" } });
  await page.getByRole("button", { name: "Check-in saved · Edit" }).click();
  await expect(okay).toHaveAttribute("aria-pressed", "true");
  for (const [label, value, revision] of [["Good", "good", 5], ["Low", "poor", 6]] as const) {
    const saved = page.waitForRequest((request) => request.method() === "PUT" && request.url().includes("/api/v1/wellbeing-check-ins/"));
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("button", { name: "Save check-in", exact: true }).click();
    expect((await saved).postDataJSON()).toMatchObject({ expectedRevision: revision, answers: { overallFeeling: value, notes: "Keep this note" } });
    await page.getByRole("button", { name: "Check-in saved · Edit" }).click();
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await page.reload();
  await page.getByRole("button", { name: "Check-in saved · Edit" }).click();
  await expect(page.getByRole("button", { name: "Low", exact: true })).toHaveAttribute("aria-pressed", "true");
});

for (const [state, label] of [["suggested", "Suggested plan match — not confirmed"], ["confirmed", "Confirmed plan match"], ["ambiguous", "Plan match is uncertain"], ["unplanned", "Unplanned session"], ["none", "No planned session linked"]] as const) {
  test(`F02 preserves the ${state} match qualification`, async ({ page }) => {
    await mockHome(page, { reviewData: review(state) });
    await page.goto("/dashboard");
    await expect(page.locator(".home-activity")).not.toContainText(/planned.session.*(link|confirmed)/i);
    await page.getByRole("link", { name: "Review run" }).click();
    await expect(page.locator(".activity-review-context strong").filter({ hasText: label })).toBeVisible();
    await expect(page.locator(".activity-review-context").filter({ hasText: /does not establish race readiness/ })).toBeVisible();
  });
}

for (const [state, label] of [["not_requested", "No review requested"], ["queued", "Review queued"], ["processing", "Review in progress"], ["retry_wait", "Review delayed"], ["attention", "Review needs attention"], ["ready", "Reviewed"]] as const) {
  test(`F02 retains the ${state} review status`, async ({ page }) => {
    const data = state === "ready" ? review() : null;
    await mockHome(page, { reviewStatus: state, reviewData: data });
    await page.goto("/dashboard");
    await expect(page.locator(".home-activity")).not.toContainText(label);
    await page.getByRole("link", { name: "Review run" }).click();
    await expect(page.locator(".activity-coach-review")).toContainText(state === "not_requested" ? "No review has been requested" : state === "retry_wait" ? "retry" : state === "attention" ? "attention" : state === "ready" ? "Reviewed:" : label);
    if (state !== "ready") await expect(page.getByRole("heading", { name: "Latest pending run" })).toBeVisible();
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
    await expect(page.locator(".home-latest-facts")).toContainText("8.00 km");
    await page.getByRole("link", { name: "Review run" }).click();
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

test("F02 verifies readable ordered summaries and actual viewport fit at phone and desktop heights", async ({ page }) => {
  await mockHome(page);
  for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 780 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1024, height: 900 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "City marathon" })).toBeVisible();
    await expect(page.getByRole("heading", { name: latest.title, exact: true })).toBeVisible();
    await assertHomeLayout(page, test.info(), "home-rest-day");
  }
});

test("Home keeps an active workout readable and all summaries visible on mobile", async ({ page }) => {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const session = fixtureCalendarSession({ title: "Easy supporting run", scheduledDate: date, effectiveDate: date, prescription: "Up to 5 km at conversational effort, RPE 2–3. Shorten according to recovery." });
  await mockHome(page, { today: coachingFixtures.today({ date, todayScheduleKind: "prescribed_session", nextWorkout: null, session }) });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Easy supporting run" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check-in saved · Edit" })).toBeVisible();
    await assertHomeLayout(page, test.info(), "home-active-workout");
    await expectAxeClean(page, "Home daily briefing");
  }
});

for (const startTime of ["06:00", undefined]) {
test(`Home advances Up next to Thursday when today's run arrives, without reloading (${startTime ? "timed" : "untimed"} workout)`, async ({ page }) => {
  const today = "2026-09-15";
  const thursday = "2026-09-17";
  const tuesdayRun = fixtureCalendarSession({ id: "session-tuesday", title: "Tuesday easy run", scheduledDate: today, effectiveDate: today, startTime, prescription: "Run easily for 35 minutes.", durationMinutes: 35 });
  const thursdayRun = fixtureCalendarSession({ id: "session-thursday", title: "Thursday steady run", scheduledDate: thursday, effectiveDate: thursday, startTime: "06:00", prescription: "Run steadily for 45 minutes.", durationMinutes: 45 });
  const nextWorkout = { id: thursdayRun.id, kind: "run", scheduledDate: thursday, startTime: "06:00", title: thursdayRun.title, purpose: thursdayRun.purpose, prescription: thursdayRun.prescription, cautions: thursdayRun.cautions, durationMinutes: thursdayRun.durationMinutes };
  await mockHome(page, { today: coachingFixtures.today({ date: today, todayScheduleKind: "prescribed_session", nextWorkout, session: tuesdayRun }) });
  let activities: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/coaching/calendar**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { from: "2026-09-14", to: "2026-09-20", timezone: "Africa/Johannesburg", sessions: [tuesdayRun, thursdayRun], activities, activitiesReadStatus: "available" } }) }));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Tuesday easy run" })).toBeVisible();
  activities = [{ id: "recorded-tuesday-run", localDate: today, occurredAt: "2026-09-15T06:00:00.000Z", sport: "run", elapsedTimeS: 2_100 }];
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("heading", { name: "Thursday steady run" })).toBeVisible();
  await expect(page.getByText("Up next · Thu, 17 Sept", { exact: true })).toBeVisible();
  await page.locator(".road-session-details summary").click();
  await expect(page.getByText("Run steadily for 45 minutes.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View workout" })).toHaveAttribute("href", /date=2026-09-17&session=session-thursday/);
  await expect(page.getByRole("heading", { name: "Latest pending run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check-in saved · Edit" })).toBeVisible();
});
}

test("Home asks for a calendar check when multiple sessions could remain today", async ({ page }) => {
  const today = "2026-09-15";
  const first = fixtureCalendarSession({ id: "session-morning", title: "Morning run", scheduledDate: today, effectiveDate: today, startTime: undefined });
  const second = fixtureCalendarSession({ id: "session-later", title: "Second run", scheduledDate: today, effectiveDate: today, startTime: undefined });
  await mockHome(page, { today: coachingFixtures.today({ date: today, todayScheduleKind: "prescribed_session", session: first }) });
  await page.route("**/api/v1/coaching/calendar**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { from: "2026-09-14", to: "2026-09-20", timezone: "Africa/Johannesburg", sessions: [first, second], activities: [{ id: "recorded-morning", localDate: today, occurredAt: "2026-09-15T06:00:00.000Z", sport: "run", elapsedTimeS: 2_100 }], activitiesReadStatus: "available" } }) }));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Today's sessions need review" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review calendar" })).toHaveAttribute("href", /\/dashboard\/calendar\?date=2026-09-15/);
});

test("Home advances milestones and the check-in date at local midnight without writing", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-13T21:59:40.000Z") });
  const reads: string[] = [];
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/wellbeing-check-ins")) reads.push(request.url());
    if (["PUT", "POST", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url());
  });
  await mockHome(page, { milestones: [
    { id: "race-today", title: "Today's race", eventName: "Today's race", targetDate: "2026-10-13", distanceMeters: 5000, targetTimeSeconds: 1800 },
    { id: "race-tomorrow", title: "Tomorrow's race", eventName: "Tomorrow's race", targetDate: "2026-10-14", distanceMeters: 10_000, targetTimeSeconds: 3600 },
  ] });
  await page.goto("/dashboard");
  await expect(page.locator(".road-stop--next .road-stop-title")).toHaveText("Today's race");
  await expect(page.getByRole("button", { name: "Check-in saved · Edit" })).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(page.locator(".road-stop--next .road-stop-title")).toHaveText("Tomorrow's race");
  await expect.poll(() => reads.some((url) => url.includes("from=2026-10-14"))).toBe(true);
  await expect(page.locator(".road-hero-header")).toContainText("Wednesday, 14 October");
  expect(writes).toEqual([]);
});

test("A failed conflict reload blocks another check-in save until the latest answers load", async ({ page }) => {
  await mockHome(page, { checkIn: { revision: 4, status: "saved", answers: { overallFeeling: "normal", notes: "Original" } } });
  let conflicted = false;
  let reloadAllowed = false;
  const saves: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/wellbeing-check-ins**", async (route) => {
    if (route.request().method() === "GET") {
      if (!conflicted) return route.fallback();
      if (!reloadAllowed) return route.fulfill({ status: 503, json: { error: { message: "Offline" } } });
      return route.fulfill({ json: { data: { items: [{ revision: 5, timezone: "Africa/Johannesburg", status: "saved", answers: { overallFeeling: "poor", notes: "Updated elsewhere", sleepQuality: "good" } }] } } });
    }
    const body = route.request().postDataJSON();
    saves.push(body);
    if (!conflicted) { conflicted = true; return route.fulfill({ status: 409, json: { error: { message: "Conflict" } } }); }
    return route.fulfill({ json: { data: { ...body, revision: 6 } } });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Check-in saved · Edit" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Save check-in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "could not be reloaded" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Choose your overall feeling" })).toHaveCount(0);
  expect(saves).toHaveLength(1);
  reloadAllowed = true;
  await page.getByRole("button", { name: "Retry check-in", exact: true }).click();
  await page.getByRole("button", { name: "Check-in saved · Edit" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Save check-in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check-in saved · Edit" })).toBeVisible();
  expect(saves[1]).toMatchObject({ expectedRevision: 5, answers: { overallFeeling: "good", notes: "Updated elsewhere", sleepQuality: "good" } });
});

test("Cancelling check-in details does not include unsaved edits in a quick answer", async ({ page }) => {
  await mockHome(page, { checkIn: { revision: 4, status: "saved", answers: { overallFeeling: "very_good", sleepQuality: "good", notes: "Saved note" } } });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Check-in saved · Edit" }).click();
  await page.getByRole("button", { name: "Add sleep and recovery details" }).click();
  await expect(page.getByLabel("How do you feel overall?")).toHaveValue("very_good");
  await page.getByLabel("How did you sleep?").selectOption("poor");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const saved = page.waitForRequest((request) => request.method() === "PUT" && request.url().includes("/api/v1/wellbeing-check-ins/"));
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Save check-in", exact: true }).click();
  expect((await saved).postDataJSON()).toMatchObject({ expectedRevision: 4, answers: { overallFeeling: "poor", sleepQuality: "good", notes: "Saved note" } });
  await expect(page.getByRole("button", { name: "Check-in saved · Edit" })).toBeVisible();
});
