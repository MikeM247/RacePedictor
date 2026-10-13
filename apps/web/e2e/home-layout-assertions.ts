import { expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { e2eRoot } from "./fixture-paths.ts";

/** Measure actual fit; scrolling is explicit, never substituted with existence checks. */
export async function assertHomeLayout(page: Page, info: TestInfo, label: string) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: "instant" }); });
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)!;
      const box = element.getBoundingClientRect();
      return { top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right) };
    };
    const groups = [...document.querySelectorAll<HTMLElement>(".home-group")].map((element) => {
      const box = element.getBoundingClientRect();
      return { top: Math.round(box.top), bottom: Math.round(box.bottom) };
    });
    const primary = document.querySelector<HTMLElement>(".dashboard-nav-primary")!;
    const viewportBottom = window.innerWidth < 768 ? primary.getBoundingClientRect().top : window.innerHeight;
    const goal = rect(".home-goal-target"), milestone = rect(".home-milestone");
    const today = rect(".home-workout-surface"), prescription = rect(".home-workout-surface .today-prescription"), activity = rect(".home-activity .home-session-summary");
    const readability = [...document.querySelectorAll<HTMLElement>(".home-target-line, .today-prescription, .home-review-commentary p, .home-milestone-target")].map((element) => {
      const style = getComputedStyle(element);
      const supporting = element.matches(".home-target-line, .home-milestone-target");
      return { supporting, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), clipped: element.scrollHeight > element.clientHeight + 1, words: element.innerText.trim().split(/\s+/).length };
    });
    const controls = [...document.querySelectorAll<HTMLElement>(".home-group a, .home-group button")].filter((element) => element.getBoundingClientRect().height > 0).map((element) => Math.round(element.getBoundingClientRect().height));
    return { width: window.innerWidth, height: window.innerHeight, viewportBottom: Math.round(viewportBottom), goal, milestone, today, prescription, activity, groups, readability, controls, goalAndTodayFit: today.bottom <= viewportBottom, allGroupsFit: activity.bottom <= viewportBottom, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  await fs.mkdir(e2eRoot, { recursive: true });
  const prefix = path.join(e2eRoot, `${label}-${layout.width}x${layout.height}`);
  await fs.writeFile(`${prefix}.json`, JSON.stringify(layout, null, 2));
  await page.screenshot({ path: `${prefix}-viewport.png`, style: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: `${prefix}-full.png`, fullPage: true, style: "nextjs-portal { display: none; }" });
  await info.attach(`${label}-${layout.width}-fit`, { body: JSON.stringify(layout, null, 2), contentType: "application/json" });
  expect(layout.horizontalOverflow, "Home must reflow without horizontal scrolling").toBe(false);
  expect(layout.groups[1].top - layout.groups[0].bottom, "Goal and Today need visible separation").toBeGreaterThanOrEqual(12);
  if (layout.width >= 1100) {
    expect(layout.activity.left - layout.today.right, "Workout and activity should sit side by side with space between them").toBeGreaterThanOrEqual(12);
    expect(Math.abs(layout.activity.top - layout.today.top)).toBeLessThanOrEqual(1);
  } else {
    expect(layout.groups[2].top - layout.groups[1].bottom, "Stacked workout and activity need visible separation").toBeGreaterThanOrEqual(12);
  }
  for (const text of layout.readability) {
    expect(text.fontSize, "Summary prose must remain readable").toBeGreaterThanOrEqual(text.supporting ? 14 : 16);
    expect(text.lineHeight / text.fontSize).toBeGreaterThanOrEqual(1.4);
    expect(text.clipped, "Summary text must remain complete").toBe(false);
    expect(text.words, "Routine summary prose must stay concise").toBeLessThanOrEqual(70);
  }
  for (const height of layout.controls) expect(height, "Home controls need touch-sized targets").toBeGreaterThanOrEqual(44);
  if (layout.width >= 1100) {
    expect(layout.milestone.left).toBeGreaterThan(layout.goal.right);
    expect(layout.milestone.top).toBeLessThan(layout.goal.bottom);
    expect(layout.milestone.bottom).toBeGreaterThan(layout.goal.top);
  } else {
    expect(layout.milestone.top).toBeGreaterThan(layout.goal.bottom);
  }
  if (layout.width === 390) {
    expect(layout.groups[0].bottom, "The whole concise goal and milestone card should fit above the phone navigation").toBeLessThanOrEqual(layout.viewportBottom);
    expect(layout.prescription.bottom, "Today's actionable prescription should fit above the phone navigation").toBeLessThanOrEqual(layout.viewportBottom);
    if (layout.height >= 844) expect(layout.allGroupsFit, "Goal, workout, check-in and recent activity should fit in the ordinary phone viewport").toBe(true);
  }
  if (layout.width >= 768 && layout.width < 1100) {
    expect(layout.milestone.top).toBeGreaterThan(layout.goal.bottom);
  }
  if (layout.width === 1440 && layout.height === 900) expect(layout.allGroupsFit, "All concise desktop summaries should fit in the first viewport").toBe(true);
  if (layout.width === 1440 && layout.height === 1200) expect(layout.allGroupsFit, "The concise desktop groups should fit at the taller review viewport").toBe(true);
  // Verify the required scroll remains usable with fixed phone navigation.
  await page.locator(".home-activity a").last().evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const link = await page.locator(".home-activity a").last().boundingBox();
  expect(link!.y).toBeGreaterThanOrEqual(layout.width < 768 ? 64 : 0);
  expect(link!.y + link!.height).toBeLessThanOrEqual(layout.viewportBottom + 1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  return layout;
}
