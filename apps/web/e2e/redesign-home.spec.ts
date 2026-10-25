import { chromium, expect, test, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expectAxeClean } from "./test-helpers.ts";

const today = "2026-10-25";
const goal = {
  id: "goal_comrades", athleteId: "e2e_athlete", revision: 2, title: "Comrades Marathon 2027 Down Run: sub-11",
  why: "Run a strong, steady Comrades.", target: { kind: "performance", distanceMeters: 89_000, targetDate: "2027-06-13", targetTimeSeconds: 39_600, eventName: "Comrades Marathon 2027 Down Run" },
};
const milestones = Array.from({ length: 12 }, (_, index) => ({
  id: `milestone-${index + 1}`, title: `Checkpoint ${index + 1}`, eventName: index === 0 ? "Verulam Gaterite Half Marathon" : `Long checkpoint ${index + 1}`,
  targetDate: new Date(Date.UTC(2026, 10, 1 + index * 14)).toISOString().slice(0, 10), distanceMeters: 21_097.5, targetTimeSeconds: 7_200,
}));
const achievements = [
  { id: "achievement-pb", title: "Verulam personal best", confirmedBy: "user", achievement: "personal_best" },
  { id: "achievement-half", title: "Completed a half marathon", confirmedBy: "user", achievement: "goal_achieved" },
];

type HomeOptions = { milestoneCount?: number; achievementCount?: number; longMilestoneName?: boolean; goalUnavailable?: boolean; historyUnavailable?: boolean; background?: string };

async function mockHome(page: Page, options: HomeOptions = {}) {
  await page.clock.setFixedTime(new Date(`${today}T08:00:00.000Z`));
  await page.route("**/api/v1/coaching/goal-context/active", (route) => options.goalUnavailable
    ? route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Goal context unavailable", details: [] } } })
    : route.fulfill({ json: { data: { context: {
      state: "ready",
      plan: { id: "plan_comrades", version: 3, revision: 2, startsOn: "2026-09-01", endsOn: "2027-06-13", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) },
      goal: { ...goal },
      milestones: milestones.slice(0, options.milestoneCount ?? 5).map((item, index) => options.longMilestoneName && index === 0 ? { ...item, eventName: `A very long race milestone name ${"that remains readable ".repeat(7)}`.slice(0, 200) } : item),
      projection: { contextHash: "b".repeat(64), publishedAt: "2026-10-20T08:00:00.000Z" },
    } } } }));
  await page.route("**/api/v1/coaching/race-history", (route) => options.historyUnavailable
    ? route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Race history unavailable", details: [] } } })
    : route.fulfill({ json: { data: { items: achievements.slice(0, options.achievementCount ?? achievements.length), publishedAt: null } } }));
  await page.route("**/api/v1/dashboard/appearance", (route) => route.fulfill({ json: { data: { heroImageUrl: options.background ?? "/road-to-comrades-v2.webp" } } }));
}

test("Home contains only the goal, full milestone journey and optional Orbit entry", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/v1/")) requests.push(new URL(request.url()).pathname); });
  await mockHome(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Comrades Marathon 2027 Down Run", level: 2 })).toBeVisible();
  await expect(page.locator(".road-hero-target")).toHaveText("sub-11");
  await expect(page.locator(".road-hero-date")).toContainText("89 km");
  await expect(page.locator(".road-stop-title")).toHaveCount(8); // Two confirmed achievements, five milestones and the primary race goal.
  await expect(page.locator(".road-stop--achieved .road-stop-title")).toHaveCount(2);
  await expect(page.locator(".road-timeline-group--ahead .road-stop-title")).toHaveCount(6);
  await expect(page.locator("a.road-stop-title")).toHaveCount(0);
  await expect(page.locator("details")).toHaveCount(0);
  await expect(page.locator(".home-workout-surface, .home-activity, .today-coach-main, .road-daily-check-in, .coach-composer")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View plan" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Manage milestones" })).toHaveCount(0);
  const navCoach = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Coach", exact: true });
  const orbit = page.getByRole("link", { name: "Talk to Orbit" });
  if (await navCoach.count()) {
    await expect(orbit).toHaveAttribute("href", "/dashboard/coach");
    await expect(orbit.locator(".road-orbit-image")).toBeVisible();
  } else {
    await expect(orbit).toHaveCount(0);
  }
  expect(requests).toContain("/api/v1/coaching/goal-context/active");
  expect(requests).toContain("/api/v1/coaching/race-history");
  expect(requests).toContain("/api/v1/dashboard/appearance");
  expect(requests.some((url) => /chat|wellbeing-check-ins|coaching\/today|activities/u.test(url))).toBe(false);
  await expectAxeClean(page, "minimal Home");
});

