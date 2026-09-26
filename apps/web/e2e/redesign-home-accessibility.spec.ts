import { expect, test } from "@playwright/test";
import { expectAxeClean, expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";

test("F05 scans the expanded current-fitness readiness detail without writes", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to page content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#dashboard-main-content")).toBeFocused();
  await page.getByRole("button", { name: "View current-fitness details" }).click();
  await expect(page.getByRole("heading", { name: "Current-fitness estimate" })).toBeVisible();
  await expectAxeClean(page, "Current-fitness readiness detail expanded");
  expectNoApplicationWrites(writes);
});
