import { expect, test } from "@playwright/test";

test("protected dashboard redirects to a clear owner sign-in screen", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("heading", { name: "Your training dashboard, online" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeEnabled();
  await expect(page.getByText("Only the configured owner account is accepted.")).toBeVisible();
});

test("owner sign-in remains usable at the 390px responsive baseline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  const dimensions = await page.locator("body").evaluate((body) => ({
    clientWidth: body.clientWidth,
    scrollWidth: body.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("public session status and protected APIs fail closed without owner credentials", async ({ request }) => {
  const session = await request.get("/api/v1/auth/session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toEqual({
    data: { authenticated: false, actor: null, reason: "unauthenticated" },
  });

  const activities = await request.get("/api/v1/activities");
  expect(activities.status()).toBe(401);
  expect(await activities.json()).toEqual({
    error: { code: "UNAUTHENTICATED", message: "Authentication is required", details: [] },
  });
});