test("Home displays the complete maximum milestone projection without action links", async ({ page }) => {
  await mockHome(page, { milestoneCount: 12, longMilestoneName: true });
  await page.goto("/dashboard");
  await expect(page.locator(".road-timeline-group--ahead .road-stop-title")).toHaveCount(13); // 12 projected milestones plus the primary goal.
  await expect(page.getByText("Long checkpoint 12", { exact: true })).toBeVisible();
  await expect(page.getByText(/^A very long race milestone name/u)).toBeVisible();
  await expect(page.locator(".road-timeline-group a")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("zero projected milestones still show the primary goal without inventing achievements", async ({ page }) => {
  await mockHome(page, { milestoneCount: 0, achievementCount: 0 });
  await page.goto("/dashboard");
  await expect(page.locator(".road-timeline-group--achieved .road-empty")).toHaveText("No completed milestones yet.");
  await expect(page.locator(".road-timeline-group--ahead .road-stop-title")).toHaveCount(1);
  await expect(page.locator(".road-timeline-group--ahead .road-stop-title")).toHaveText("Comrades Marathon 2027 Down Run");
});

test("Orbit remains an accessible Coach link when the full-body image fails", async ({ page }) => {
  await mockHome(page);
  await page.route("**/_next/image**", (route) => {
    const imagePath = new URL(route.request().url()).searchParams.get("url") ?? "";
    return imagePath.includes("orbit-coach-full.webp") ? route.abort() : route.continue();
  });
  await page.goto("/dashboard");
  const orbit = page.getByRole("link", { name: "Talk to Orbit" });
  if (await orbit.count()) {
    await expect(orbit).toHaveAttribute("href", "/dashboard/coach");
    await expect(orbit.locator(".road-orbit-fallback")).toBeVisible();
  }
});

test("saved custom scenery is retained and a failed custom image falls back to the revised default", async ({ page }) => {
  await mockHome(page, { background: "/api/v1/dashboard/appearance/image?v=custom" });
  await page.route("**/api/v1/dashboard/appearance/image**", (route) => route.fulfill({ status: 503, body: "Image unavailable" }));
  await page.goto("/dashboard");
  const image = page.locator(".road-hero-image");
  await expect(image).toHaveAttribute("src", /road-to-comrades-v2\.webp/u);
  await expect(page.locator(".road-hero-image-frame")).toHaveAttribute("data-background-source", "default");
});

test("Home keeps goal and history errors independent and exposes scoped retry", async ({ page }) => {
  let goalReads = 0;
  let historyReads = 0;
  await page.route("**/api/v1/coaching/goal-context/active", (route) => {
    goalReads += 1;
    return route.fulfill(goalReads === 1
      ? { status: 503, json: { error: { code: "UNAVAILABLE", message: "Goal context unavailable", details: [] } } }
      : { json: { data: { context: { state: "no_active_plan", plan: null, goal: null, milestones: null, projection: null } } } });
  });
  await page.route("**/api/v1/coaching/race-history", (route) => {
    historyReads += 1;
    return route.fulfill(historyReads === 1
      ? { status: 503, json: { error: { code: "UNAVAILABLE", message: "Race history unavailable", details: [] } } }
      : { json: { data: { items: [], publishedAt: null } } });
  });
  await page.route("**/api/v1/dashboard/appearance", (route) => route.fulfill({ json: { data: { heroImageUrl: "/road-to-comrades-v2.webp" } } }));
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Retry goal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry history" })).toBeVisible();
  await page.getByRole("button", { name: "Retry goal" }).click();
  await expect(page.getByText("Set a race goal to start your next chapter.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry history" })).toBeVisible();
  await page.getByRole("button", { name: "Retry history" }).click();
  await expect(page.getByText("No completed milestones yet.")).toBeVisible();
});

test("Home reflows without clipping at required viewport widths", async ({ page }) => {
  await mockHome(page);
  await page.goto("/dashboard");
  for (const viewport of [
    { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 360, height: 640 },
    { width: 390, height: 844 }, { width: 320, height: 800 }, { width: 640, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".road-hero-content h2")).toBeVisible();
    await expect(page.locator(".road-journey")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${viewport.width}px`).toBe(true);
    if (viewport.width >= 1100) {
      await expect(page.locator(".road-journey")).toBeInViewport();
      const sceneBottom = await page.locator(".road-journey").evaluate((element) => element.getBoundingClientRect().bottom);
      expect(sceneBottom).toBeLessThanOrEqual(viewport.height + 1);
    }
    const navCoach = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Coach", exact: true });
    if (await navCoach.count()) {
      const orbitImage = page.locator(".road-orbit-image");
      await expect(orbitImage).toBeVisible();
      const box = await orbitImage.boundingBox();
      expect(box?.height).toBe(viewport.width < 1100 ? 164 : 248);
      const launcher = await page.getByRole("link", { name: "Talk to Orbit" }).boundingBox();
      const journey = await page.locator(".road-journey").boundingBox();
      expect(launcher!.y + launcher!.height).toBeLessThanOrEqual(journey!.y);
      const label = await page.locator(".road-orbit-launch-label").boundingBox();
      expect(label?.height).toBe(44);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAxeClean(page, "responsive Home");
});

test("Home reflows at actual Chromium 200 percent browser zoom", async ({ baseURL }) => {
  const profile = mkdtempSync(path.join(tmpdir(), "home-zoom-profile-"));
  const browser = await chromium.launchPersistentContext(profile, { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, viewport: { width: 1280, height: 900 } });
  try {
    const page = await browser.newPage();
    await mockHome(page);
    await page.goto(`${baseURL}/dashboard`);
    await expect(page.getByRole("heading", { name: "Comrades Marathon 2027 Down Run", level: 2 })).toBeVisible();
    const settings = await browser.newPage();
    await settings.goto("chrome://settings/appearance");
    await settings.evaluate(() => new Promise<void>((resolve) => { (globalThis as any).chrome.settingsPrivate.setDefaultZoom(2, resolve); }));
    await settings.close();
    await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.viewport).toBe(640);
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.locator(".road-journey")).toBeVisible();
    await page.screenshot({ path: path.join(test.info().outputDir, "home-real-200-percent-zoom.png"), fullPage: true });
  } finally {
    await browser.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
