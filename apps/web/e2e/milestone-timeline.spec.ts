import { expect, test, type Page } from "@playwright/test";
import { resetMilestoneFixtureState } from "./milestone-read-fixture.ts";
import { expectAxeClean, recordApplicationWrites } from "./test-helpers.ts";

async function setup(page: Page) {
  resetMilestoneFixtureState();
  const response = await page.request.get("/api/v1/coaching/race-history");
  expect(response.ok()).toBeTruthy();
  for (const record of (await response.json()).data.items) await page.request.delete(`/api/v1/coaching/race-history?id=${record.id}&revision=${record.revision}`);
  const saved = await page.request.put("/api/v1/coaching/race-history", { data: { expectedRevision: 0, record: {
    id: "spring-result", title: "My spring race result", confirmedBy: "user", achievement: "goal_achieved", raceDate: "2026-10-04", distanceMeters: 10000, elapsedTimeSeconds: 3700,
  } } });
  expect(saved.ok()).toBeTruthy();
}
const view = async (page: Page) => (await (await page.request.get("/api/v1/coaching/milestones?includeRemoved=true")).json()).data;
async function openTargets(page: Page) {
  await page.goto("/dashboard/settings?section=milestones");
  await page.getByRole("button", { name: /^Race targets/ }).click();
}

