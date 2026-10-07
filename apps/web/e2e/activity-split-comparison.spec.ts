import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { activity, artifact } from "../../../packages/core/test/fixtures/pace-comparison.ts";
import { publishedComparison } from "../../../packages/core/src/services/activity-pace-comparison.ts";
import { paceArtifactSchema } from "../../../packages/core/src/contracts/activity-pace-comparison.ts";
import { e2eRoot } from "./fixture-paths.ts";
import { expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";

async function fixture(page: Page, status: "ready" | "none" | "stale" | "error" = "ready") {
  await page.route("**/api/v1/activities**", route => {
    const url = new URL(route.request().url());
    let body: unknown = { data: { activity } };
    if (url.pathname === "/api/v1/activities") body = { items: [activity] };
    if (url.pathname.endsWith("/pace-comparison")) {
      if (status === "error") return route.fulfill({ status: 503, body: "Unavailable" });
      body = { data: { activityId: activity.id, status, comparison: status === "none" ? null : publishedComparison(paceArtifactSchema.parse(artifact()), "2026-10-06T10:00:00.000Z") } };
    }
    if (/\/(feedback|reflection|coach-review)$/.test(url.pathname)) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Unavailable" } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/v1/coaching/calendar?**", route => route.fulfill({ json: { data: { from: "2026-09-28", to: "2026-11-01", timezone: "Africa/Johannesburg", sessions: [], activities: [{ ...activity, localDate: "2026-10-04" }], historicalSessions: [], activitiesReadStatus: "available" } } }));
}

test("desktop bars retain a global scale, page with overlap, show exact values and restore state", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await page.setViewportSize({ width: 1100, height: 1000 });
  await fixture(page);
  await page.goto(`/dashboard/activities?activityId=${activity.id}`);
  const chart = page.getByRole("region", { name: "Split pace comparison" });
  await expect(chart.getByText(/Reviewed comparison/)).toBeVisible();
  await expect(chart.locator("[data-split-bar]")).toHaveCount(22);
  const alignedTargets = await chart.locator(".pace-target").evaluateAll(targets => targets.map(target => {
    const split = target.getAttribute("data-plan-target");
    const bar = document.querySelector(`[data-split-bar="${split}"]`);
    const svg = (target as SVGRectElement).ownerSVGElement;
    return { x: target.getAttribute("x"), barX: bar?.getAttribute("x"), target: target.getAttribute("width"), bar: bar?.getAttribute("width"), bottom: Number(target.getAttribute("y")) + Number(target.getAttribute("height")), baseline: Number(svg?.viewBox.baseVal.height) - 14 };
  }));
  expect(alignedTargets.length).toBeGreaterThan(0);
  expect(alignedTargets.every(item => item.x === item.barX && item.target === item.bar && Math.abs(item.bottom - item.baseline) < .01)).toBe(true);
  const targetSplits = await chart.locator(".pace-target").evaluateAll(targets => targets.map(target => Number(target.getAttribute("data-plan-target"))));
  expect(targetSplits.every(index => index < 15)).toBe(true);
  expect(parseFloat(await chart.locator(".pace-target").first().evaluate(target => getComputedStyle(target).strokeWidth))).toBeCloseTo(1.75);
  const scale = await chart.locator(".pace-chart text").allTextContents();
  await chart.getByLabel("Choose split").selectOption("5");
  await expect(chart.locator(".pace-readout")).toContainText("8–10 s/km slower");
  await chart.getByRole("button", { name: "Detail", exact: true }).click();
  await expect(chart.locator("[data-split-bar]")).toHaveCount(10);
  await expect(chart.locator(".pace-readout")).toContainText("Kilometre 6");
  await chart.getByRole("button", { name: "Next splits" }).click();
  await expect(chart.getByText("Splits 10–19 of 22", { exact: true })).toBeVisible();
  expect(await chart.locator(".pace-chart text").allTextContents()).toEqual(scale);
  await chart.getByRole("button", { name: "Next splits" }).click();
  await expect(chart.getByText("Splits 13–22 of 22", { exact: true })).toBeVisible();
  await expect(chart.getByRole("button", { name: "Next splits" })).toBeDisabled();
  await chart.getByLabel("Choose split").selectOption("21");
  await expect(chart.locator(".pace-readout")).toContainText("Split 22 · 193 m");
  await expect(chart.locator(".pace-readout")).toContainText("193 m");
  await expect(chart.locator(".pace-readout")).toContainText("No numeric target");
  await chart.getByRole("button", { name: "Table", exact: true }).click();
  await expect(chart.getByRole("row")).toHaveCount(23);
  await page.reload();
  await expect(chart.getByRole("table")).toBeVisible();
  await expect(chart.getByRole("button", { name: "Detail", exact: true })).toHaveAttribute("aria-pressed", "true");
  await chart.getByRole("button", { name: "Chart", exact: true }).click();
  await expect(chart.locator("[data-split-bar]")).toHaveCount(10);
  await expect(chart.locator(".pace-readout")).toContainText("193 m");
  const disclosure = page.locator("details.detail-disclosure").filter({ has: page.locator(".pace-comparison") });
  await disclosure.locator("summary").click();
  await page.reload();
  await expect(disclosure).not.toHaveAttribute("open", "");
  await disclosure.locator("summary").click();
  await expect(chart.locator(".pace-readout")).toContainText("193 m");
  const accessibility = await new AxeBuilder({ page }).include(".pace-comparison").analyze();
  expect(accessibility.violations).toEqual([]);
  await chart.screenshot({ path: path.join(e2eRoot, "split-comparison-desktop.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/calendar?date=2026-10-04");
  await page.getByRole("button", { name: "Open activity: Sunday race" }).click();
  await expect(page.getByRole("dialog", { name: /^Day details/ })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Sunday race" })).toBeVisible();
  await expect(chart.getByRole("button", { name: "Detail", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(chart.locator("[data-split-bar]")).toHaveCount(10);
  await chart.getByRole("button", { name: "All splits", exact: true }).click();
  await expect(chart.locator("[data-split-bar]")).toHaveCount(22);
  await expect(chart.locator(".pace-readout")).toContainText("193 m");
  await chart.screenshot({ path: path.join(e2eRoot, "split-comparison-calendar-desktop.png") });
  expectNoApplicationWrites(writes);
});

test("mobile swipes, keyboard selection, resizing and Calendar use the same split view", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.goto("/dashboard/calendar?date=2026-10-04");
  const directLauncher = page.getByRole("button", { name: "Open activity: Sunday race" });
  await directLauncher.click();
  const directDialog = page.getByRole("dialog", { name: "Sunday race" });
  await expect(directDialog).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Day details/ })).toHaveCount(0);
  expect(await directDialog.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  const directChart = directDialog.getByRole("region", { name: "Split pace comparison" });
  await expect(directChart.locator("[data-split-bar]")).toHaveCount(22);
  await page.keyboard.press("Escape");
  await expect(directLauncher).toBeFocused();
  await page.locator(".calendar-day").filter({ has: page.locator('time[datetime="2026-10-04"]') }).click();
  await page.getByRole("dialog", { name: /^Day details/ }).getByRole("button", { name: "View activity: Sunday race" }).click();
  const activeDialogs = await page.locator("[role='dialog']").evaluateAll(dialogs => dialogs.filter(dialog => !dialog.closest("[inert]")).length);
  expect(activeDialogs).toBe(1);
  const chart = page.getByRole("region", { name: "Split pace comparison" });
  await expect(chart.getByText(/Reviewed comparison/)).toBeVisible();
  await expect(chart.locator("[data-split-bar]")).toHaveCount(22);
  expect(parseFloat(await chart.locator(".pace-target").first().evaluate(target => getComputedStyle(target).strokeWidth))).toBeCloseTo(1.5);
  await chart.getByRole("button", { name: "Detail", exact: true }).click();
  await expect(chart.locator("[data-split-bar]")).toHaveCount(6);
  await chart.locator(".pace-chart").scrollIntoViewIfNeeded();
  const box = (await chart.locator(".pace-chart").boundingBox())!;
  // Real touch input tests pan-y cancellation and horizontal page gestures.
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width - 30, y: box.y + 90 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 60, y: box.y + 90 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(chart.getByText("Splits 6–11 of 22", { exact: true })).toBeVisible();
  await chart.getByRole("button", { name: /^Kilometre 9,/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(chart.getByRole("button", { name: /^Kilometre 10,/ })).toBeFocused();
  await chart.screenshot({ path: path.join(e2eRoot, "split-comparison-mobile.png") });
  expect((await new AxeBuilder({ page }).include(".pace-comparison").analyze()).violations).toEqual([]);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    // The full-screen activity dialog remains open across Calendar's responsive breakpoint.
    await expect(chart.locator(".pace-readout")).toContainText("Kilometre 10");
    const plotWidth = await chart.locator(".pace-plot").evaluate(element => element.getBoundingClientRect().width);
    const expectedSplits = Math.max(1, Math.min(10, Math.floor((plotWidth - 68) / 44)));
    await expect(chart.locator("[data-split-bar]")).toHaveCount(expectedSplits);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expectNoApplicationWrites(writes);
});

for (const status of ["none", "stale", "error"] as const) test(`${status} comparison keeps actual bars usable`, async ({ page }) => {
  await fixture(page, status);
  await page.goto(`/dashboard/activities?activityId=${activity.id}`);
  const chart = page.getByRole("region", { name: "Split pace comparison" });
  await expect(chart.getByText(status === "none" ? /No approved pace comparison/ : status === "stale" ? /re-review required/ : /could not be loaded/)).toBeVisible();
  expect(await chart.locator("[data-split-bar]").count()).toBeGreaterThan(0);
  await expect(chart.locator("[data-plan-target]")).toHaveCount(0);
  await chart.getByRole("button", { name: "Detail", exact: true }).click();
  await expect(chart.locator("[data-split-bar]")).toHaveCount(10);
  await chart.getByRole("button", { name: "Next splits" }).click();
  await expect(chart.getByRole("button", { name: "Previous splits" })).toBeEnabled();
});
