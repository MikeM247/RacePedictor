import { expect, test, type Page } from "@playwright/test";

const overview = {
  fetchStatus: "success",
  stale: { isStale: false },
  data: {
    predictionSummary: { athleteId: "redesign", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "test-model", generatedAt: "2026-08-10T12:00:00.000Z" },
    predictionOptions: [], driverContributions: [], featureTrendPoints: [],
    importProgress: { status: "completed", stagedCount: 1, normalizedCount: 1, duplicateCount: 0, rejectedCount: 0 },
  },
};

const status = { athleteId: "redesign", providerConnection: { state: "current", displayStatus: "connected" }, ingestion: { state: "current" }, activityData: { state: "current" }, localDevice: { state: "current" }, secondBrain: { state: "current" }, updatedAt: "2026-08-10T12:00:00.000Z" };

async function mockHome(page: Page) {
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: status }) }));
  await page.route("**/api/v1/activities**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { items: [] } }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { state: "no_plan", date: "2026-08-10", timezone: "Africa/Johannesburg", message: "Settle a goal before relying on daily coaching." } }) }));
}

test("Readiness protects the current-fitness estimate and confidence messaging", async ({ page }) => {
  await mockHome(page);
  await page.goto("/dashboard/readiness");
  await expect(page.getByRole("heading", { name: "Current-fitness estimate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "10 km estimate" })).toBeVisible();
  await expect(page.getByText("50:00", { exact: true })).toBeVisible();
  await expect(page.getByText(/not a probability or race-day forecast/)).toBeVisible();
  await expect(page.locator(".home-outlook-label")).toContainText("current-fitness estimate");
});

test("Readiness keeps navigation during loading and reports an error instead of empty data", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/dashboard/overview", async (route) => {
    await held;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "temporarily unavailable" } }) });
  });
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: status }) }));
  await page.goto("/dashboard/readiness");
  await expect(page.getByRole("status", { name: "Loading Race Predictor" })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: "Current-fitness estimate" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByText("Online dashboard data is temporarily unavailable.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No supported outlook yet" })).toHaveCount(0);
});

test("redesign import flow protects schema-valid partial-result messaging and recovery", async ({ page }) => {
  await page.route("**/api/v1/providers/strava/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { connection: { displayStatus: "disconnected" } } }) }));
  await page.route("**/api/v1/imports/upload", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { importId: "import_partial_1", status: "completed", sourceType: "gpx", stagedCount: 3, normalizedCount: 2, duplicateCount: 0, rejectedCount: 1, parseWarnings: ["Source row 3 was missing a timestamp."] } }) }));
  await page.goto("/dashboard/data-quality");
  await expect(page.getByRole("heading", { name: "Choose one source" })).toBeVisible();
  await page.getByLabel("CSV or GPX file").setInputFiles({ name: "partial-run.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from("<gpx />") });
  await page.getByRole("button", { name: "Import selected file" }).click();
  await expect(page.getByRole("heading", { name: "Validation summary" })).toBeVisible();
  await expect(page.getByText("Recorded limitation")).toBeVisible();
  await expect(page.getByText(/rejected rows need correction/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Correct file" })).toBeVisible();
});

test("mobile activity filters stay usable beside the shared dashboard navigation", async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard/activities");
    const primary = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(primary.getByRole("link", { name: "Home", exact: true })).toBeVisible();
    await expect(primary.getByRole("link", { name: "Readiness", exact: true })).toBeVisible();
    await expect(primary.getByRole("link", { name: "Calendar", exact: true })).toBeVisible();
    await page.locator(".activity-filter-disclosure summary").click();
    const dateInputs = page.locator('.activity-filters input[type="date"]');
    const firstDate = await dateInputs.nth(0).boundingBox();
    const secondDate = await dateInputs.nth(1).boundingBox();
    expect(firstDate).not.toBeNull();
    expect(secondDate).not.toBeNull();
    expect(firstDate!.x + firstDate!.width).toBeLessThanOrEqual(width);
    expect(secondDate!.x + secondDate!.width).toBeLessThanOrEqual(width);
    expect(secondDate!.y).toBeGreaterThan(firstDate!.y + firstDate!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
