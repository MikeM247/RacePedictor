import { expect, test, type Page } from "@playwright/test";
import { expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";

const base = {
  athleteId: "e2e_athlete", sport: "run", distanceM: 8_000, elapsedTimeS: 2_400, avgPaceSecPerKm: 300,
  elevationGainM: 60, hrAvailable: true, cadenceAvailable: true, occurredAt: "2026-09-14T04:00:00.000Z", localOccurredAt: "2026-09-14T06:00:00.000+02:00",
};
const first = { ...base, id: "f04-first", title: "F04 first" };
const second = { ...base, id: "f04-second", title: "F04 second", occurredAt: "2026-09-13T04:00:00.000Z" };
const third = { ...base, id: "f04-third", title: "F04 selected beyond page one", occurredAt: "2026-09-12T04:00:00.000Z" };
const details = (activity: typeof first) => ({ activity: { ...activity, sourceType: "gpx", endedAt: "2026-09-14T04:40:00.000Z", elevationLossM: 50, dedupeHash: "f".repeat(64), createdAt: "2026-09-14T05:00:00.000Z", avgHrBpm: 152, splits: [{ id: `${activity.id}-split`, activityId: activity.id, athleteId: activity.athleteId, splitIndex: 0, startOffsetS: 0, endOffsetS: 300, durationS: 300, distanceM: 1_000, paceSecPerKm: 300, elevGainM: 0, elevLossM: 0, createdAt: "2026-09-14T05:00:00.000Z" }], routeSignature: null } });

async function fixtureTraining(page: Page) {
  await page.route("**/api/v1/activities**", async (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").at(-1);
    if (url.pathname !== "/api/v1/activities") {
      if (id === "f04-missing") return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }) });
      if (id === "f04-unavailable") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Unavailable" } }) });
      if (id === "f04-malformed") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ activity: { id: "broken" } }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(details(id === third.id ? third : id === second.id ? second : first)) });
    }
    if (url.searchParams.get("search") === "empty") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
    if (url.searchParams.get("search") === "outage") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "History offline" } }) });
    if (url.searchParams.get("cursor") === "page-2") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [second], nextCursor: "page-3" }) });
    if (url.searchParams.get("cursor") === "page-3") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [third] }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [first], nextCursor: "page-2" }) });
  });
  await page.route("**/api/v1/activities/*/coach-review", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { activityId: "f04-third", status: "unavailable", review: null, requestId: null, updatedAt: "2026-09-14T05:00:00.000Z", readRevision: null } }) }));
}

async function loadFixtureTrainingHistory(page: Page) {
  await page.locator(".activity-filter-disclosure summary").click();
  await page.getByLabel("Search activities").fill("F04");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("button", { name: /F04 first/ })).toBeVisible();
}

test("F04 keeps a selected detail and its parent control while filters are empty or history fails", async ({ page }) => {
  await fixtureTraining(page);
  await page.goto("/dashboard/activities");
  await loadFixtureTrainingHistory(page);
  await page.getByRole("button", { name: "Load more activities" }).click();
  await page.getByRole("button", { name: "Load more activities" }).click();
  const selected = page.getByRole("button", { name: /F04 selected beyond page one/ });
  await selected.click();
  await expect(page.getByRole("heading", { name: "F04 selected beyond page one" })).toBeVisible();
  await page.getByLabel("Search activities").fill("empty");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: "No matching activities" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "F04 selected beyond page one" })).toBeVisible();
  await expect(page.getByRole("button", { name: "← Back to Training" })).toBeVisible();
  await page.getByLabel("Search activities").fill("outage");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("Could not load training history.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "F04 selected beyond page one" })).toBeVisible();
});

test("F04 restores three loaded pages and focus through Back, keeps disclosures local, and never writes", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await fixtureTraining(page);
  await page.goto("/dashboard/activities");
  await loadFixtureTrainingHistory(page);
  await page.getByRole("button", { name: "Load more activities" }).click();
  await page.getByRole("button", { name: "Load more activities" }).click();
  const selected = page.getByRole("button", { name: /F04 selected beyond page one/ });
  await selected.click();
  await expect(page.getByRole("heading", { name: "F04 selected beyond page one" })).toBeFocused();
  for (const name of ["Additional telemetry", "Splits", "Route details"]) await expect(page.locator("details", { hasText: name }).first()).not.toHaveAttribute("open", "");
  await page.locator("details", { hasText: "Additional telemetry" }).locator("summary").click();
  await expect(page.getByText("Average heart rate")).toBeVisible();
  await page.getByRole("button", { name: "← Back to Training" }).click();
  await expect(page.getByRole("button", { name: /F04 first/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /F04 second/ })).toBeVisible();
  await expect(selected).toBeVisible();
  await expect(selected).toBeFocused();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "F04 selected beyond page one" })).toBeVisible();
  await expect(page.getByText("Average heart rate")).toBeVisible();
  expectNoApplicationWrites(writes);
});

test("F04 exposes safe direct-entry error states and contextual Home and Calendar parents", async ({ page }) => {
  await fixtureTraining(page);
  await page.goto("/dashboard/activities?activityId=f04-missing&returnTo=%2Fdashboard");
  await expect(page.getByText(/no longer available/)).toBeVisible();
  await expect(page.getByRole("button", { name: "← Back to Home" })).toBeVisible();
  await page.goto("/dashboard/activities?activityId=f04-unavailable&returnTo=%2Fdashboard%2Fcalendar");
  await expect(page.getByText(/temporarily unavailable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "← Back to Calendar" })).toBeVisible();
  await page.goto("/dashboard/activities?activityId=f04-malformed");
  await expect(page.getByText(/could not be read safely/)).toBeVisible();
  await expect(page.getByRole("button", { name: "← Back to Training" })).toBeVisible();
});
