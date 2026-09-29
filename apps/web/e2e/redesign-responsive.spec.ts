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
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "responsive-plan", startsOn: "2026-01-01", endsOn: "2026-12-31", timezone: "Africa/Johannesburg" } }) }));
  await page.route("**/api/v1/coaching/calendar**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { sessions: [], activities: [], timezone: "Africa/Johannesburg" } }) }));
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

test("F05 preserves the Calendar month view through contract-boundary resizing", async ({ page }) => {
  await mockSharedReads(page);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/dashboard/calendar");
  await expect(page.getByLabel("Choose month and year")).toBeVisible();
  await expect(page.getByRole("region", { name: /training calendar/ })).toBeVisible();
  await page.setViewportSize({ width: 1199, height: 900 });
  await expect(page.getByLabel("Choose month and year")).toBeVisible();
  await expect(page.getByRole("region", { name: /training calendar/ })).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next month" })).toBeVisible();
  await expectNoPageOverflow(page, 1200);
});

test("F05 fits the Calendar month overview at supported compact heights", async ({ page }) => {
  await mockSharedReads(page);
  for (const viewport of [{ width: 360, height: 640 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard/calendar?date=2026-10-08");
    await expect(page.getByRole("region", { name: /training calendar/ })).toBeVisible();
    await expect(page.getByLabel("Choose month and year")).toBeVisible();
    await expect(page.getByRole("region", { name: /at a glance/ })).toBeVisible();
    await expectNoPageOverflow(page, viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height);
  }
});

test("F05 keeps Calendar on the shared sidebar and uses compact navigation below desktop", async ({ page }) => {
  await mockSharedReads(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dashboard/calendar?date=2026-10-08");

  const desktopNav = page.locator(".dashboard-nav");
  const desktopMain = page.locator(".dashboard-main");
  const desktopNavBox = await desktopNav.boundingBox();
  const desktopMainBox = await desktopMain.boundingBox();
  expect(desktopNavBox).not.toBeNull();
  expect(desktopMainBox).not.toBeNull();
  expect(desktopNavBox?.x).toBe(0);
  expect(desktopNavBox?.width).toBeGreaterThanOrEqual(210);
  expect(desktopNavBox?.width).toBeLessThanOrEqual(230);
  expect(desktopMainBox?.x).toBeCloseTo(desktopNavBox?.width ?? 0, 0);
  await expect(page.getByRole("link", { name: "Data Quality" })).toBeVisible();
  await expect(page.locator(".calendar-month-region")).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  const compactNavBox = await page.locator(".dashboard-nav").boundingBox();
  expect(compactNavBox).not.toBeNull();
  expect(compactNavBox?.x).toBe(0);
  expect(compactNavBox?.width).toBeCloseTo(1024, 0);
  await expect(page.locator(".dashboard-nav-secondary")).toBeVisible();
  await expect(page.getByRole("link", { name: "Data Quality" })).toBeVisible();
});
