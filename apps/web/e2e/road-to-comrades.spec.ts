import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { e2eRepositoryRoot } from "./fixture-paths.ts";
import { expectAxeClean, recordApplicationWrites } from "./test-helpers.ts";
import { assertHomeLayout, assertRoadTimelineLayout } from "./home-layout-assertions.ts";

const reviewDirectory = path.join(e2eRepositoryRoot, "docs/plans/references/home-prototype-parity");

const context = {
  state: "ready", plan: { id: "road-plan", version: 1, revision: 1, startsOn: "2026-09-01", endsOn: "2027-06-13", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) },
  goal: { id: "road-comrades", athleteId: "e2e_athlete", revision: 1, title: "Comrades 2027 Down Run: sub-11", why: "A purposeful running journey", target: { kind: "performance", distanceMeters: 89000, targetDate: "2027-06-13", targetTimeSeconds: 39600, eventName: "Comrades 2027 Down Run" } },
  milestones: [
    { id: "road-oldies", title: "Oldies 10 km sub-60", eventName: "SA Home Loans Oldies 10 km", targetDate: "2026-11-01", distanceMeters: 10000, targetTimeSeconds: 3600 },
    { id: "road-marathon", title: "Marathon target", eventName: "Marathon", targetDate: "2027-03-07", distanceMeters: 42195, targetTimeSeconds: 18000 },
  ], projection: null,
};
const lastActivity = { id: "road-run", athleteId: "e2e_athlete", title: "Morning Run", occurredAt: "2026-10-15T05:00:00Z", localOccurredAt: "2026-10-15T07:00:00+02:00", sport: "run", distanceM: 5080, elapsedTimeS: 2358, avgPaceSecPerKm: 464, elevationGainM: 50, hrAvailable: true, cadenceAvailable: true };
const session = { id: "road-maf", kind: "run", scheduledDate: "2026-10-17", effectiveDate: "2026-10-17", prescribedDate: "2026-10-17", status: "upcoming", title: "Monthly MAF check", purpose: "Aerobic benchmark", prescription: "Wear a chest strap. Warm up gradually for 2 km, then run 5 km at the approved heart rate. Cool down for 1 km. Defer the benchmark if recovery remains incomplete.", durationMinutes: 65, distanceMeters: 8000, cautions: ["Residual leg heaviness: choose an easy session or rest if recovery is incomplete."], amendments: [] };

async function mockDaily(page: Page, initial: "saved" | "empty" = "saved") {
  let entry: Record<string, unknown> | null = initial === "saved" ? { id: "wellbeing-road", athleteId: "e2e_athlete", timezone: "Africa/Johannesburg", localDate: "2026-10-17", status: "saved", answers: { overallFeeling: "good" }, revision: 1 } : null;
  await page.route("**/api/v1/wellbeing-check-ins**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: { items: entry ? [entry] : [] } } });
    const body = route.request().postDataJSON();
    entry = { ...body, id: "wellbeing-road", localDate: "2026-10-17", revision: body.expectedRevision + 1 };
    return route.fulfill({ json: { data: entry } });
  });
}
async function mockHome(page: Page, checkIn: "saved" | "empty" = "saved") {
  await page.clock.install({ time: new Date("2026-10-17T07:00:00Z") });
  await mockDaily(page, checkIn);
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({ json: { data: { context } } }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ json: { data: { date: "2026-10-17", timezone: "Africa/Johannesburg", state: "upcoming", plan: { id: "road-plan" }, session, todayScheduleKind: "prescribed_session", links: { session: "/dashboard/calendar?date=2026-10-17&session=road-maf", calendar: "/dashboard/calendar" } } } }));
  await page.route("**/api/v1/coaching/calendar?**", (route) => route.fulfill({ json: { data: { timezone: "Africa/Johannesburg", from: "2026-10-12", to: "2026-10-18", sessions: [session], activities: [], activitiesReadStatus: "available" } } }));
  await page.route("**/api/v1/activities?**", (route) => route.fulfill({ json: { data: { items: [lastActivity] } } }));
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

test("live history and goal timeline render at desktop and narrow widths with no page-load write", async ({ page }, testInfo) => {
  await mockHome(page); await seedHistory(page);
  const writes = recordApplicationWrites(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const shots = reviewDirectory;
  await mkdir(shots, { recursive: true });
  for (const width of [1920, 1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Comrades 2027 Down Run", exact: true })).toBeVisible();
    await expect(page.locator(".road-stop--achieved")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "SA Home Loans Oldies 10 km", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Monthly MAF check", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Morning Run", exact: true })).toBeVisible();
    await expect(page.locator(".road-hero-image")).toHaveJSProperty("complete", true);
    await assertHomeLayout(page, testInfo, "road-prototype-parity");
    await assertRoadTimelineLayout(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    if (width === 1440 || width === 390) await page.screenshot({ path: path.join(shots, width === 1440 ? "desktop.png" : "mobile.png"), fullPage: true, style: "nextjs-portal { display: none; }" });
    await expectAxeClean(page, `Road to Comrades ${width}`);
  }
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});

test("first daily check-in saves, reopens for edit, skips and persists across reload", async ({ page }) => {
  await mockHome(page, "empty"); await page.goto("/dashboard");
  const dialog = page.getByRole("dialog", { name: "How are you feeling?" });
  await expect(dialog).toBeVisible(); await expectAxeClean(page, "Daily check-in");
  await page.screenshot({ path: path.join(reviewDirectory, "daily-check-in.png"), style: "nextjs-portal { display: none; }" });
  await dialog.getByRole("button", { name: "Good", exact: true }).click();
  await dialog.getByRole("button", { name: "Save check-in", exact: true }).click();
  await expect(dialog).not.toBeVisible(); await page.reload(); await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Check-in saved · Edit" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Skip today", exact: true }).click();
  await expect(page.getByRole("button", { name: "Skipped today · Edit" })).toBeVisible();
  await page.reload(); await expect(dialog).not.toBeVisible();
});

