import { expect, test } from "@playwright/test";

const viewports = [
  { name: "desktop", width: 1280, height: 900, logoWidth: 190 },
  { name: "mobile", width: 390, height: 844, logoWidth: 160 },
  { name: "narrow mobile", width: 320, height: 740, logoWidth: 160 },
] as const;

test("dashboard brand shows the full proportional logo and links home on desktop and mobile", async ({ page }) => {
  await page.goto("/dashboard/activities");
  const brand = page.getByRole("link", { name: "Race Predictor Home" });
  const logo = brand.locator("img");

  await expect(brand).toHaveAttribute("href", "/dashboard");
  await expect(logo).toHaveAttribute("src", /racepredictor-brand/);
  await expect(brand.locator("strong, small")).toHaveCount(0);
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const box = await logo.boundingBox();
    const ratio = await logo.evaluate((image) => {
      const element = image as HTMLImageElement;
      return element.naturalWidth / element.naturalHeight;
    });

    expect(box?.width, `${viewport.name} logo width`).toBe(viewport.logoWidth);
    expect(Math.abs((box?.height ?? 0) - viewport.logoWidth / ratio), `${viewport.name} logo preserves its proportions`).toBeLessThan(0.5);
    await expect(logo).toHaveCSS("border-width", "0px");
    await expect(logo).toHaveCSS("box-shadow", "none");
    expect(await logo.evaluate((image) => {
      const element = image as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = element.naturalWidth;
      canvas.height = element.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(element, 0, 0);
      return context.getImageData(0, 0, 1, 1).data[3];
    }), `${viewport.name} logo has a transparent corner`).toBe(0);
  }

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(brand).toBeFocused();
  expect(await brand.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(brand).toHaveCSS("outline-width", "3px");

  await brand.click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
