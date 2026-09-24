import { expect, test, type Page } from "@playwright/test";

const widths = [320, 375, 390, 414, 767, 768, 1024, 1199, 1200, 1440];
const routes = [
  ["/dashboard", "Home"],
  ["/dashboard/activities", "Training"],
  ["/dashboard/plan", "Plan"],
  ["/dashboard/calendar", "Calendar"],
  ["/dashboard/data-quality", "Data Quality"],
  ["/dashboard/settings", "Settings"],
] as const;

const overview = {
  fetchStatus: "success",
  stale: { isStale: false },
  data: {
    predictionSummary: { athleteId: "responsive", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "responsive", generatedAt: "2026-09-16T08:00:00.000Z" },
    predictionOptions: [], driverContributions: [], featureTrendPoints: [],
    importProgress: { status: "completed", stagedCount: 1, normalizedCount: 1, duplicateCount: 0, rejectedCount: 0 },
  },
};

async function mockSharedReads(page: Page) {
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { athleteId: "responsive", providerConnection: { state: "current", displayStatus: "connected" }, ingestion: { state: "current" }, activityData: { state: "current" }, localDevice: { state: "current" }, secondBrain: { state: "current" }, updatedAt: "2026-09-16T08:00:00.000Z" } }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { state: "no_plan", date: "2026-09-16", timezone: "Africa/Johannesburg", message: "Settle a goal before relying on daily coaching." } }) }));
  await page.route("**/api/v1/activities**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { items: [] } }) }));
  await page.route("**/api/v1/providers/strava/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { connection: { displayStatus: "disconnected" } } }) }));
}

async function expectNoPageOverflow(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test("F05 keeps every redesigned route within the contract widths", async ({ page }) => {
  test.setTimeout(180_000);
  await mockSharedReads(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const [href, heading] of routes) {
      await page.goto(href);
      await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
      await expect(page.locator("main#dashboard-main-content")).toBeVisible();
      await expectNoPageOverflow(page, width);
    }
  }
});

test("F05 preserves the Calendar's usable mode through contract-boundary resizing", async ({ page }) => {
  await mockSharedReads(page);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/dashboard/calendar");
  await expect(page.getByRole("button", { name: "Weeks" })).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1199, height: 900 });
  await expect(page.getByRole("button", { name: "Agenda" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Weeks" })).toHaveCount(0);
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.getByRole("button", { name: "Weeks" })).toHaveAttribute("aria-pressed", "true");
  await expectNoPageOverflow(page, 1200);
});
