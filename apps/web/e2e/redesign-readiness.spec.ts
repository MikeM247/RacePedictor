import { expect, test, type Page } from "@playwright/test";
import { expectAxeClean, expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";

async function mockReadiness(page: Page, goalStatus = 200) {
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
  await expect(page.getByText("Weekly distance · km")).toBeVisible();
  await expect(page.getByText("Weekly effort · points")).toBeVisible();
  await expect(page.getByText("Week starting 2026-07-27")).toBeVisible();
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
