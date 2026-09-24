import { expect, test } from "@playwright/test";
import { expectAxeClean, expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";

test("F05 scans the expanded Home prediction-settings disclosure without writes", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await page.goto("/dashboard");
  const disclosure = page.locator("details.home-prediction-settings");
  await expect(disclosure).toBeVisible();
  await disclosure.locator("summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
  await expectAxeClean(page, "Home prediction settings expanded");
  expectNoApplicationWrites(writes);
});
