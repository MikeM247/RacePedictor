import { expect, test, type Page } from "@playwright/test";
import { coachingFixtures, fixturePlan } from "./coaching-fixtures.ts";
import { expectAxeClean, expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";

const overview = {
  fetchStatus: "success",
  stale: { isStale: false },
  data: {
    predictionSummary: { athleteId: "a11y", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "a11y", generatedAt: "2026-09-16T08:00:00.000Z" },
    predictionOptions: [
      { athleteId: "a11y", targetDistanceM: 5_000, predictedTimeS: 1440, predictedPaceSecPerKm: 288, bandLowS: 1380, bandHighS: 1500, modelVersion: "a11y", generatedAt: "2026-09-16T08:00:00.000Z" },
      { athleteId: "a11y", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "a11y", generatedAt: "2026-09-16T08:00:00.000Z" },
    ], driverContributions: [], featureTrendPoints: [],
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
  const plan = fixturePlan({ id: "a11y-plan", startsOn: "2026-09-14", endsOn: "2026-10-12" });
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { athleteId: "a11y", providerConnection: { state: "current", displayStatus: "connected" }, ingestion: { state: "current" }, activityData: { state: "current" }, localDevice: { state: "current" }, secondBrain: { state: "current" }, updatedAt: "2026-09-16T08:00:00.000Z" } }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { state: "no_plan", date: "2026-09-16", timezone: "Africa/Johannesburg", message: "Settle a goal before relying on daily coaching." } }) }));
  await page.route("**/api/v1/activities**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { items: [] } }) }));
  await page.route("**/api/v1/providers/strava/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { connection: { displayStatus: "disconnected" } } }) }));
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.activePlan(plan)) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coachingFixtures.history([plan])) }));
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
  for (const [href, heading] of routes) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await expectAxeClean(page, `initial ${heading} route`);
  }
});

test("F05 scans expanded disclosures across redesigned routes with actionable axe evidence", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await mockSharedReads(page);
  const scannedByRoute: Record<string, string[]> = {};
  for (const [href, heading] of routes) {
    await page.goto(href);
    if (href === "/dashboard/plan") {
      const createPlan = page.getByRole("button", { name: /Create a plan with Codex/ });
      if (await createPlan.isVisible()) await createPlan.click();
    }
    const disclosures = page.locator("details");
    scannedByRoute[href] = [];
    for (let index = 0; index < await disclosures.count(); index += 1) {
      const disclosure = disclosures.nth(index);
      const summary = disclosure.locator("summary").first();
      if (!await summary.isVisible()) continue;
      const label = (await summary.innerText()).trim().replace(/\s+/g, " ");
      if (!await disclosure.evaluate((element) => element.hasAttribute("open"))) {
        await summary.click();
        await expect(disclosure).toHaveAttribute("open", "");
      }
      scannedByRoute[href].push(label);
      await expectAxeClean(page, `${heading} expanded disclosure: ${label}`);
    }
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toHaveCount(1);
  }
  for (const href of ["/dashboard/activities", "/dashboard/plan", "/dashboard/settings"]) {
    expect(scannedByRoute[href].length, `Expected an expanded disclosure scan on ${href}`).toBeGreaterThan(0);
  }
  expectNoApplicationWrites(writes);
});
