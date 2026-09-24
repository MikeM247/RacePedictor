import { expect, test, type Page } from "@playwright/test";
import { expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";

const activity = {
  id: "activity-f08-return", athleteId: "e2e_athlete", title: "F08 recovery run",
  occurredAt: "2026-09-13T04:00:00.000Z", localOccurredAt: "2026-09-13T06:00:00.000+02:00",
  sport: "run", distanceM: 6_000, elapsedTimeS: 2_700, avgPaceSecPerKm: 450,
  elevationGainM: 20, hrAvailable: false, cadenceAvailable: false,
};
const olderActivity = { ...activity, id: "activity-f08-older", title: "F08 older recovery run" };

async function mockDataQuality(page: Page, onUpload: () => void) {
  let resolveInitialReads!: () => void;
  const initialReads = new Promise<void>((resolve) => { resolveInitialReads = resolve; });
  let reads = 0;
  const completeRead = () => { reads += 1; if (reads === 2) resolveInitialReads(); };
  await page.route("**/api/v1/providers/strava/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { connection: { displayStatus: "connected" } } }) });
    completeRead();
  });
  await page.route("**/api/v1/auth/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { actor: { activeAthleteId: "e2e_athlete" } } }) });
    completeRead();
  });
  await page.route("**/api/v1/imports/upload", (route) => {
    onUpload();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {
      importId: "import_f08_1", status: "completed", sourceType: "gpx", stagedCount: 1,
      normalizedCount: 1, duplicateCount: 0, rejectedCount: 0, parseWarnings: [], analyticsRefreshed: false,
    } }) });
  });
  return { initialReads };
}

function detail() {
  return { activity: { ...activity, sourceType: "gpx", endedAt: "2026-09-13T04:45:00.000Z", elevationLossM: 12, dedupeHash: "f".repeat(64), createdAt: "2026-09-13T05:00:00.000Z", splits: [], routeSignature: null } };
}

test("F08 keeps a completed File result source-owned and dispatches one upload under rapid activation at a compact viewport", async ({ page }) => {
  let uploadCount = 0;
  const { initialReads } = await mockDataQuality(page, () => { uploadCount += 1; });
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto("/dashboard/data-quality");
  await initialReads;
  await page.getByLabel("CSV or GPX file").setInputFiles({ name: "f08.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from("<gpx />") });
  await page.getByRole("button", { name: "Import selected file" }).dblclick();
  await expect(page.getByRole("heading", { name: "Validation summary" })).toBeVisible();
  expect(uploadCount).toBe(1);
  await expect(page.getByRole("radio", { name: "Upload a file" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Import last 90 days" })).toHaveCount(0);
  await expect(page.getByText(/assessment remains older/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to Training" })).toBeVisible();
  await page.getByRole("button", { name: "Import another file" }).click();
  await page.getByLabel("CSV or GPX file").setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("not an activity") });
  await page.getByRole("button", { name: "Import selected file" }).click();
  await expect(page.getByText("This file type is not supported.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Validation summary" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(720);
});

test("F08 restores a selected Training assessment, filters, position and focus without recovery writes", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  const cursorReads: string[] = [];
  await page.route("**/api/v1/activities**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("cursor")) cursorReads.push(url.searchParams.get("cursor")!);
    if (url.pathname === `/api/v1/activities/${activity.id}`) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail()) });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.get("cursor") === "f08_next"
        ? { items: [olderActivity] }
        : { items: [activity], nextCursor: "f08_next" }),
    });
  });
  let uploads = 0;
  const { initialReads } = await mockDataQuality(page, () => { uploads += 1; });
  await page.goto("/dashboard/activities");
  await page.locator(".activity-filter-disclosure summary").click();
  await page.getByLabel("Search activities").fill("F08 recovery");
  await page.getByRole("button", { name: "Apply filters" }).click();
  const row = page.getByRole("button", { name: /F08 recovery run/ });
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Load more activities" }).click();
  await expect(page.getByRole("button", { name: /F08 older recovery run/ })).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { name: "F08 recovery run" })).toBeVisible();
  await page.getByRole("link", { name: "Add training" }).click();
  await expect(page.getByRole("heading", { name: "Data Quality" })).toBeVisible();
  await initialReads;
  await page.getByLabel("CSV or GPX file").setInputFiles({ name: "return.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from("<gpx />") });
  await expect(page.getByRole("button", { name: "Import selected file" })).toBeEnabled();
  await page.getByRole("button", { name: "Import selected file" }).click();
  await expect(page.getByRole("link", { name: "Return to session" })).toBeVisible();
  await page.getByRole("link", { name: "Return to session" }).click();
  await expect(page.getByRole("heading", { name: "F08 recovery run" })).toBeVisible();
  await expect(page.getByLabel("Search activities")).toHaveValue("F08 recovery");
  await expect(page.getByRole("button", { name: /F08 recovery run/ })).toBeFocused();
  expect(uploads).toBe(1);
  expect(writes).toEqual([{ method: "POST", path: "/api/v1/imports/upload", body: expect.any(String) }]);
  expect(cursorReads.filter((cursor) => cursor === "f08_next")).toHaveLength(2);
});