test("real API removal reaches Home, survives another session, restores and preserves original sources", async ({ page, context }, info) => {
  await setup(page);
  const original = await (await page.request.get("/api/v1/coaching/goal-context/active")).json();
  await openTargets(page);
  const writes = recordApplicationWrites(page);
  await page.getByRole("button", { name: "Remove Summer half marathon from milestones", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Remove from milestones?" });
  await dialog.getByRole("button", { name: "Keep milestone" }).click(); expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Remove Summer half marathon from milestones", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Remove from milestones?" });
  await dialog.getByRole("button", { name: "Remove from milestones", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Summer half marathon", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo removal" }).click();
  await expect(page.getByRole("heading", { name: "Summer half marathon", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove Summer half marathon from milestones", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove from milestones", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const other = await context.newPage(); await other.goto("/dashboard");
  await expect(other.locator(".road-milestone-count")).toHaveText("3 milestones");
  await expect(other.locator(".road-stop-title", { hasText: "Summer half marathon" })).toHaveCount(0);
  await other.close();
  await page.reload(); await page.getByRole("button", { name: /^Removed milestones/ }).click();
  await page.getByRole("button", { name: "Restore Summer half marathon", exact: true }).click();
  await expect(page.getByText("No removed milestones.")).toBeVisible();
  expect(await (await page.request.get("/api/v1/coaching/goal-context/active")).json()).toEqual(original);
  expect((await (await page.request.get("/api/v1/coaching/race-history")).json()).data.items).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("button", { name: /^Race targets/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAxeClean(page, "Saved milestone controls");
  await page.screenshot({ path: info.outputPath("milestone-settings-mobile.png"), fullPage: true });
});

test("explicit different-name race linking collapses the duplicate without awarding a missed time target", async ({ page }, info) => {
  await setup(page); await openTargets(page);
  await page.getByRole("button", { name: "Link to existing achievement for Spring 10 km", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Link to existing achievement", exact: true });
  await dialog.getByLabel("Existing achievement").selectOption("spring-result");
  await expect(dialog.getByRole("button", { name: "Link race and achievement" })).toBeDisabled();
  await dialog.getByLabel("I confirm these entries represent the same race.").check();
  await dialog.getByRole("button", { name: "Link race and achievement" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".road-milestone-count")).toHaveText("3 milestones");
  await expect(page.locator(".road-stop--achieved", { hasText: "My spring race result" })).toContainText("Completed · target missed");
  await expect(page.locator(".road-timeline-group--ahead", { hasText: "Spring 10 km" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("reconciled-milestone-home.png"), fullPage: true });
  await page.goto("/dashboard/settings?section=milestones");
  await page.getByRole("button", { name: "Remove My spring race result from milestones", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove from milestones", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/dashboard"); await expect(page.locator(".road-milestone-count")).toHaveText("2 milestones");
  await expect(page.locator(".road-stop-title", { hasText: /My spring race result|Spring 10 km/u })).toHaveCount(0);
  await page.goto("/dashboard/settings?section=milestones"); await page.getByRole("button", { name: /^Removed milestones/ }).click();
  await page.getByRole("button", { name: "Restore My spring race result", exact: true }).click();
  await page.getByRole("button", { name: /^Achievements/ }).click();
  await page.getByRole("button", { name: "Unlink approved race My spring race result", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Unlink race and achievement", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible(); expect((await view(page)).entries).toHaveLength(4);
});

test("stale revisions require reload; a failed read never resurrects removed targets", async ({ page }) => {
  await setup(page); await openTargets(page);
  await page.getByRole("button", { name: "Remove Summer half marathon from milestones", exact: true }).click();
  const current = await view(page);
  const change = { operation: "remove", entryId: "target:summer", expectedRevision: current.revision, sourceVersion: current.sourceVersion };
  expect((await page.request.post("/api/v1/coaching/milestones/changes", { data: change })).ok()).toBeTruthy();
  await page.getByRole("dialog").getByRole("button", { name: "Remove from milestones", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("changed");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Remove from milestones", exact: true })).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Reload saved milestones" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/dashboard"); await expect(page.locator(".road-milestone-count")).toHaveText("3 milestones");
  await page.route(/\/api\/v1\/coaching\/milestones(?:\?.*)?$/u, (route) => route.fulfill({ status: 503, json: { error: { message: "unavailable" } } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Showing your last saved milestone view. Refresh unavailable.")).toBeVisible();
  await expect(page.locator(".road-stop-title", { hasText: "Summer half marathon" })).toHaveCount(0);
  await page.reload(); await expect(page.getByText("Your milestone view could not be loaded.")).toBeVisible();
  await expect(page.locator(".road-stop-title")).toHaveCount(0);
});

test("an applied write with a lost response is recovered by reload without applying the change twice", async ({ page }) => {
  await setup(page); await openTargets(page);
  await page.route("**/api/v1/coaching/milestones/changes", async (route) => { await route.fetch(); await route.abort("failed"); });
  await page.getByRole("button", { name: "Remove Summer half marathon from milestones", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Remove from milestones", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("save response could not be verified");
  await expect(dialog.getByRole("button", { name: "Remove from milestones", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Reload saved milestones" }).click();
  await expect(dialog).not.toBeVisible();
  expect((await view(page)).revision).toBe(1); expect((await view(page)).removed).toHaveLength(1);
});

test("confirmed race identity reconciles a GPS-distance mismatch without changing result facts", async ({ page }) => {
  await setup(page);
  const current = (await (await page.request.get("/api/v1/coaching/race-history")).json()).data.items[0];
  expect((await page.request.put("/api/v1/coaching/race-history", { data: { record: { ...current, distanceMeters: 10050 }, expectedRevision: current.revision } })).ok()).toBeTruthy();
  await openTargets(page);
  await page.getByRole("button", { name: "Link to existing achievement for Spring 10 km", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Link to existing achievement", exact: true });
  await dialog.getByLabel("Existing achievement").selectOption("spring-result");
  await expect(dialog.getByText(/saved date or distance differs/)).toBeVisible();
  await dialog.getByLabel("I confirm these entries represent the same race.").check();
  await dialog.getByRole("button", { name: "Link race and achievement" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".road-milestone-count")).toHaveText("3 milestones");
  await expect(page.locator(".road-stop--achieved", { hasText: "My spring race result" })).toContainText("Completed · target unassessed");
  const saved = (await (await page.request.get("/api/v1/coaching/race-history")).json()).data.items[0];
  expect(saved.distanceMeters).toBe(10050); expect(saved.elapsedTimeSeconds).toBe(3700); expect(saved.revision).toBe(current.revision + 1);
});
