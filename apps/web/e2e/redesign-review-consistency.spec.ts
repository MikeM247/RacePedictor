import { expect, test, type Page } from "@playwright/test";

const activity = {
  id: "f03-activity", athleteId: "f03-athlete", title: "F03 recorded run",
  occurredAt: "2026-09-15T04:00:00.000Z", localOccurredAt: "2026-09-15T06:00:00.000+02:00",
  sport: "run", distanceM: 8_000, elapsedTimeS: 2_400, avgPaceSecPerKm: 300,
  elevationGainM: 60, hrAvailable: true, cadenceAvailable: true,
};
const activityDetail = { ...activity, endedAt: "2026-09-15T04:40:00.000Z", sourceType: "gpx", elevationLossM: 50, dedupeHash: "a".repeat(64), createdAt: "2026-09-15T05:00:00.000Z", splits: [], routeSignature: null };
const review = {
  id: "f03-review", athleteId: "f03-athlete", activityId: activity.id, revision: 9, inputFingerprint: "b".repeat(64),
  headline: "A controlled recorded run.", assessment: "The recorded pace remained controlled. This does not establish race readiness.", nextStep: "Keep the next approved session easy.",
  comparison: { matchState: "suggested", planId: "f03-plan", sessionId: null, planVersion: 3, sessionTitle: null, plannedDurationMinutes: 45, actualDurationMinutes: 40, plannedDistanceMeters: 8_000, actualDistanceMeters: 8_000, plannedIntensityRpe: 3, actualPerceivedEffort: 3, interpretation: "The proposed match remains qualified until it is confirmed." },
  evidence: [{ source: "activity", label: "Recorded duration", reference: activity.id }], limitations: ["Heart-rate data was not supplied."],
  generatedAt: "2026-09-15T06:00:00.000Z", publishedAt: "2026-09-15T06:01:00.000Z", model: "f03-model", promptVersion: "f03.v1",
};

async function mockReviewSurfaces(page: Page) {
  const overview = { fetchStatus: "success", stale: { isStale: false }, data: { predictionSummary: { athleteId: "f03-athlete", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "f03-model", generatedAt: "2026-09-15T06:00:00.000Z" }, predictionOptions: [], driverContributions: [], featureTrendPoints: [], importProgress: { status: "completed", stagedCount: 1, normalizedCount: 1, duplicateCount: 0, rejectedCount: 0 } } };
  const syncStatus = { athleteId: "f03-athlete", providerConnection: { state: "current", displayStatus: "connected" }, ingestion: { state: "current" }, activityData: { state: "current" }, localDevice: { state: "current" }, secondBrain: { state: "current" }, updatedAt: "2026-09-15T06:00:00.000Z" };
  const activePlan = { id: "f03-plan", athleteId: "f03-athlete", version: 3, startsOn: "2026-09-01", endsOn: "2026-09-28", timezone: "Africa/Johannesburg" };
  let failFutureReviewReads = false;
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: syncStatus }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { athleteId: "f03-athlete", date: "2026-09-15", timezone: "Africa/Johannesburg", state: "rest", status: "rest", message: "Rest scheduled.", goal: null, plan: null, session: null, localCue: "Recover.", stale: { isStale: false }, links: { plan: "/dashboard/plan", calendar: "/dashboard/calendar", session: null } } }) }));
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: activePlan }) }));
  await page.route("**/api/v1/coaching/calendar**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { sessions: [], activities: [{ ...activity, localDate: "2026-09-15" }] } }) }));
  await page.route("**/api/v1/activities**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/coach-review")) {
      if (failFutureReviewReads) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Feedback unavailable" } }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { activityId: activity.id, status: "ready", review, requestId: "f03-request", updatedAt: review.publishedAt, readRevision: null } }) });
    }
    const body = path === "/api/v1/activities" ? { data: { items: [activity] } } : { data: { activity: activityDetail } };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { failFutureReviewReads: () => { failFutureReviewReads = true; } };
}

test("F03 reuses the same persisted review, qualification, and evidence on Home, Training, and Calendar", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url()); });
  await mockReviewSurfaces(page);

  await page.goto("/dashboard");
  await expect(page.getByText("Suggested plan match — not confirmed", { exact: false })).toBeVisible();
  await expect(page.getByText("Heart-rate data was not supplied.")).toBeVisible();
  await page.getByRole("link", { name: "View full session review" }).click();
  await expect(page.getByRole("heading", { name: "A controlled recorded run." })).toBeVisible();
  await page.getByText("Review evidence").click();
  await expect(page.getByText("Review revision 9.")).toBeVisible();
  await expect(page.getByText(`Recorded duration (activity) · Reference: ${activity.id}`)).toBeVisible();
  await expect(page.getByText("This advisory review does not change your approved prescription.")).toBeVisible();

  await page.setViewportSize({ width: 1200, height: 844 });
  await page.goto("/dashboard/calendar?date=2026-09-15");
  await page.getByRole("button", { name: "Weeks" }).click();
  const day = page.locator(".calendar-day").filter({ hasText: "F03 recorded run" });
  await day.getByRole("button", { name: /View details for/ }).click();
  const dialog = page.getByRole("dialog", { name: "Run details" });
  await expect(dialog.getByRole("heading", { name: "A controlled recorded run." })).toBeVisible();
  await expect(dialog.getByText("Suggested plan match — not confirmed", { exact: false })).toBeVisible();
  await dialog.getByText("Review evidence").click();
  await expect(dialog.getByText(`Recorded duration (activity) · Reference: ${activity.id}`)).toBeVisible();
  expect(writes).toEqual([]);
});

test("F03 retains a saved detail review when a manual refresh fails", async ({ page }) => {
  const fixture = await mockReviewSurfaces(page);
  await page.goto(`/dashboard/activities?activityId=${activity.id}`);
  await expect(page.getByRole("heading", { name: "A controlled recorded run." })).toBeVisible();
  fixture.failFutureReviewReads();
  await page.getByRole("button", { name: "Check for updated feedback" }).click();
  await expect(page.getByText("Feedback unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "A controlled recorded run." })).toBeVisible();
});
