import { readinessSnapshot } from "./readiness-local-fixture.ts";
import { weeklyTrainingFixture } from "../lib/mock-data/weekly-training.ts";
import { expect, test, type Page } from "@playwright/test";
import { expectAxeClean, expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date("2026-10-13T12:00:00Z")); });

async function mockReadiness(page: Page, goalStatus = 200) {
  await page.route("**/api/v1/dashboard/overview", route => route.fulfill({ json: readinessSnapshot }));
  await page.route("**/api/v1/sync/status", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({ status: goalStatus, json: goalStatus === 200
    ? { data: { context: { state: "no_active_plan", plan: null, goal: null, milestones: null, projection: null } } }
    : { error: { code: "UNAVAILABLE" } } }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ json: { data: { date: "2026-10-13", timezone: "Africa/Johannesburg", state: "no-plan", session: null, plan: null } } }));
  await page.route("**/api/v1/activities**", (route) => route.fulfill({ json: { data: { items: [] } } }));
  await page.route("**/api/v1/wellbeing-check-ins**", (route) => route.fulfill({ json: { data: { items: [] } } }));
}

async function selectFiveKilometres(page: Page) {
  await page.getByText("Estimate settings", { exact: true }).click();
  await page.getByLabel("Show estimate for").selectOption("5000");
  await expect(page.getByRole("heading", { name: "5 km estimate" })).toBeVisible();
  await expect(page.getByText("24:00", { exact: true })).toBeVisible();
}

