import { expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { e2eRoot } from "./fixture-paths.ts";

/** The owner-approved photographic journey scrolls vertically on phones. */
export async function assertHomeLayout(page: Page, info: TestInfo, label: string) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: "instant" }); });
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    };
    const groups = [...document.querySelectorAll<HTMLElement>(".home-group")].map((element) => ({ top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom }));
    const nav = document.querySelector<HTMLElement>(".dashboard-nav-primary")!;
    const viewportBottom = window.innerWidth < 768 ? nav.getBoundingClientRect().top : window.innerHeight;
    const goal = rect(".road-hero"), scene = rect(".road-home-scene"), title = rect(".road-hero-content h2"), photo = rect(".road-hero-image"), heroFooter = rect(".road-hero-footer"), milestone = rect(".road-journey"), today = rect(".home-workout-surface"), activity = rect(".home-activity .home-session-summary");
    const controls = [...document.querySelectorAll<HTMLElement>(".home-group a, .home-group button, .road-session-details summary")].filter((element) => element.getBoundingClientRect().height > 0).map((element) => element.getBoundingClientRect().height);
    return { width: window.innerWidth, viewportBottom, goal, scene, title, photo, heroFooter, milestone, today, activity, groups, controls,
      goalAndTodayFit: today.bottom <= viewportBottom, allGroupsFit: Math.max(activity.bottom, today.bottom) <= viewportBottom, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  await fs.mkdir(e2eRoot, { recursive: true });
  const prefix = path.join(e2eRoot, `${label}-${layout.width}`);
  await fs.writeFile(`${prefix}.json`, JSON.stringify(layout, null, 2));
  await page.screenshot({ path: `${prefix}.png`, fullPage: true, style: "nextjs-portal { display: none; }" });
  await info.attach(`${label}-${layout.width}-fit`, { body: JSON.stringify(layout, null, 2), contentType: "application/json" });
  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.title.right).toBeLessThanOrEqual((layout.scene.left + layout.scene.right) / 2 + 1);
  expect(layout.photo.bottom).toBeLessThanOrEqual(layout.goal.bottom + 1);
  // The journey overlaps the photo while leaving the hero's text and links clear.
  expect(layout.milestone.top).toBeLessThan(layout.goal.bottom);
  expect(layout.milestone.top - layout.heroFooter.bottom).toBeGreaterThanOrEqual(8);
  expect(layout.milestone.left - layout.scene.left).toBeGreaterThanOrEqual(8);
  expect(layout.scene.right - layout.milestone.right).toBeGreaterThanOrEqual(8);
  expect(layout.groups).toHaveLength(3);
  expect(layout.groups[1].top - layout.groups[0].bottom).toBeGreaterThanOrEqual(12);
  if (layout.width >= 1100) {
    expect(layout.today.left - layout.activity.right).toBeGreaterThanOrEqual(12);
    expect(Math.abs(layout.activity.top - layout.today.top)).toBeLessThanOrEqual(1);
  } else expect(layout.groups[2].top - layout.groups[1].bottom).toBeGreaterThanOrEqual(12);
  for (const height of layout.controls) expect(height).toBeGreaterThanOrEqual(44);
  await page.locator(".home-activity a").last().evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const link = await page.locator(".home-activity a").last().boundingBox();
  expect(link!.y).toBeGreaterThanOrEqual(layout.width < 768 ? 64 : 0);
  expect(link!.y + link!.height).toBeLessThanOrEqual(layout.viewportBottom + 1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  return layout;
}

/** Check visible connections rather than only counting the milestone markers. */
export async function assertRoadTimelineLayout(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  const layout = await page.evaluate(() => {
    const now = document.querySelector<HTMLElement>(".road-now")!;
    const nowBox = now.getBoundingClientRect();
    const circle = now.querySelector("span")!.getBoundingClientRect();
    const nowRail = getComputedStyle(now, "::before");
    const bridge = (selector: string) => {
      const stop = document.querySelector<HTMLElement>(selector);
      if (!stop) return null;
      const box = stop.getBoundingClientRect();
      const node = stop.querySelector(".road-node")!.getBoundingClientRect();
      const rail = getComputedStyle(stop, "::after");
      return { left: box.left + parseFloat(rail.left), right: box.right - parseFloat(rail.right),
        y: box.top + parseFloat(rail.top), style: rail.borderTopStyle,
        nodeX: (node.left + node.right) / 2, nodeY: (node.top + node.bottom) / 2 };
    };
    return { width: innerWidth, nowLeft: nowBox.left, nowRight: nowBox.right,
      circleX: (circle.left + circle.right) / 2, circleY: (circle.top + circle.bottom) / 2,
      railX: nowBox.left + parseFloat(nowRail.left), railY: nowBox.top + parseFloat(nowRail.top),
      achieved: bridge(".road-timeline-group--achieved > .road-stops > .road-stop:last-child"),
      ahead: bridge(".road-timeline-group--ahead > .road-stops > .road-stop:first-child") };
  });
  const aligned = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
  if (layout.width < 1100) {
    aligned(layout.circleX, layout.railX);
  } else {
    aligned(layout.circleY, layout.railY);
    if (layout.achieved) {
      expect(layout.achieved.style).toBe("dashed");
      aligned(layout.achieved.left, layout.achieved.nodeX);
      aligned(layout.achieved.right, layout.nowLeft);
      aligned(layout.achieved.y, layout.circleY);
      aligned(layout.achieved.nodeY, layout.circleY);
    }
    if (layout.ahead) {
      expect(layout.ahead.style).toBe("dashed");
      aligned(layout.ahead.left, layout.nowRight);
      aligned(layout.ahead.right, layout.ahead.nodeX);
      aligned(layout.ahead.y, layout.circleY);
      aligned(layout.ahead.nodeY, layout.circleY);
    }
  }
}
