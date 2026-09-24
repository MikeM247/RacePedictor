import { expect, test, type Page } from "@playwright/test";

const overview = {
  fetchStatus: "success",
  stale: { isStale: true, staleReason: "A previous assessment is shown.", staleAtIso: "2026-08-18T08:00:00.000Z" },
  data: {
    predictionSummary: { athleteId: "f01-athlete", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "f01-model", generatedAt: "2026-08-18T07:00:00.000Z" },
    predictionOptions: [
      { athleteId: "f01-athlete", targetDistanceM: 5000, predictedTimeS: 1440, predictedPaceSecPerKm: 288, bandLowS: 1380, bandHighS: 1500, modelVersion: "f01-model", generatedAt: "2026-08-18T07:00:00.000Z" },
      { athleteId: "f01-athlete", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "f01-model", generatedAt: "2026-08-18T07:00:00.000Z" },
    ],
    driverContributions: [
      { key: "late", label: "Late array entry", contributionPct: 10, direction: "positive", confidence: 0.8 },
      { key: "load", label: "Recent load", contributionPct: -24, direction: "negative", confidence: 0.8 },
      { key: "zero", label: "Neutral data", contributionPct: 0, direction: "neutral", confidence: 0.8 },
    ],
    featureTrendPoints: [
      { weekStart: "2026-07-27", featureKey: "distance", featureLabel: "Weekly distance", value: -2, unit: "km" },
      { weekStart: "2026-08-10", featureKey: "distance", featureLabel: "Weekly distance", value: 0, unit: "km" },
      { weekStart: "2026-08-03", featureKey: "effort", featureLabel: "Weekly effort", value: 4, unit: "points" },
    ],
    importProgress: { importId: "f01-import", status: "completed", stagedCount: 3, normalizedCount: 3, duplicateCount: 0, rejectedCount: 0, updatedAt: "2026-08-18T07:00:00.000Z" },
  },
};
const status = { athleteId: "f01-athlete", providerConnection: { state: "current", displayStatus: "connected" }, ingestion: { state: "current" }, activityData: { state: "current" }, localDevice: { state: "current" }, secondBrain: { state: "current" }, updatedAt: "2026-08-18T08:00:00.000Z" };
const goal = { id: "goal_f01", title: "Autumn half", why: "Test target", targetDate: "2026-10-01", countdown: { days: 44, label: "44 days" } };
const today = (value: typeof goal | null) => ({ data: { athleteId: "f01-athlete", date: "2026-08-18", sessionId: null, message: "Rest.", source: "fallback", generatedAt: "2026-08-18T08:00:00.000Z", idempotencyKey: "today_f01", timezone: "Africa/Johannesburg", state: "rest", status: "rest", goal: value, plan: null, planVersion: null, session: null, localCue: "Rest.", scheduleWarnings: [], stale: { isStale: false, reason: null }, links: { plan: "/dashboard/plan", calendar: "/dashboard/calendar", session: null } } });

type TargetResponse = { status: number; body: unknown };
async function mockReadiness(page: Page, targetResponses: TargetResponse[] | (() => TargetResponse) = [{ status: 200, body: today(goal) }]) {
  let targetRequests = 0;
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: status }) }));
  await page.route("**/api/v1/activities**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { items: [] } }) }));
  await page.route("**/api/v1/coaching/today", (route) => {
    const response = typeof targetResponses === "function"
      ? targetResponses()
      : targetResponses[Math.min(targetRequests, targetResponses.length - 1)]!;
    targetRequests += 1;
    return route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
  });
  return () => targetRequests;
}