test("Readiness retains evidence and distance selection as its own navigation destination", async ({ page }) => {
  await mockReadiness(page);
  const writes = recordApplicationWrites(page);
  const todayReads: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/v1/coaching/today") todayReads.push(request.url()); });
  await page.goto("/dashboard/readiness");
  await expect(page.getByRole("link", { name: "Readiness", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Current-fitness estimate" })).toBeVisible();
  await expect(page.getByText(/Recent load has a negative supplied contribution of -24%/)).toBeVisible();
  await expect(page.getByText(/previous assessment is shown/)).toBeVisible();
  await expect(page.getByText("Late array entry", { exact: true })).toBeVisible();
  await expect(page.getByText("+10%", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly training", exact: true })).toBeVisible();
  await expect(page.getByText("Weekly effort · points")).toBeVisible();
  await expect(page.locator("[data-week-bar]")).toHaveCount(12);
  await selectFiveKilometres(page);
  expect(todayReads).toEqual([]);
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/readiness$/);
  await expect(page.getByRole("heading", { name: "Current-fitness estimate" })).toBeVisible();
  expectNoApplicationWrites(writes);
});

test("Legacy Readiness fragments redirect to the separate route and survive reload", async ({ page }) => {
  await mockReadiness(page);
  await page.goto("/dashboard#readiness");
  await expect(page).toHaveURL(/\/dashboard\/readiness$/);
  await expect(page.getByRole("heading", { name: "Current-fitness estimate" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Current-fitness estimate" })).toBeVisible();
});

test("An unavailable goal timezone does not block independent Readiness evidence", async ({ page }) => {
  await mockReadiness(page, 503);
  await page.goto("/dashboard/readiness");
  await expect(page.getByRole("heading", { name: "10 km estimate" })).toBeVisible();
  await expect(page.getByText(/not a probability or race-day forecast/)).toBeVisible();
  await expect(page.getByText("Race-day progress cannot yet be assessed from this current-fitness estimate.")).toBeVisible();
});

test("Legacy recovery restores the selected distance and Readiness navigation focus", async ({ page }) => {
  await mockReadiness(page);
  await page.goto("/dashboard");
  await page.evaluate(() => sessionStorage.setItem("racepredictor.recovery.v1.f01recover", JSON.stringify({
    version: 1, id: "f01recover", createdAt: Date.now(), expiresAt: Date.now() + 60_000,
    path: "/dashboard", kind: "home", disclosure: "readiness", predictionDistanceM: 5000,
    scrollY: 0, focusKey: "view-readiness",
  })));
  await page.goto("/dashboard?recovery=f01recover#readiness");
  await expect(page).toHaveURL(/\/dashboard\/readiness\?recovery=f01recover$/);
  await expect(page.getByRole("heading", { name: "5 km estimate" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Readiness", exact: true })).toBeFocused();
});

test("Data Quality returns to Readiness with the selected distance and originating link focused", async ({ page }) => {
  await mockReadiness(page);
  const writes = recordApplicationWrites(page);
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ json: { data: { actor: { activeAthleteId: "f01-athlete" } } } }));
  await page.route("**/api/v1/providers/strava/status", (route) => route.fulfill({ json: { data: { connection: { displayStatus: "disconnected" } } } }));
  await page.goto("/dashboard/readiness");
  await selectFiveKilometres(page);
  await page.getByRole("link", { name: "Review data coverage" }).click();
  await expect(page.getByRole("heading", { name: "Data Quality" })).toBeVisible();
  await page.getByRole("link", { name: "Return to readiness" }).click();
  await expect(page).toHaveURL(/\/dashboard\/readiness\?recovery=/);
  await expect(page.getByRole("heading", { name: "5 km estimate" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review data coverage" })).toBeFocused();
  expectNoApplicationWrites(writes);
});

test("Readiness keeps its caveats readable at phone, tablet and desktop widths", async ({ page }) => {
  await mockReadiness(page);
  for (const width of [320, 767, 768, 1199, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/readiness");
    await expect(page.getByText("Race-day progress cannot yet be assessed from this current-fitness estimate.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width === 320 || width === 1440) await expectAxeClean(page, `Readiness at ${width}px`);
  }
});

test("weekly overlays support all combinations without changing bars or fetching data", async ({ page }) => {
  await mockReadiness(page);
  const writes = recordApplicationWrites(page);
  await page.goto("/dashboard/readiness");
  const chart = page.getByRole("region", { name: "Weekly training", exact: true });
  await expect(chart.locator("[data-week-bar]")).toHaveCount(12);
  await expect(chart.locator("[data-overlay]")).toHaveCount(0);
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.locator("svg")).toBeVisible();
  const geometry = () => chart.locator("[data-week-bar]").evaluateAll(elements => elements.map(element => [element.getAttribute("y"), element.getAttribute("height")]));
  const before = await geometry();
  const baseline = Number(await chart.locator(".weekly-baseline").getAttribute("y1"));
  for (const [y, height] of before) expect(Number(y) + Number(height)).toBeCloseTo(baseline);
  const apiReads: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiReads.push(request.url()); });
  for (let mask = 0; mask < 8; mask++) {
    for (const [index, name] of ["Pace", "Time", "Elevation"].entries()) await chart.getByRole("checkbox", { name, exact: true }).setChecked(Boolean(mask & (1 << index)));
    await expect(chart.locator("[data-overlay]")).toHaveCount(mask.toString(2).replaceAll("0", "").length);
    expect(await geometry()).toEqual(before);
  }
  await chart.locator('[data-week-hit="2026-09-21"]').click();
  await expect(chart.locator(".weekly-training-readout")).toContainText("33.4 km");
  await expect(chart.locator(".weekly-training-readout")).toContainText("5:42 /km");
  await expect(chart.locator(".weekly-training-readout")).toContainText("3h 10m 00s");
  await expect(chart.locator(".weekly-training-readout")).toContainText("420 m");
  await page.mouse.move(0, 0);
  await expect(chart.locator(".weekly-training-readout")).toContainText("Week of 21 Sept");
  expect(apiReads).toEqual([]);
  expectNoApplicationWrites(writes);
});

test("weekly chart supports keyboard selection, mobile controls and accessible data", async ({ page }, testInfo) => {
  await mockReadiness(page);
  await page.goto("/dashboard/readiness");
  const chart = page.getByRole("region", { name: "Weekly training", exact: true });
  const plot = chart.getByRole("group", { name: /Weekly training chart/ });
  await plot.focus();
  await page.keyboard.press("Home");
  await expect(chart.locator(".weekly-training-readout")).toContainText("41.4 km");
  await page.keyboard.press("ArrowRight");
  await expect(chart.locator(".weekly-training-readout")).toContainText("27.4 km");
  await page.keyboard.press("End");
  await expect(chart.locator(".weekly-training-readout")).toContainText("Current week · partial");
  await page.keyboard.press("Escape");
  await expect(chart.locator(".weekly-training-readout")).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await chart.scrollIntoViewIfNeeded();
    for (const name of ["Pace", "Time", "Elevation"]) await chart.getByRole("checkbox", { name, exact: true }).check();
    await chart.getByRole("button", { name: "Previous week" }).click();
    await expect(chart.locator(".weekly-training-readout")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width === 320 || width === 1440) await expectAxeClean(page, `Weekly chart overlays at ${width}px`);
    if (width === 390 || width === 1440) {
      await chart.screenshot({ path: testInfo.outputPath(`weekly-training-${width}-overlays.png`), style: ".dashboard-nav, nextjs-portal { visibility: hidden !important; }" });
      for (const name of ["Pace", "Time", "Elevation"]) await chart.getByRole("checkbox", { name, exact: true }).uncheck();
      await chart.getByRole("button", { name: "Clear selection" }).click();
      await page.mouse.move(0, 0);
      await chart.screenshot({ path: testInfo.outputPath(`weekly-training-${width}-default.png`), style: ".dashboard-nav, nextjs-portal { visibility: hidden !important; }" });
    }
  }
  await chart.getByText("View weekly data", { exact: true }).click();
  await expect(chart.getByRole("table")).toBeVisible();
  await expect(chart.getByRole("row")).toHaveCount(13);
  await page.reload();
  await expect(chart.locator("[data-overlay]")).toHaveCount(0);
});

test("API weekly observations render without a prediction and isolate unavailable metrics", async ({ page, baseURL }) => {
  test.skip(!baseURL?.endsWith(":3312"), "Requires the online dashboard client");
  await mockReadiness(page);
  await page.route("**/api/v1/dashboard/overview", route => route.fulfill({ json: {
    fetchStatus: "empty", stale: { isStale: false }, weeklyTraining: {
      ...weeklyTrainingFixture, weeks: weeklyTrainingFixture.weeks.map((week, index) => ({ ...week, avgPaceSecPerKm: index === 8 ? null : week.avgPaceSecPerKm, elevationGainM: null })),
    },
  } }));
  await page.goto("/dashboard/readiness");
  const chart = page.getByRole("region", { name: "Weekly training", exact: true });
  await expect(page.getByText("No compatible current-fitness estimate is available from the imported history.")).toBeVisible();
  await expect(chart.locator("[data-week-bar]")).toHaveCount(12);
  await expect(chart.getByRole("checkbox", { name: /Elevation/ })).toBeDisabled();
  await chart.getByRole("checkbox", { name: "Pace", exact: true }).check();
  await expect(chart.locator('[data-overlay="Pace"]')).toHaveCount(1);
  await expect(chart.locator('[data-overlay="Pace"] line')).toHaveCount(9);
  await chart.locator('[data-week-hit="2026-09-21"]').click();
  await expect(chart.locator(".weekly-training-readout")).toContainText("Unavailable");
});

test("mobile touch pins a week and old snapshots never label a historical week as current", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, baseURL });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-10-20T12:00:00Z"));
  await mockReadiness(page);
  await page.goto("/dashboard/readiness");
  const chart = page.getByRole("region", { name: "Weekly training", exact: true });
  await chart.locator('[data-week-hit="2026-09-21"]').tap();
  await expect(chart.locator(".weekly-training-readout")).toContainText("33.4 km");
  await chart.getByRole("checkbox", { name: "Pace", exact: true }).tap();
  await expect(chart.locator(".weekly-training-readout")).toContainText("5:42 /km");
  await expect(chart.getByText("Current week · partial", { exact: false })).toHaveCount(0);
  await expect(chart.getByText("Showing previously available training data. Updates are delayed.")).toBeVisible();
  await context.close();
});

test("local overview endpoint returns the same weekly observations as the rendered chart", async ({ request, baseURL }) => {
  test.skip(!baseURL?.endsWith(":3313"), "Requires the local snapshot endpoint");
  const response = await request.get("/api/v1/dashboard/overview");
  expect(response.ok()).toBe(true);
  const overview = await response.json();
  expect(overview.weeklyTraining).toEqual(weeklyTrainingFixture);
});

test("API chart failures and legacy snapshots retain the rest of Readiness", async ({ page, baseURL }) => {
  test.skip(!baseURL?.endsWith(":3312"), "Requires the online dashboard client");
  await mockReadiness(page);
  let weeklyTraining: unknown = { ...weeklyTrainingFixture, status: "unavailable", weeks: [] };
  await page.route("**/api/v1/dashboard/overview", route => route.fulfill({ json: {
    ...readinessSnapshot, weeklyTraining,
    data: { ...readinessSnapshot.data, featureTrendPoints: [{ weekStart: "2026-09-07", featureKey: "total_distance_km", featureLabel: "Weekly distance", unit: "km", value: 25 }] },
  } }));
  await page.goto("/dashboard/readiness");
  await expect(page.getByRole("button", { name: "Retry weekly training" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "10 km estimate" })).toBeVisible();
  weeklyTraining = { ...weeklyTrainingFixture, weeks: [] };
  await page.reload();
  await expect(page.getByText("Weekly training data could not be validated.")).toBeVisible();
  await expect(page.locator("[data-week-bar]")).toHaveCount(0);
  weeklyTraining = undefined;
  await page.reload();
  await expect(page.locator("[data-week-bar]")).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: /Pace/ })).toBeDisabled();
  await expect(page.getByText(/Historical distance observations/)).toBeVisible();
});
