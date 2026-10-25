import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { e2eRoot, e2eRepositoryRoot } from "./fixture-paths.ts";
import { expectAxeClean, recordApplicationWrites } from "./test-helpers.ts";
import { assertHomeLayout, assertRoadTimelineLayout } from "./home-layout-assertions.ts";

const context = {
  state: "ready",
  plan: { id: "road-plan", version: 1, revision: 1, startsOn: "2026-09-01", endsOn: "2027-06-13", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) },
  goal: { id: "road-comrades", athleteId: "e2e_athlete", revision: 1, title: "Comrades 2027 Down Run: sub-11", why: "A purposeful running journey", target: { kind: "performance", distanceMeters: 89_000, targetDate: "2027-06-13", targetTimeSeconds: 39_600, eventName: "Comrades 2027 Down Run" } },
  milestones: [
    { id: "road-oldies", title: "Oldies 10 km sub-60", eventName: "SA Home Loans Oldies 10 km", targetDate: "2026-11-01", distanceMeters: 10_000, targetTimeSeconds: 3_600 },
    { id: "road-marathon", title: "Marathon target", eventName: "Marathon", targetDate: "2027-03-07", distanceMeters: 42_195, targetTimeSeconds: 18_000 },
  ],
  projection: null,
};

async function mockHome(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-17T07:00:00.000Z"));
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({ json: { data: { context } } }));
}

async function seedHistory(page: Page) {
  const list = await page.request.get("/api/v1/coaching/race-history");
  expect(list.ok()).toBeTruthy();
  for (const record of (await list.json()).data.items) await page.request.delete(`/api/v1/coaching/race-history?id=${record.id}&revision=${record.revision}`);
  for (const [id, title, achievement] of [["road-pb", "Comrades PB", "personal_best"], ["road-10k", "10 km goal", "goal_achieved"], ["road-half", "Half-marathon goal", "goal_achieved"]]) {
    const response = await page.request.put("/api/v1/coaching/race-history", { data: { record: { id, title, achievement, confirmedBy: "user" }, expectedRevision: 0 } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
}

test("Home shows the approved goal and read-only milestones across desktop and mobile", async ({ page }, testInfo) => {
  const writes = recordApplicationWrites(page);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/v1/")) requests.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await mockHome(page);
  await seedHistory(page);
  for (const width of [1920, 1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Comrades 2027 Down Run", exact: true })).toBeVisible();
    await expect(page.locator(".road-stop--achieved")).toHaveCount(3);
    await expect(page.getByText("SA Home Loans Oldies 10 km", { exact: true })).toBeVisible();
    await expect(page.locator("a.road-stop-title")).toHaveCount(0);
    await expect(page.locator(".home-group")).toHaveCount(1);
    await expect(page.locator(".home-workout-surface, .home-activity, .today-coach-main, .road-daily-check-in, .coach-composer")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View plan" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Manage milestones" })).toHaveCount(0);
    await expect(page.locator(".road-hero-image")).toHaveJSProperty("complete", true);
    await assertHomeLayout(page, testInfo, "road-home");
    await assertRoadTimelineLayout(page);
    await expectAxeClean(page, `Road to Comrades ${width}`);
  }
  expect(requests.some((url) => /chat|wellbeing-check-ins|coaching\/today|activities/u.test(url))).toBe(false);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("Home omits daily check-in and local direct Coach entry returns Home", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/v1/")) requests.push(request.url()); });
  await mockHome(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: /check-in/i })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /feeling/i })).toHaveCount(0);
  expect(requests.some((url) => url.includes("wellbeing-check-ins") || url.includes("/coaching/today"))).toBe(false);
  await page.goto("/dashboard/coach");
  await expect(page).toHaveURL(/\/dashboard\/?$/u);
  await expect(page.getByRole("heading", { name: "Comrades 2027 Down Run" })).toBeVisible();
});

