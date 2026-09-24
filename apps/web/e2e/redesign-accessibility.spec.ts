import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const overview = {
  fetchStatus: "success",
  stale: { isStale: false },
  data: {
    predictionSummary: { athleteId: "a11y", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "a11y", generatedAt: "2026-09-16T08:00:00.000Z" },
    predictionOptions: [], driverContributions: [], featureTrendPoints: [],
    importProgress: { status: "completed", stagedCount: 1, normalizedCount: 1, duplicateCount: 0, rejectedCount: 0 },
  },
};

const routes = [
  ["/dashboard", "Home"],
  ["/dashboard/activities", "Training"],
  ["/dashboard/plan", "Plan"],
  ["/dashboard/calendar", "Calendar"],
  ["/dashboard/data-quality", "Data Quality"],
  ["/dashboard/settings", "Settings"],
] as const;

async function mockSharedReads(page: Page) {
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { athleteId: "a11y", providerConnection: { state: "current", displayStatus: "connected" }, ingestion: { state: "current" }, activityData: { state: "current" }, localDevice: { state: "current" }, secondBrain: { state: "current" }, updatedAt: "2026-09-16T08:00:00.000Z" } }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { state: "no_plan", date: "2026-09-16", timezone: "Africa/Johannesburg", message: "Settle a goal before relying on daily coaching." } }) }));
  await page.route("**/api/v1/activities**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { items: [] } }) }));
  await page.route("**/api/v1/providers/strava/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { connection: { displayStatus: "disconnected" } } }) }));
}

test("F05 provides a usable skip link, landmarks, visible focus, and no automated accessibility violations on every redesigned route", async ({ page }) => {
  await mockSharedReads(page);
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to page content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#dashboard-main-content")).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  const violations: Record<string, string[]> = {};
  for (const [href, heading] of routes) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    const scan = await new AxeBuilder({ page }).analyze();
    violations[href] = scan.violations.map((violation) => violation.id);
  }
  expect(violations).toEqual(Object.fromEntries(routes.map(([href]) => [href, []])));
});
