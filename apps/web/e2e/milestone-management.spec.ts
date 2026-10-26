import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { coachingFixtures } from "./coaching-fixtures.ts";
import { expectAxeClean, recordApplicationWrites } from "./test-helpers.ts";
import type { RaceHistoryRecord } from "../../../packages/core/src/contracts/race-history.ts";
import { milestoneChangeRequestSchema, prepareMilestoneChange } from "../../../packages/core/src/services/milestone-management.ts";
import { mockMilestoneRead, resetMilestoneFixtureState } from "./milestone-read-fixture.ts";

const context = {
  state: "ready", plan: { id: "milestone-plan", version: 3, revision: 2, startsOn: "2026-09-01", endsOn: "2027-02-28", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) },
  goal: { id: "milestone-goal", athleteId: "e2e_athlete", revision: 2, title: "My marathon goal", why: "A purposeful journey", target: { kind: "performance", distanceMeters: 42195, targetDate: "2027-02-28", targetTimeSeconds: 16200 } },
  milestones: [{ id: "spring", title: "Spring 10 km", targetDate: "2026-10-04", distanceMeters: 10000, targetTimeSeconds: 3600 }, { id: "summer", title: "Summer half marathon", targetDate: "2026-11-22", distanceMeters: 21100, targetTimeSeconds: 7500 }], projection: null,
};
const activity = (id: string, title: string, date: string, elapsed: number) => ({ id, athleteId: "e2e_athlete", title, occurredAt: `${date}T06:00:00Z`, localOccurredAt: `${date}T08:00:00+02:00`, sport: "run", distanceM: 10000, elapsedTimeS: elapsed, avgPaceSecPerKm: elapsed / 10, elevationGainM: 0, hrAvailable: false, cadenceAvailable: false });
const races = [activity("milestone-race-a", "Spring 10 km", "2026-10-04", 3522), activity("milestone-race-b", "Winter 10 km", "2026-09-06", 3800)];
const confirmation = "I confirm this race result or achievement, including any personal-best claim.";
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "wait" }); });