test("Settings remains the milestone editor and local changes return to Home", async ({ page }) => {
  await mockHome(page);
  await seedHistory(page);
  await page.goto("/dashboard/settings?section=milestones");
  await expect(page.getByRole("heading", { name: "Milestones", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Race targets/ }).click();
  await expect(page.getByRole("heading", { name: "SA Home Loans Oldies 10 km", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Achievements/ }).click();
  await expectAxeClean(page, "Settings Milestones");
  await page.getByRole("button", { name: "Edit Comrades PB", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit milestone", exact: true });
  await expectAxeClean(page, "Settings achievement editor");
  await dialog.getByLabel("Milestone name", { exact: true }).fill("Settings milestone result");
  await dialog.getByLabel(/I confirm this race result/).check();
  await dialog.getByRole("button", { name: "Save milestone", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Add milestone", exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Milestones", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Settings milestone result", exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".road-stop--achieved", { hasText: "Settings milestone result" })).toBeVisible();
});

test("Home refreshes approved targets and history without inventing future completion", async ({ page }) => {
  await mockHome(page);
  await seedHistory(page);
  await page.goto("/dashboard");
  await expect(page.locator(".road-stop--achieved")).toHaveCount(3);
  const revised = { ...context, milestones: context.milestones.map((race) => race.id === "road-oldies" ? { ...race, eventName: "Updated checkpoint" } : race) };
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({ json: { data: { context: revised } } }));
  const futureResult = await page.request.put("/api/v1/coaching/race-history", { data: { record: { id: "road-result", title: "Future race result", confirmedBy: "user", achievement: "goal_achieved", raceDate: "2026-11-01", distanceMeters: 10_000, elapsedTimeSeconds: 3_590 }, expectedRevision: 0 } });
  expect(futureResult.ok()).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Updated checkpoint", { exact: true })).toBeVisible();
  await expect(page.locator(".road-stop--achieved")).toHaveCount(3);
});

test("Settings custom background survives reload and restore selects the revised default", async ({ page }) => {
  await mockHome(page);
  let heroImageUrl = "/road-to-comrades-v2.webp";
  const uploadedImage = readFileSync(path.join(e2eRepositoryRoot, "apps/web/public/road-to-comrades-v2.webp"));
  await page.route("**/api/v1/dashboard/appearance", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: { heroImageUrl } } });
    if (route.request().method() === "DELETE") heroImageUrl = "/road-to-comrades-v2.webp";
    else {
      expect(route.request().postDataBuffer()?.byteLength).toBeGreaterThan(0);
      heroImageUrl = "/api/v1/dashboard/appearance/image?v=fixture-custom";
    }
    return route.fulfill({ json: { data: { heroImageUrl } } });
  });
  await page.route("**/api/v1/dashboard/appearance/image**", (route) => route.fulfill({ contentType: "image/webp", body: uploadedImage }));
  await page.goto("/dashboard/settings");
  await page.locator("summary", { hasText: /^Appearance$/ }).click();
  await expect(page.getByRole("heading", { name: "Dashboard background", exact: true })).toBeVisible();
  await page.getByLabel("Choose a background image").setInputFiles(path.join(e2eRepositoryRoot, "apps/web/public/road-to-comrades-v2.webp"));
  await page.getByRole("button", { name: "Save background", exact: true }).click();
  await expect(page.getByText(/Background saved/)).toBeVisible();
  await page.screenshot({ path: path.join(e2eRoot, "settings-background.png"), fullPage: true, style: "nextjs-portal { display: none; }" });
  await page.goto("/dashboard");
  await expect(page.locator(".road-hero-image")).toHaveAttribute("src", /\/api\/v1\/dashboard\/appearance\/image\?v=/u);
  await expect(page.locator(".road-hero-image-frame")).toHaveAttribute("data-background-source", "custom");
  expect(await page.locator(".road-hero-image").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.goto("/dashboard/settings");
  await page.locator("summary", { hasText: /^Appearance$/ }).click();
  await page.getByRole("button", { name: "Restore default", exact: true }).click();
  await expect(page.getByText("Default background restored.", { exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".road-hero-image")).toHaveAttribute("src", /road-to-comrades-v2\.webp/u);
});
