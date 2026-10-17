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
    const goal = rect(".road-hero"), milestone = rect(".road-journey"), today = rect(".home-workout-surface"), activity = rect(".home-activity .home-session-summary");
    const controls = [...document.querySelectorAll<HTMLElement>(".home-group a, .home-group button, .road-session-details summary")].filter((element) => element.getBoundingClientRect().height > 0).map((element) => element.getBoundingClientRect().height);
    return { width: window.innerWidth, viewportBottom, goal, milestone, today, activity, groups, controls,
      goalAndTodayFit: today.bottom <= viewportBottom, allGroupsFit: activity.bottom <= viewportBottom, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  await fs.mkdir(e2eRoot, { recursive: true });
  const prefix = path.join(e2eRoot, `${label}-${layout.width}`);
  await fs.writeFile(`${prefix}.json`, JSON.stringify(layout, null, 2));
  await page.screenshot({ path: `${prefix}.png`, fullPage: true, style: "nextjs-portal { display: none; }" });
  await info.attach(`${label}-${layout.width}-fit`, { body: JSON.stringify(layout, null, 2), contentType: "application/json" });
  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.milestone.top).toBeGreaterThanOrEqual(layout.goal.bottom - 1);
  expect(layout.groups[1].top - layout.groups[0].bottom).toBeGreaterThanOrEqual(12);
  if (layout.width >= 1100) {
    expect(layout.activity.left - layout.today.right).toBeGreaterThanOrEqual(12);
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