test("readiness presents canonical evidence, addressable navigation, distance selection and no consequential writes", async ({ page }) => {
  const targetRequests = await mockReadiness(page);
  const mutations: string[] = [];
  page.on("request", (request) => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`); });
  await page.goto("/dashboard");
  await expect(page.getByText(/Recent load has a negative supplied contribution of -24%/)).toBeVisible();
  await expect(page.getByText(/do not explain or predict a finish time/)).toBeVisible();
  await expect(page.getByText(/previous assessment is shown/)).toBeVisible();
  await expect(page.getByText(/Autumn half on 2026-10-01/)).toBeVisible();
  const initialTargetReads = targetRequests();
  await page.getByRole("button", { name: "View readiness" }).click();
  await expect(page).toHaveURL(/#readiness$/);
  await expect(page.getByRole("heading", { name: "Evidence for this outlook" })).toBeVisible();
  await expect(page.getByText("Late array entry", { exact: true })).toBeVisible();
  await expect(page.getByText("+10%", { exact: true })).toBeVisible();
  await expect(page.getByText("Weekly distance · km")).toBeVisible();
  await expect(page.getByText("Weekly effort · points")).toBeVisible();
  await expect(page.getByText("Week starting 2026-07-27")).toBeVisible();
  await page.getByText("Prediction settings").click();
  await page.getByLabel("Show estimate for").selectOption("5000");
  await expect(page.getByRole("heading", { name: "5 km prediction" })).toBeVisible();
  await expect(page.getByText("24:00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "View readiness" })).toBeFocused();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Evidence for this outlook" })).toBeVisible();
  // Existing Today coaching and development Strict Mode may each read once;
  // presentation-only readiness actions add no Today request.
  expect(targetRequests()).toBe(initialTargetReads);
  expect(mutations).toEqual([]);
});

test("direct readiness entry and target-only retry distinguish a failed read from confirmed absence", async ({ page }) => {
  let targetReadCanSucceed = false;
  const targetRequests = await mockReadiness(page, () => targetReadCanSucceed
    ? { status: 200, body: today(goal) }
    : { status: 503, body: { error: { code: "UNAVAILABLE" } } });
  await page.goto("/dashboard#readiness");
  await expect(page.getByRole("heading", { name: "Evidence for this outlook" })).toBeVisible();
  await expect(page.getByText(/Could not load your settled target/)).toBeVisible();
  await expect(page.getByText("No target status is being inferred.")).toBeVisible();
  const beforeRetry = targetRequests();
  targetReadCanSucceed = true;
  await page.getByRole("button", { name: "Retry target" }).click();
  await expect(page.getByText(/Autumn half on 2026-10-01/)).toBeVisible();
  expect(targetRequests()).toBe(beforeRetry + 1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Evidence for this outlook" })).toBeVisible();
});

test("only a schema-valid null target is presented as absence", async ({ page }) => {
  await mockReadiness(page, [{ status: 200, body: today(null) }]);
  await page.goto("/dashboard#readiness");
  await expect(page.getByText(/No settled target is confirmed/)).toBeVisible();
  await expect(page.getByText(/comparison cannot be assessed/)).toBeVisible();
  await expect(page.getByText(/not to infer an on-track verdict/)).toBeVisible();
});

test("a safe readiness recovery restores the disclosure, selected distance, and launcher focus", async ({ page }) => {
  await mockReadiness(page);
  await page.goto("/dashboard");
  await page.evaluate(() => sessionStorage.setItem("racepredictor.recovery.v1.f01recover", JSON.stringify({
    version: 1,
    id: "f01recover",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    path: "/dashboard",
    kind: "home",
    disclosure: "readiness",
    predictionDistanceM: 5000,
    scrollY: 0,
    focusKey: "view-readiness",
  })));
  await page.goto("/dashboard?recovery=f01recover#readiness");
  await expect(page.getByRole("heading", { name: "Evidence for this outlook" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "5 km prediction" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View readiness" })).toBeFocused();
});

test("readiness can return from Data Quality before any import without changing evidence", async ({ page }) => {
  await mockReadiness(page);
  const writes: string[] = [];
  page.on("request", (request) => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { actor: { activeAthleteId: "f01-athlete" } } }) }));
  await page.route("**/api/v1/providers/strava/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { connection: { displayStatus: "disconnected" } } }) }));

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "View readiness" }).click();
  await page.getByRole("link", { name: "Review data coverage" }).click();
  await expect(page.getByRole("heading", { name: "Data Quality" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No file import result yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to readiness" })).toBeVisible();
  await page.getByRole("link", { name: "Return to readiness" }).click();
  await expect(page).toHaveURL(/\/dashboard\?recovery=.*#readiness$/);
  await expect(page.getByRole("heading", { name: "Evidence for this outlook" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View readiness" })).toBeFocused();
  expect(writes).toEqual([]);
});

test("readiness has no horizontal overflow or hidden caveat at required CSS widths", async ({ page }) => {
  await mockReadiness(page);
  for (const width of [320, 767, 768, 1199, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard#readiness");
    await expect(page.getByText(/does not have a supported target-race comparison/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
