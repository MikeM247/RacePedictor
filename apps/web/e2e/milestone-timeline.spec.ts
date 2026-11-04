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
  await expect(other.locator(".achievement-stops > .achievement-stop")).toHaveCount(3);
  await expect(other.locator(".achievement-stop", { hasText: "Summer half marathon" })).toHaveCount(0);
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
  await expect(page.locator(".achievement-stops > .achievement-stop")).toHaveCount(3);
  await expect(page.locator(".achievement-stop", { hasText: "My spring race result" })).toContainText("Completed · target missed");
  await expect(page.locator(".achievement-stop", { hasText: "Spring 10 km" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("reconciled-milestone-home.png"), fullPage: true });
  await page.goto("/dashboard/settings?section=milestones");
  await page.getByRole("button", { name: "Remove My spring race result from milestones", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove from milestones", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/dashboard"); await expect(page.locator(".achievement-stops > .achievement-stop")).toHaveCount(2);
  await expect(page.locator(".achievement-stop", { hasText: /My spring race result|Spring 10 km/u })).toHaveCount(0);
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
  await page.goto("/dashboard"); await expect(page.locator(".achievement-stops > .achievement-stop")).toHaveCount(3);
  await page.route(/\/api\/v1\/coaching\/milestones(?:\?.*)?$/u, (route) => route.fulfill({ status: 503, json: { error: { message: "unavailable" } } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Showing your last saved milestone view.")).toBeVisible();
  await expect(page.locator(".achievement-stop", { hasText: "Summer half marathon" })).toHaveCount(0);
  await page.reload(); await expect(page.getByText("Milestones unavailable.")).toBeVisible();
  await expect(page.locator(".achievement-stop")).toHaveCount(0);
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
  await expect(page.locator(".achievement-stops > .achievement-stop")).toHaveCount(3);
  await expect(page.locator(".achievement-stop", { hasText: "My spring race result" })).toContainText("Completed · target unassessed");
  const saved = (await (await page.request.get("/api/v1/coaching/race-history")).json()).data.items[0];
  expect(saved.distanceMeters).toBe(10050); expect(saved.elapsedTimeSeconds).toBe(3700); expect(saved.revision).toBe(current.revision + 1);
});

test("manual completion preview is read-only and confirmation persists one assessed milestone", async ({ page }) => {
  await setup(page);
  const before = await view(page);
  const command = { operation: "link", entryId: "target:spring", achievementId: "completion-result", confirmedSameRace: true,
    expectedRevision: before.revision, sourceVersion: before.sourceVersion,
    result: { expectedRevision: 0, record: { id: "completion-result", title: "Confirmed spring race", confirmedBy: "user", targetId: "spring",
      officialResult: { confirmedBy: "user", raceDate: "2026-10-04", distanceMeters: 10000, elapsedTimeSeconds: 3563 } } } };
  const response = await page.request.post("/api/v1/coaching/milestones/results/preview", { data: command });
  expect(response.ok(), await response.text()).toBeTruthy();
  const preview = (await response.json()).data;
  expect((await view(page)).revision).toBe(before.revision);
  const confirmed = await page.request.post("/api/v1/coaching/milestones/results/confirm", { data: { ...command, previewDigest: preview.digest } });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  const next = (await confirmed.json()).data;
  const result = next.entries.find((e: { achievement?: { id: string } }) => e.achievement?.id === "completion-result");
  expect(result.completion).toBe("completed"); expect(result.performance).toBe("achieved"); expect(result.timeDifferenceSeconds).toBe(-37);
  const replay = await page.request.post("/api/v1/coaching/milestones/results/confirm", { data: { ...command, previewDigest: preview.digest } });
  expect(replay.status()).toBe(409);
  await page.goto("/dashboard/settings?section=milestones");
  await expect(page.getByRole("heading", { name: "Confirmed spring race", exact: true })).toBeVisible();
  await page.reload();
  expect((await view(page)).entries.filter((e: { achievement?: { id: string } }) => e.achievement?.id === "completion-result")).toHaveLength(1);
});

test("manual completion editor reviews and confirms a result from its milestone", async ({ page }) => {
  await setup(page);
  await page.goto("/dashboard/settings?section=milestones&milestone=spring");
  await page.getByLabel("Milestone name", { exact: true }).fill("Manual spring finish");
  await page.getByLabel("Elapsed result", { exact: true }).fill("59:23");
  await page.getByLabel("I confirm this race result or achievement, including any personal-best claim.", { exact: true }).check();
  await page.getByRole("button", { name: "Review result", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm result and complete milestone", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm result and complete milestone", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Manual spring finish", exact: true })).toBeVisible();
  const next = await view(page);
  expect(next.entries.filter((e: { sources: { id: string }[] }) => e.sources.some(s => s.id === "spring"))).toHaveLength(1);
});

test("race review dialog confirms a candidate into one completed milestone across sessions", async ({ page, context }) => {
  await setup(page);
  const reviewResponse = await page.request.get("/api/v1/coaching/milestones/reviews");
  expect(reviewResponse.ok(), await reviewResponse.text()).toBeTruthy();
  const reviewData = (await reviewResponse.json()).data;
  expect(reviewData.candidates.length, JSON.stringify(reviewData)).toBeGreaterThan(0);
  await page.goto("/dashboard");
  const dialog=page.getByRole("dialog",{name:"Review a possible completed milestone"});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Spring 10 km",{exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"Confirm result and complete milestone"}).click();
  await expect(dialog).not.toBeVisible();
  const result=(await view(page)).entries.find((entry:{achievement?:{id:string}})=>entry.achievement?.id==="spring-result");
  expect(result?.completion).toBe("completed");
  const other=await context.newPage(); await other.goto("/dashboard");
  await expect(other.getByRole("dialog",{name:"Review a possible completed milestone"})).toHaveCount(0);
  await other.close();
});

test("Later and Not this race persist across reloads and do not repeat unchanged prompts", async ({ page }) => {
  await setup(page); await page.goto("/dashboard");
  let dialog=page.getByRole("dialog",{name:"Review a possible completed milestone"});
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Later"}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "One milestone closer." })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("dialog",{name:"Review a possible completed milestone"})).toHaveCount(0);
  await setup(page); await page.goto("/dashboard");
  dialog=page.getByRole("dialog",{name:"Review a possible completed milestone"});
  await expect(dialog).toBeVisible(); await dialog.getByRole("button",{name:"Not this race"}).click();
  await expect(dialog).not.toBeVisible(); await page.reload();
  await expect(page.getByRole("dialog",{name:"Review a possible completed milestone"})).toHaveCount(0);
});

test("ambiguous reviews let the athlete select a result and do not offer another result for a linked target", async ({ page }) => {
  await setup(page);
  const saved = await page.request.put("/api/v1/coaching/race-history", { data: { expectedRevision: 0, record: {
    id: "spring-alternative", title: "Alternative spring result", confirmedBy: "user", achievement: "goal_achieved", raceDate: "2026-10-04", distanceMeters: 10000, elapsedTimeSeconds: 3590,
  } } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const reviews = (await (await page.request.get("/api/v1/coaching/milestones/reviews")).json()).data.candidates;
  expect(reviews).toHaveLength(2); expect(reviews.every((candidate: { ambiguous: boolean }) => candidate.ambiguous)).toBeTruthy();
  await page.goto("/dashboard");
  const dialog = page.getByRole("dialog", { name: "Review a possible completed milestone" });
  await expect(dialog.getByRole("group", { name: "Choose the result that belongs to this race" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth && node.getBoundingClientRect().width <= innerWidth)).toBeTruthy();
  await expectAxeClean(page, "Multi-result milestone review dialog");
  await expect(dialog.getByRole("button", { name: "Confirm result and complete milestone" })).toBeDisabled();
  await dialog.getByLabel(/Alternative spring result/).check();
  await expect(dialog.getByRole("button", { name: "Confirm result and complete milestone" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Confirm result and complete milestone" }).click();
  await expect(dialog).not.toBeVisible();
  expect((await (await page.request.get("/api/v1/coaching/milestones/reviews")).json()).data.candidates).toHaveLength(0);
  const timeline = await view(page);
  expect(timeline.entries.filter((entry: { sources: { kind: string; id: string }[] }) => entry.sources.some(source => source.kind === "target" && source.id === "spring"))).toHaveLength(1);
});

test("Settings keeps pending race matches discoverable and opens the suggested result for explicit confirmation", async ({ page }) => {
  await setup(page);
  await page.goto("/dashboard/settings?section=milestones");
  const review = page.getByRole("complementary", { name: "Race results awaiting review (1)" });
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Review suggested result" }).click();
  const dialog = page.getByRole("dialog", { name: "Link to existing achievement" });
  await expect(dialog.getByLabel("Existing achievement")).toHaveValue("spring-result");
  await dialog.getByLabel("I confirm these entries represent the same race.").check();
  await dialog.getByRole("button", { name: "Link race and achievement" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("complementary", { name: /Race results awaiting review/ })).toHaveCount(0);
  const linked = (await view(page)).entries.find((entry: { achievement?: { id: string } }) => entry.achievement?.id === "spring-result");
  expect(linked?.completion).toBe("completed");
});

test("a result synced while Home is open triggers a review at the next safe page event", async ({ page }) => {
  await setup(page);
  const existing = (await (await page.request.get("/api/v1/coaching/race-history")).json()).data.items[0];
  expect((await page.request.delete(`/api/v1/coaching/race-history?id=${existing.id}&revision=${existing.revision}`)).ok()).toBeTruthy();
  await page.goto("/dashboard");
  const dialog = page.getByRole("dialog", { name: "Review a possible completed milestone" });
  await expect(dialog).toHaveCount(0);
  const synced = await page.request.put("/api/v1/coaching/race-history", { data: { expectedRevision: 0, record: {
    id: "synced-spring-result", title: "Synced spring result", confirmedBy: "user", achievement: "goal_achieved", raceDate: "2026-10-04", distanceMeters: 10000, elapsedTimeSeconds: 3590,
  } } });
  expect(synced.ok(), await synced.text()).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event("race-history-changed")));
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Synced spring result", { exact: true })).toBeVisible();
});
