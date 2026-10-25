import { expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { e2eRoot } from "./fixture-paths.ts";

/** Check the minimal Home surface and capture its responsive geometry. */
export async function assertHomeLayout(page: Page, info: TestInfo, label: string) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: "instant" }); });
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
    };
    const nav = rect(".dashboard-nav");
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      viewportRight: document.documentElement.clientWidth,
      main: rect(".dashboard-main"),
      nav,
      greeting: rect(".road-hero-greeting"),
      goal: rect(".road-hero-content"),
      scene: rect(".road-home-scene"),
      photo: rect(".road-hero-image-frame"),
      orbit: rect(".road-orbit-launch"),
      journey: rect(".road-journey"),
      groups: document.querySelectorAll(".home-group").length,
      milestones: document.querySelectorAll(".road-stop").length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      journeyInView: (() => { const element = document.querySelector<HTMLElement>(".road-journey"); return element ? element.getBoundingClientRect().bottom <= window.innerHeight : false; })(),
    };
  });
  await fs.mkdir(e2eRoot, { recursive: true });
  const prefix = path.join(e2eRoot, `${label}-${layout.width}`);
  await fs.writeFile(`${prefix}.json`, JSON.stringify(layout, null, 2));
  await page.screenshot({ path: `${prefix}.png`, fullPage: true, style: "nextjs-portal { display: none; }" });
  await info.attach(`${label}-${layout.width}-fit`, { body: JSON.stringify(layout, null, 2), contentType: "application/json" });
  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.groups).toBe(1);
  expect(layout.journey).not.toBeNull();
  if (layout.width >= 1100 && layout.height >= 768) expect(layout.journeyInView).toBe(true);
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