async function setup(page: Page, options: { seed?: boolean; context?: unknown } = {}) {
  resetMilestoneFixtureState();
  await mockMilestoneRead(page, options.context ?? context);
  await page.clock.install({ time: new Date("2026-10-21T07:00:00Z") });
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({ json: { data: { context: options.context ?? context } } }));
  await page.route("**/api/v1/activities?**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("search") ?? "";
    return route.fulfill({ json: { data: { items: races.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())) } } });
  });
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ json: coachingFixtures.activePlan() }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ json: coachingFixtures.history() }));
  await page.route("**/api/v1/coaching/proposals/latest", (route) => route.fulfill({ json: coachingFixtures.latestProposal(null) }));
  await page.route("**/api/v1/coaching/context/current", (route) => route.fulfill({ json: coachingFixtures.currentContext(null) }));
  await page.route("**/api/v1/wellbeing-check-ins**", (route) => route.fulfill({ json: { data: { items: [{ id: "milestone-checkin", athleteId: "e2e_athlete", localDate: "2026-10-21", timezone: "Africa/Johannesburg", status: "saved", answers: { overallFeeling: "good" }, revision: 1 }] } } }));
  const response = await page.request.get("/api/v1/coaching/race-history"); expect(response.ok()).toBeTruthy();
  for (const record of (await response.json()).data.items) expect((await page.request.delete(`/api/v1/coaching/race-history?id=${record.id}&revision=${record.revision}`)).ok()).toBeTruthy();
  if (options.seed !== false) expect((await page.request.put("/api/v1/coaching/race-history", { data: { record: { id: "milestone-existing", title: "My first 10 km", achievement: "goal_achieved", confirmedBy: "user" }, expectedRevision: 0 } })).ok()).toBeTruthy();
}
async function openNew(page: Page) {
  await page.getByRole("button", { name: "Add milestone", exact: true }).click();
  await page.getByRole("button", { name: "Achieved milestone", exact: true }).click();
  return page.getByRole("dialog", { name: "Add achieved milestone", exact: true });
}
async function prepareTarget(page: Page) {
  await page.getByRole("button", { name: "Add milestone", exact: true }).click();
  await page.getByRole("button", { name: "Planned race target", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add race target", exact: true });
  await dialog.getByLabel("Milestone name", { exact: true }).fill("December checkpoint");
  await dialog.getByLabel("Target date", { exact: true }).fill("2026-12-13");
  await dialog.getByLabel("Distance, km", { exact: true }).fill("10");
  await dialog.getByLabel("Target time", { exact: true }).fill("55:00");
  await dialog.getByRole("button", { name: "Prepare plan update", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test("management loads without writes, retains the main goal and fits desktop and narrow screens", async ({ page }, info) => {
  test.setTimeout(120_000);
  await setup(page); const writes = recordApplicationWrites(page);
  await page.goto("/dashboard/settings?section=milestones");
  await expect(page.getByRole("heading", { name: "My first 10 km", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My marathon goal", exact: true })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expectAxeClean(page, `Milestone management ${width}`);
    if (width !== 390) await page.screenshot({ path: info.outputPath(`milestones-${width}.png`), fullPage: true });
  }
  expect(writes).toEqual([]);
});
test("creation requires confirmation, keeps unknown facts absent, persists across reload and reaches Home", async ({ page }) => {
  await setup(page, { seed: false }); await page.goto("/dashboard/settings?section=milestones");
  const dialog = await openNew(page);
  await dialog.getByLabel("Milestone name", { exact: true }).fill("My confirmed milestone");
  await expect(dialog.getByRole("button", { name: "Save milestone", exact: true })).toBeDisabled();
  await dialog.getByLabel(confirmation).check(); await dialog.getByRole("button", { name: "Save milestone", exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect(page.getByRole("button", { name: "Add milestone", exact: true })).toBeFocused();
  await page.reload(); await expect(page.getByRole("heading", { name: "My confirmed milestone", exact: true })).toBeVisible();
  const saved = (await (await page.request.get("/api/v1/coaching/race-history")).json()).data.items[0];
  expect(saved.raceDate).toBeUndefined(); expect(saved.elapsedTimeSeconds).toBeUndefined();
  await page.goto("/dashboard"); await expect(page.locator(".road-stop--achieved", { hasText: "My confirmed milestone" })).toBeVisible();
  await page.getByRole("navigation", { name: "Secondary navigation" }).getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings/u);
  await page.locator("summary", { hasText: /^Milestones$/ }).click();
  await expect(page.getByRole("heading", { name: "Milestones", exact: true })).toBeVisible();
});
test("assign change unlink and named removal retain official facts and the original recorded activities", async ({ page }) => {
  await setup(page); await page.goto("/dashboard/settings?section=milestones");
  await page.getByRole("button", { name: "Assign race for My first 10 km", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Edit milestone", exact: true });
  await dialog.getByRole("button", { name: /Spring 10 km/ }).click();
  await expect(dialog.getByLabel("Milestone name", { exact: true })).toHaveValue("My first 10 km");
  await dialog.getByLabel(confirmation).check(); await dialog.getByRole("button", { name: "Save milestone", exact: true }).click();
  await expect(dialog).not.toBeVisible(); await page.reload();
  await page.getByRole("button", { name: "Change race for My first 10 km", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit milestone", exact: true });
  await dialog.getByRole("button", { name: /Winter 10 km/ }).click();
  await dialog.getByRole("button", { name: "Unlink race", exact: true }).click();
  await expect(dialog.getByLabel("Official distance, km (optional)")).toHaveValue("10");
  await expect(dialog.getByLabel("Elapsed result (optional)")).toHaveValue("1:03:20");
  await dialog.getByLabel(confirmation).check(); await dialog.getByRole("button", { name: "Save milestone", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Remove My first 10 km from milestones", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("saved result will stay intact");
  await page.getByRole("button", { name: "Keep milestone", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My first 10 km", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove My first 10 km from milestones", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove from milestones", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My first 10 km", exact: true })).toHaveCount(0); await page.reload();
  expect((await (await page.request.get("/api/v1/coaching/race-history")).json()).data.items).toHaveLength(1);
  const original = await page.request.get("/api/v1/activities?limit=20&search=Spring");
  expect(original.ok(), await original.text()).toBeTruthy(); const originalBody = await original.json(); expect((originalBody.data?.items ?? originalBody.items).some((item: { id: string }) => item.id === races[0].id)).toBeTruthy();
});
test("failed save retains inputs and conflict recovery explicitly reloads the current revision", async ({ page }) => {
  await setup(page); await page.goto("/dashboard/settings?section=milestones");
  await page.getByRole("button", { name: "Edit My first 10 km", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit milestone", exact: true });
  await dialog.getByLabel("Milestone name", { exact: true }).fill("My corrected milestone"); await dialog.getByLabel(confirmation).check();
  await page.route("**/api/v1/coaching/race-history", (route) => route.request().method() === "PUT" ? route.fulfill({ status: 503, json: { error: { message: "unavailable" } } }) : route.fallback());
  await dialog.getByRole("button", { name: "Save milestone", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("inputs are kept"); await expect(dialog.getByLabel("Milestone name", { exact: true })).toHaveValue("My corrected milestone");
  await page.unroute("**/api/v1/coaching/race-history");
  const current = (await (await page.request.get("/api/v1/coaching/race-history")).json()).data.items[0];
  expect((await page.request.put("/api/v1/coaching/race-history", { data: { record: { ...current, title: "Changed elsewhere" }, expectedRevision: current.revision } })).ok()).toBeTruthy();
  await dialog.getByRole("button", { name: "Save milestone", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("another session"); await expect(dialog.getByRole("button", { name: "Save milestone", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Reload saved milestone", exact: true }).click();
  await expect(dialog.getByLabel("Milestone name", { exact: true })).toHaveValue("Changed elsewhere"); await expect(dialog.getByLabel(confirmation)).not.toBeChecked();
});
test("missed and matching results keep completion separate from target performance", async ({ page }) => {
  await setup(page, { seed: false }); await page.goto("/dashboard/settings?section=milestones");
  await page.getByRole("button", { name: /^Race targets/ }).click();
  await page.getByRole("button", { name: "Record result for Spring 10 km", exact: true }).click();
  let dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: /Spring 10 km/ }).click();
  await dialog.getByLabel("Elapsed result", { exact: true }).fill("1:01:00"); await dialog.getByLabel(confirmation).check();
  await dialog.getByRole("button", { name: "Save milestone", exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: /^Achievements/ }).click();
  await expect(page.getByText("Completed · Target missed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Spring 10 km", exact: true }).click(); dialog = page.getByRole("dialog");
  await dialog.getByLabel("Elapsed result", { exact: true }).fill("58:42"); await dialog.getByLabel(confirmation).check();
  await dialog.getByRole("button", { name: "Save milestone", exact: true }).click();
  await expect(page.getByText("Completed · Target achieved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Race targets/ }).click();
  await expect(page.getByRole("heading", { name: "Spring 10 km", exact: true })).toHaveCount(0);
});

test("prepared target changes survive navigation/reload and download a valid request without changing approved data", async ({ page }) => {
  await setup(page); await page.goto("/dashboard/settings?section=milestones"); const writes = recordApplicationWrites(page);
  await prepareTarget(page); await expect(page.getByRole("complementary", { name: "Prepared plan change" })).toContainText("December checkpoint");
  await page.getByRole("link", { name: "Continue in Plan", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Milestone plan update", exact: true })).toBeVisible(); await page.reload();
  await expect(page.getByLabel("Coaching instructions")).toContainText('"id": "spring"');
  await expect(page.getByLabel("Coaching instructions")).toContainText('"id": "summer"');
  await expect(page.getByLabel("Coaching instructions")).toContainText("December checkpoint");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download change request", exact: true }).click()]);
  const request = milestoneChangeRequestSchema.parse(JSON.parse(await readFile((await download.path())!, "utf8"))); expect(request.operation).toBe("add"); expect(request.milestones).toHaveLength(3); expect(request.baseGoal.title).toBe("My marathon goal");
  await page.getByRole("button", { name: "Continue to plan review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set your race goal", exact: true })).toBeVisible(); expect(writes).toEqual([]);
});
test("planned-target field validation explains duplicate dates and invalid times without changing data", async ({ page }) => {
  await setup(page); await page.goto("/dashboard/settings?section=milestones"); const writes = recordApplicationWrites(page);
  await page.getByRole("button", { name: "Add milestone", exact: true }).click(); await page.getByRole("button", { name: "Planned race target", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByLabel("Milestone name", { exact: true }).fill("New checkpoint");
  await dialog.getByLabel("Target date", { exact: true }).fill("2026-11-22"); await dialog.getByLabel("Distance, km", { exact: true }).fill("10");
  await dialog.getByLabel("Target time", { exact: true }).fill("1:99:00"); await dialog.getByRole("button", { name: "Prepare plan update", exact: true }).click();
  await expect(dialog.getByLabel("Target date", { exact: true })).toHaveJSProperty("validationMessage", "Another milestone already uses that date.");
  await dialog.getByLabel("Target date", { exact: true }).fill("2026-12-13"); await dialog.getByRole("button", { name: "Prepare plan update", exact: true }).click();
  await expect(dialog.getByLabel("Target time", { exact: true })).toHaveJSProperty("validationMessage", "Enter a positive target time in mm:ss or h:mm:ss, up to seven days.");
  expect(writes).toEqual([]); await expect(page.getByRole("complementary", { name: "Prepared plan change" })).toHaveCount(0);
});
test("obsolete prepared removals are notices and cannot enter plan approval", async ({ page }) => {
  await setup(page); await page.goto("/dashboard/settings?section=milestones");
  const request = prepareMilestoneChange(context as Parameters<typeof prepareMilestoneChange>[0], { operation: "remove", milestoneId: "summer" });
  await page.evaluate((value) => sessionStorage.setItem("racepredictor:milestone-change:v1:e2e_athlete", value), JSON.stringify(request));
  const writes = recordApplicationWrites(page); await page.reload();
  await expect(page.getByText(/This prepared removal is obsolete/)).toBeVisible();
  await page.goto("/dashboard/plan?milestoneUpdate=1");
  await expect(page.getByText(/This prepared removal is obsolete/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to plan review", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download change request", exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("an approved-plan refresh while editing a target preserves the form and blocks automatic rebase", async ({ page }) => {
  await setup(page); await page.goto("/dashboard/settings?section=milestones"); await page.getByRole("button", { name: /^Race targets/ }).click();
  await page.getByRole("button", { name: "Propose target change for Summer half marathon", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByLabel("Target time", { exact: true }).fill("2:00:00");
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({ json: { data: { context: { ...context, plan: { ...context.plan, revision: 3 } } } } }));
  await mockMilestoneRead(page, { ...context, plan: { ...context.plan, revision: 3 } });
  const refreshed = page.waitForResponse((response) => /coaching\/milestones(?:\?|$)/u.test(response.url())); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await refreshed;
  await dialog.getByRole("button", { name: "Prepare plan update", exact: true }).click(); await expect(dialog.getByRole("alert")).toContainText("plan changed while you were editing");
  await expect(dialog.getByLabel("Target time", { exact: true })).toHaveValue("2:00:00");
});
test("mobile keyboard cancel restores focus, leaves no writes and preserves manual entry when search fails", async ({ page }, info) => {
  await setup(page); await page.setViewportSize({ width: 320, height: 800 }); await page.goto("/dashboard/settings?section=milestones");
  const writes = recordApplicationWrites(page); const dialog = await openNew(page);
  await expectAxeClean(page, "Add achieved milestone at 320px");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath("milestone-editor-mobile.png"), fullPage: true });
  await page.route("**/api/v1/activities?**", (route) => route.fulfill({ status: 503, json: { error: {} } }));
  await dialog.locator("summary").click(); await expect(dialog.getByText(/Activity search is unavailable/)).toBeVisible();
  await dialog.getByLabel("Milestone name", { exact: true }).fill("Unsaved"); await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible(); await expect(page.getByRole("button", { name: "Add milestone", exact: true })).toBeFocused(); expect(writes).toEqual([]);
});
test("no active plan still permits confirmed history and malformed stored handoffs have an explicit discard", async ({ page }) => {
  await setup(page, { context: { state: "no_active_plan", goal: null, plan: null, milestones: null, projection: null } });
  await page.goto("/dashboard/settings?section=milestones"); await page.getByRole("button", { name: "Add milestone", exact: true }).click();
  await expect(page.getByRole("button", { name: "Achieved milestone", exact: true })).toBeEnabled(); await expect(page.getByRole("button", { name: "Planned race target", exact: true })).toBeDisabled(); await page.keyboard.press("Escape");
  await page.evaluate(() => sessionStorage.setItem("racepredictor:milestone-change:v1:e2e_athlete", "{broken"));
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({ json: { data: { context } } }));
  await page.goto("/dashboard/plan?milestoneUpdate=1"); await expect(page.getByText(/prepared change or current approved plan could not be verified/)).toBeVisible();
  await page.getByRole("button", { name: "Discard invalid request", exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("racepredictor:milestone-change:v1:e2e_athlete"))).toBeNull();
});
