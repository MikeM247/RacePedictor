import { expect, test, type Page } from "@playwright/test";

const widths = [320, 360, 390, 767, 768, 1199, 1200, 1440];
const routes = [
  ["/dashboard", "Home"],
  ["/dashboard/activities", "Training"],
  ["/dashboard/coach", "Coach"],
  ["/dashboard/readiness", "Readiness"],
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
      const pageHeading = href === "/dashboard"
        ? page.getByRole("heading", { level: 1, name: "Home", exact: true })
        : page.getByRole("heading", { level: 1, name: heading === "Coach" ? /Coach/ : heading, exact: true });
      await expect(pageHeading).toBeVisible();
      await expect(page.locator("main#dashboard-main-content")).toBeVisible();
      await expectNoPageOverflow(page, width);
    }
  }
});

test("F05 keeps the month grid and switches sidebar to day dialog at the responsive boundary", async ({ page }) => {
  await mockSharedReads(page);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/dashboard/calendar");
  await expect(page.getByLabel("Choose month and year")).toBeVisible();
  await expect(page.getByRole("region", { name: /training calendar/ })).toBeVisible();
  await page.setViewportSize({ width: 1199, height: 900 });
  await expect(page.locator(".calendar-month-region")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Selected day" })).toBeHidden();
  const cell = page.locator(".calendar-day").first();
  await cell.click();
  await expect(page.getByRole("dialog", { name: /^Day details/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cell).toBeFocused();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next month" })).toBeVisible();
  await expectNoPageOverflow(page, 1200);
});

test("F05 keeps readable Calendar navigation and optional totals accessible at compact heights", async ({ page }) => {
  await mockSharedReads(page);
  for (const viewport of [{ width: 360, height: 640 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard/calendar?date=2026-10-08");
    await expect(page.getByRole("region", { name: /training calendar/ })).toBeVisible();
    await expect(page.getByLabel("Choose month and year", { exact: true })).toBeVisible();
    await page.getByText("Training totals and timezone", { exact: true }).click();
    await expect(page.getByRole("region", { name: /at a glance/ })).toBeVisible();
    await expectNoPageOverflow(page, viewport.width);
    await page.evaluate(() => window.scrollTo(0, 0));
    const today = await page.getByRole("button", { name: "Today", exact: true }).boundingBox();
    expect(today!.y).toBeGreaterThanOrEqual(viewport.width < 768 ? 56 : 0);
    expect(today!.y + today!.height).toBeLessThanOrEqual(viewport.height);
  }
});

test("F05 keeps Calendar on the shared sidebar and uses compact navigation below desktop", async ({ page }) => {
  await mockSharedReads(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dashboard/calendar?date=2026-10-08");

  const desktopNav = page.locator(".app-rail .dashboard-nav");
  const desktopMain = page.locator(".dashboard-main");
  const desktopNavBox = await desktopNav.boundingBox();
  const desktopMainBox = await desktopMain.boundingBox();
  expect(desktopNavBox).not.toBeNull();
  expect(desktopMainBox).not.toBeNull();
  expect(desktopNavBox?.x).toBe(0);
  expect(desktopNavBox?.width).toBe(64);
  expect(desktopMainBox?.x).toBeCloseTo(desktopNavBox?.width ?? 0, 0);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.locator(".calendar-month-region")).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  const compactNavBox = await page.locator(".app-rail .dashboard-nav").boundingBox();
  expect(compactNavBox).not.toBeNull();
  expect(compactNavBox?.x).toBe(0);
  expect(compactNavBox?.width).toBe(64);
  await expect(page.locator(".app-rail .dashboard-nav-secondary")).toBeVisible();
  await expect(page.getByRole("region", { name: /training calendar/ })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("link", { name: "Data quality and recovery" })).toBeVisible();
});

test("mobile drawer exposes every available destination without bottom navigation", async ({ page }) => {
  await mockSharedReads(page);
  await page.setViewportSize({ width: 360, height: 640 });
  for (const [href] of routes) {
    await page.goto(href);
    await expect(page.locator("main#dashboard-main-content")).toHaveCount(1);
    expect((await page.locator(".app-header").boundingBox())!.height).toBe(56);
    await expect(page.locator(".app-rail")).toBeHidden();
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "Menu", exact: true });
    await expect(drawer).toBeVisible();
    expect((await drawer.boundingBox())!.width).toBe(280);
    for (const label of ["Home", "Coach", "Calendar", "Readiness", "Settings"]) await expect(drawer.getByRole("link", { name: label, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expectNoPageOverflow(page, 360);
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog", { name: "Menu", exact: true }).getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/calendar$/);
  await expect(page.getByRole("heading", { name: "Calendar", exact: true, level: 1 })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("desktop rail defaults to icons and remembers expansion across routes and breakpoints", async ({ page }) => {
  await mockSharedReads(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/calendar");
  const rail = page.locator(".app-rail");
  expect((await rail.boundingBox())!.width).toBe(64);
  await page.getByRole("button", { name: "Expand navigation" }).click();
  expect((await rail.boundingBox())!.width).toBe(180);
  await page.reload();
  await expect(page.getByRole("button", { name: "Collapse navigation" })).toBeVisible();
  await page.getByRole("link", { name: "Readiness", exact: true }).click();
  expect((await rail.boundingBox())!.width).toBe(180);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.getByRole("dialog", { name: "Menu", exact: true })).not.toBeVisible();
  expect((await rail.boundingBox())!.width).toBe(180);
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  expect((await rail.boundingBox())!.width).toBe(64);
});