test("achievement editor persists changes through the real local API and handles conflicts", async ({ page }) => {
  await mockHome(page); await seedHistory(page); await page.goto("/dashboard");
  await page.getByRole("button", { name: "Manage achievements" }).click();
  const dialog = page.getByRole("dialog", { name: "Race achievements" });
  await dialog.getByRole("button", { name: "Edit Comrades PB", exact: true }).click();
  await dialog.getByLabel("Achievement name").fill("Comrades personal best");
  await dialog.getByLabel("I confirm this race result or achievement.").check();
  await dialog.getByRole("button", { name: "Save achievement", exact: true }).click();
  await expect(dialog.getByText("Achievement saved.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Manage achievements" })).toBeFocused();
  await page.reload(); await expect(page.locator(".road-stop--achieved", { hasText: "Comrades personal best" })).toBeVisible();
  await page.getByRole("button", { name: "Manage achievements" }).click();
  await dialog.getByRole("button", { name: "Edit Comrades personal best", exact: true }).click();
  const items = (await (await page.request.get("/api/v1/coaching/race-history")).json()).data.items;
  const current = items.find((item: { id: string }) => item.id === "road-pb");
  await page.request.put("/api/v1/coaching/race-history", { data: { record: { ...current, title: "Changed elsewhere" }, expectedRevision: current.revision } });
  await dialog.getByLabel("I confirm this race result or achievement.").check();
  await dialog.getByRole("button", { name: "Save achievement", exact: true }).click();
  await expect(dialog.getByText(/This achievement changed/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save achievement", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Reload saved achievement" }).click();
  await expect(dialog.getByLabel("Achievement name")).toHaveValue("Changed elsewhere");
});

test("Settings Milestones opens directly and saved achievements reach Home", async ({ page }) => {
  await mockHome(page); await seedHistory(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/settings?section=milestones");
  await expect(page.getByRole("heading", { name: "Milestones", exact: true })).toBeVisible();
  await expect(page.getByText("SA Home Loans Oldies 10 km", { exact: true })).toBeVisible();
  await expectAxeClean(page, "Settings Milestones");
  await page.getByRole("button", { name: "Manage achievements" }).click();
  const dialog = page.getByRole("dialog", { name: "Race achievements" });
  await expectAxeClean(page, "Settings achievement editor");
  await dialog.getByRole("button", { name: "Edit Comrades PB", exact: true }).click();
  await dialog.getByLabel("Achievement name").fill("Settings milestone result");
  await dialog.getByLabel("I confirm this race result or achievement.").check();
  await dialog.getByRole("button", { name: "Save achievement", exact: true }).click();
  await expect(dialog.getByText("Achievement saved.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Manage achievements" })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Milestones", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manage achievements" }).click();
  await expect(dialog.getByRole("button", { name: "Edit Settings milestone result", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/dashboard");
  await expect(page.locator(".road-stop--achieved", { hasText: "Settings milestone result" })).toBeVisible();
});

test("new plan and history reads update the timeline on focus without inventing completion", async ({ page }) => {
  await mockHome(page); await seedHistory(page); await page.goto("/dashboard");
  await expect(page.locator(".road-stop--achieved")).toHaveCount(3);
  const revised = { ...context, milestones: context.milestones.map((race) => race.id === "road-oldies" ? { ...race, eventName: "Updated checkpoint" } : race) };
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({ json: { data: { context: revised } } }));
  const futureResult = await page.request.put("/api/v1/coaching/race-history", { data: { record: { id: "road-result", title: "Future race result", confirmedBy: "user", achievement: "goal_achieved", raceDate: "2026-11-01", distanceMeters: 10000, elapsedTimeSeconds: 3590 }, expectedRevision: 0 } });
  expect(futureResult.ok()).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("link", { name: "Updated checkpoint", exact: true })).toBeVisible();
  await expect(page.locator(".road-stop--achieved")).toHaveCount(3); // Future result cannot complete a race today.
});

test("Settings uploads a private background, Home uses it after reload, and Restore default persists", async ({ page }) => {
  await mockHome(page); await page.goto("/dashboard/settings");
  await page.locator("summary", { hasText: /^Appearance$/ }).click();
  await expect(page.getByRole("heading", { name: "Dashboard background", exact: true })).toBeVisible();
  await page.getByLabel("Choose a background image").setInputFiles(path.join(e2eRepositoryRoot, "apps/web/public/road-to-comrades.webp"));
  await page.getByRole("button", { name: "Save background", exact: true }).click();
  await expect(page.getByText(/Background saved/)).toBeVisible();
  await page.screenshot({ path: path.join(reviewDirectory, "settings-background.png"), fullPage: true, style: "nextjs-portal { display: none; }" });
  await page.goto("/dashboard");
  await expect(page.locator(".road-hero-image")).toHaveAttribute("src", /\/api\/v1\/dashboard\/appearance\/image\?v=/);
  const src = await page.locator(".road-hero-image").getAttribute("src");
  const image = await page.request.get(src!); expect(image.ok()).toBeTruthy(); expect(image.headers()["content-type"]).toBe("image/webp");
  await page.goto("/dashboard/settings"); await page.locator("summary", { hasText: /^Appearance$/ }).click();
  await page.getByRole("button", { name: "Restore default", exact: true }).click();
  await expect(page.getByText("Default background restored.", { exact: true })).toBeVisible();
  await page.goto("/dashboard"); await expect(page.locator(".road-hero-image")).toHaveAttribute("src", /road-to-comrades/);
});
