import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import type { ActivityDetail } from "../../../packages/core/src/contracts/activity.ts";
import type { PaceBlock } from "../../../packages/core/src/contracts/activity-pace-comparison.ts";
import { paceArtifactSchema } from "../../../packages/core/src/contracts/activity-pace-comparison.ts";
import { paceDomain } from "../../../packages/core/src/services/split-pacing.ts";
import { publishedComparison, splitFingerprint } from "../../../packages/core/src/services/activity-pace-comparison.ts";
import { activity, artifact, blocks } from "../../../packages/core/test/fixtures/pace-comparison.ts";
import { e2eRoot } from "./fixture-paths.ts";
import { expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";

function longActivity(): ActivityDetail {
  const splits = Array.from({ length: 87 }, (_, index) => {
    const distanceM = index === 86 ? 193.1 : 1000;
    const paceSecPerKm = index === 0 || index === 1 ? 346 : index === 2 ? 300 : index === 3 ? 540 : 330 + (index * 17) % 180;
    return { ...activity.splits[0], id: `long-split-${index}`, activityId: "long-pace-run", splitIndex: index, startOffsetS: index * 350, endOffsetS: (index + 1) * 350, durationS: Math.round(paceSecPerKm * distanceM / 1000), distanceM, paceSecPerKm };
  });
  return { ...activity, id: "long-pace-run", title: "Long-run fixture", distanceM: splits.reduce((sum, split) => sum + split.distanceM, 0), splits };
}

const longBlocks: PaceBlock[] = [
  { kind: "exact", firstSplitIndex: 0, lastSplitIndex: 0, paceSecPerKm: 485, label: "First kilometre" },
  { kind: "approximate", firstSplitIndex: 1, lastSplitIndex: 1, paceSecPerKm: 470, label: "Approximate target" },
  { kind: "range", firstSplitIndex: 2, lastSplitIndex: 2, minPaceSecPerKm: 465, maxPaceSecPerKm: 495, label: "Target range" },
  { kind: "effort", firstSplitIndex: 3, lastSplitIndex: 3, guidance: "Steady effort; no pace target", label: "Effort-led" },
  { kind: "exact", firstSplitIndex: 5, lastSplitIndex: 5, paceSecPerKm: 455, label: "Later target" },
];
for (let splitIndex = 6; splitIndex < 87; splitIndex += 1) longBlocks.push({ kind: "exact", firstSplitIndex: splitIndex, lastSplitIndex: splitIndex, paceSecPerKm: 450 + splitIndex % 9 * 3, label: `Kilometre ${splitIndex + 1}` });

async function fixture(page: Page, status: "ready" | "none" | "stale" | "error" | "loading" = "ready", record: ActivityDetail = activity, comparisonBlocks: PaceBlock[] = blocks): Promise<() => void> {
  let comparisonRequests = 0;
  let releaseLoading: () => void = () => {};
  const loadingGate = new Promise<void>(resolve => { releaseLoading = resolve; });
  await page.route("**/api/v1/activities**", route => {
    const url = new URL(route.request().url());
    let body: unknown = { data: { activity: record } };
    if (url.pathname === "/api/v1/activities") body = { items: [record] };
    if (url.pathname.endsWith("/pace-comparison")) {
      comparisonRequests += 1;
      if (status === "error" && comparisonRequests < 3) return route.fulfill({ status: 503, body: "Unavailable" });
      if (status === "loading") return loadingGate.then(() => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { activityId: record.id, status: "ready", comparison: publishedComparison(paceArtifactSchema.parse(artifact({ activityId: record.id, splitFingerprint: splitFingerprint(record), blocks: comparisonBlocks })), "2026-10-06T10:00:00.000Z") } }) }));
      const comparison = status === "none" ? null : publishedComparison(paceArtifactSchema.parse(artifact({ activityId: record.id, splitFingerprint: splitFingerprint(record), blocks: comparisonBlocks })), "2026-10-06T10:00:00.000Z");
      body = { data: { activityId: record.id, status: status === "error" ? "ready" : status, comparison } };
    }
    if (/\/(feedback|reflection|coach-review)$/.test(url.pathname)) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Unavailable" } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/v1/coaching/calendar?**", route => route.fulfill({ json: { data: { from: "2026-09-28", to: "2026-11-01", timezone: "Africa/Johannesburg", sessions: [], activities: [{ ...record, localDate: "2026-10-04" }], historicalSessions: [], activitiesReadStatus: "available" } } }));
  return releaseLoading;
}

test("all splits stay visible in the chart and table across screen widths", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await page.addInitScript(key => sessionStorage.setItem(key, JSON.stringify({ view: "table", selected: 19, start: 12, mode: "detail" })), `rp-splits:${activity.athleteId}:${activity.id}`);
  await fixture(page);
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.goto(`/dashboard/activities?activityId=${activity.id}`);
  const comparison = page.getByRole("region", { name: "Split pace comparison" });
  await expect(comparison.getByText(/Reviewed comparison/)).toBeVisible();
  await expect(comparison.locator("[data-split-bar]")).toHaveCount(activity.splits.length);
  await expect(comparison.getByRole("table").locator("tbody tr")).toHaveCount(activity.splits.length);
  await expect(comparison.getByText("Kilometre splits")).toBeVisible();
  await expect(comparison.getByText("Target per km")).toBeVisible();
  await expect(comparison.getByRole("button", { name: /Chart|Table|All splits|Detail|Next split|Previous split/ })).toHaveCount(0);
  await expect(comparison.getByText("Faster ↑")).toHaveCount(0);

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(comparison.locator("[data-split-bar]")).toHaveCount(activity.splits.length);
    await expect(comparison.getByRole("table").locator("tbody tr")).toHaveCount(activity.splits.length);
    const dimensions = await comparison.evaluate(element => ({ width: element.getBoundingClientRect().width, client: element.clientWidth, scroll: element.scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(900.5);
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    const ticks = await comparison.locator("[data-split-tick-index]").evaluateAll(elements => elements.map(element => {
      const label = element as SVGTextElement;
      const box = label.getBBox();
      return { index: Number(label.dataset.splitTickIndex), left: box.x, right: box.x + box.width };
    }));
    expect(ticks[0].index).toBe(0);
    expect(ticks.at(-1)?.index).toBe(activity.splits.length - 1);
    expect(ticks.slice(1).every((tick, index) => tick.left >= ticks[index].right)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  const disclosure = page.locator("details.detail-disclosure").filter({ has: page.locator(".pace-comparison") });
  await disclosure.locator("summary").click();
  await expect(disclosure).not.toHaveAttribute("open", "");
  expect(await page.evaluate(key => sessionStorage.getItem(key), `rp-splits-open:${activity.athleteId}:${activity.id}`)).toBe("false");
  await page.goto("/dashboard/calendar?date=2026-10-04");
  await page.getByRole("button", { name: "Open activity: Sunday race" }).click();
  const reopenedDisclosure = page.locator("details.detail-disclosure").filter({ has: page.locator(".pace-comparison") });
  await expect(reopenedDisclosure).not.toHaveAttribute("open", "");
  await reopenedDisclosure.locator("summary").click();
  const reopenedComparison = page.getByRole("region", { name: "Split pace comparison" });
  await expect(reopenedComparison.getByRole("table").locator("tbody tr")).toHaveCount(activity.splits.length);
  expect((await new AxeBuilder({ page }).include(".pace-comparison").analyze()).violations).toEqual([]);
  await reopenedComparison.screenshot({ path: path.join(e2eRoot, "split-comparison-desktop.png") });
  expectNoApplicationWrites(writes);
});

test("87 split chart places per-kilometre targets and ranges at their approved pace", async ({ page }) => {
  const record = longActivity();
  const writes = recordApplicationWrites(page);
  await fixture(page, "ready", record, longBlocks);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/activities?activityId=${record.id}`);
  const comparison = page.getByRole("region", { name: "Split pace comparison" });
  const chart = comparison.locator(".pace-chart");
  await expect(comparison.locator("[data-split-bar]")).toHaveCount(87);
  await expect(comparison.getByRole("table").locator("tbody tr")).toHaveCount(87);
  await expect(chart).toContainText("1");
  await expect(chart).toContainText("87 km");
  await expect(comparison.locator('[data-plan-target="2"]')).toHaveCount(2);
  await expect(comparison.locator('[data-plan-target="0"]')).toHaveCount(1);
  await expect(comparison.locator('[data-plan-target="3"]')).toHaveCount(0);
  await expect(comparison.locator('[data-plan-target="4"]')).toHaveCount(0);
  await expect(comparison.getByRole("row", { name: /Split 87 · 193 m/ })).toBeVisible();
  await expect(comparison.locator("tbody tr").nth(1).locator("td").nth(1)).toContainText("≈");
  await expect(comparison.locator("tbody tr").nth(3).locator("td").nth(1)).toContainText("Steady effort; no pace target");
  await expect(comparison.locator("tbody tr").nth(4).locator("td").nth(1)).toContainText("No approved target");
  await expect(comparison.locator("[data-pace-bar='2']")).toHaveAttribute("style", /100%/);
  await expect(comparison.locator("[data-pace-bar='3']")).toHaveAttribute("style", /20%/);

  const expectedTargets = [485, 470, 465, 495, 455, ...Array.from({ length: 81 }, (_, index) => 450 + (index + 6) % 9 * 3)];
  const actualTargets = await comparison.locator(".pace-target").evaluateAll(elements => elements.map(element => Number(element.getAttribute("data-target-pace-seconds"))));
  expect(actualTargets).toEqual(expectedTargets);
  expect(actualTargets).not.toContain(record.avgPaceSecPerKm);
  const domain = paceDomain(record.splits, longBlocks);
  const targetGeometry = await comparison.locator(".pace-target").evaluateAll(elements => elements.map(element => {
    const line = element as SVGLineElement;
    const bar = document.querySelector(`[data-split-bar="${line.getAttribute("data-plan-target")}"]`);
    const svg = line.ownerSVGElement!;
    const view = svg.viewBox.baseVal;
    const splitIndex = Number(line.getAttribute("data-plan-target"));
    const x = Number(line.getAttribute("x1"));
    const x2 = Number(line.getAttribute("x2"));
    return { splitIndex, x, x2, barX: Number(bar?.getAttribute("x")), barWidth: Number(bar?.getAttribute("width")), plotCell: (view.width - 58) / 87, targetY: Number(line.getAttribute("y1")), pace: Number(line.getAttribute("data-target-pace-seconds")), height: view.height };
  }));
  for (const target of targetGeometry) {
    const center = target.barX + target.barWidth / 2;
    expect(target.x).toBeLessThan(center);
    expect(target.x2).toBeGreaterThan(center);
    expect(target.x2 - target.x).toBeLessThan(target.plotCell);
    const expectedY = 18 + (target.pace - domain.min) / (domain.max - domain.min) * (target.height - 28 - 18);
    expect(target.targetY).toBeCloseTo(expectedY, 2);
  }
  await chart.screenshot({ path: path.join(e2eRoot, "split-comparison-87-mobile.png") });
  await comparison.locator(".pace-table-section").evaluate(element => element.scrollIntoView({ block: "start" }));
  await expect(comparison.locator(".pace-table-section")).toBeInViewport();
  await expect(chart).not.toBeInViewport();
  expect((await new AxeBuilder({ page }).include(".pace-comparison").analyze()).violations).toEqual([]);
  await page.screenshot({ path: path.join(e2eRoot, "split-comparison-87-mobile-table.png") });

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(comparison.locator("[data-split-bar]")).toHaveCount(87);
    await expect(comparison.getByRole("table").locator("tbody tr")).toHaveCount(87);
    const dimensions = await comparison.evaluate(element => ({ width: element.getBoundingClientRect().width, client: element.clientWidth, scroll: element.scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(900.5);
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const ticks = await chart.locator("[data-split-tick-index]").evaluateAll(elements => elements.map(element => {
      const label = element as SVGTextElement;
      const box = label.getBBox();
      return { index: Number(label.dataset.splitTickIndex), left: box.x, right: box.x + box.width };
    }));
    expect(ticks[0].index).toBe(0);
    expect(ticks.at(-1)?.index).toBe(86);
    expect(ticks.slice(1).every((tick, index) => tick.left >= ticks[index].right)).toBe(true);
  }

  await chart.evaluate(element => element.scrollIntoView({ block: "center" }));
  await chart.screenshot({ path: path.join(e2eRoot, "split-comparison-87-desktop.png") });
  expectNoApplicationWrites(writes);
});

test("Calendar activity detail uses the same all-splits chart and scrollable table", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/calendar?date=2026-10-04");
  const directLauncher = page.getByRole("button", { name: "Open activity: Sunday race" });
  await directLauncher.click();
  const dialog = page.getByRole("dialog", { name: "Sunday race" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".activity-dialog-logo")).toHaveCount(0);
  const comparison = dialog.getByRole("region", { name: "Split pace comparison" });
  await expect(comparison.locator("[data-split-bar]")).toHaveCount(22);
  await expect(comparison.getByRole("table").locator("tbody tr")).toHaveCount(22);
  await page.keyboard.press("Escape");
  await expect(directLauncher).toBeFocused();
  await page.locator(".calendar-day").filter({ has: page.locator('time[datetime="2026-10-04"]') }).click();
  await page.getByRole("dialog", { name: /^Day details/ }).getByRole("button", { name: "View activity: Sunday race" }).click();
  await expect(page.getByRole("dialog", { name: "Sunday race" }).getByRole("region", { name: "Split pace comparison" }).getByRole("table")).toBeVisible();
  expectNoApplicationWrites(writes);
});

test("an activity without split data has a clear empty state", async ({ page }) => {
  const record = { ...activity, splits: [] };
  await fixture(page, "ready", record, []);
  await page.goto(`/dashboard/activities?activityId=${record.id}`);
  const disclosure = page.locator("details.detail-disclosure").filter({ has: page.getByText("No split data was included in this imported activity.") });
  await expect(disclosure.getByText("No split data was included in this imported activity.")).toBeVisible();
  await expect(disclosure.getByRole("table")).toHaveCount(0);
});

for (const status of ["none", "stale", "error"] as const) test(`${status} comparison keeps actual bars and table usable`, async ({ page }) => {
  await fixture(page, status);
  await page.goto(`/dashboard/activities?activityId=${activity.id}`);
  const comparison = page.getByRole("region", { name: "Split pace comparison" });
  await expect(comparison.getByText(status === "none" ? /No approved pace comparison/ : status === "stale" ? /re-review required/ : /could not be loaded/)).toBeVisible();
  await expect(comparison.locator("[data-split-bar]")).toHaveCount(22);
  await expect(comparison.getByRole("table").locator("tbody tr")).toHaveCount(22);
  await expect(comparison.locator("[data-plan-target]")).toHaveCount(0);
  if (status === "error") {
    await comparison.getByRole("button", { name: "Retry comparison" }).click();
    await expect(comparison.getByText(/Reviewed comparison/)).toBeVisible();
    await expect(comparison.locator("[data-plan-target]")).toHaveCount(27);
  }
});

test("loading comparison keeps actual bars and table usable", async ({ page }) => {
  const releaseLoading = await fixture(page, "loading");
  await page.goto(`/dashboard/activities?activityId=${activity.id}`, { waitUntil: "domcontentloaded" });
  const comparison = page.getByRole("region", { name: "Split pace comparison" });
  await expect(comparison.getByText("Loading planned comparison…")).toBeVisible();
  await expect(comparison.locator("[data-split-bar]")).toHaveCount(22);
  await expect(comparison.getByRole("table").locator("tbody tr")).toHaveCount(22);
  await expect(comparison.locator("[data-plan-target]")).toHaveCount(0);
  releaseLoading();
  await expect(comparison.getByText(/Reviewed comparison/)).toBeVisible();
  await expect(comparison.locator("[data-plan-target]")).toHaveCount(27);
});
