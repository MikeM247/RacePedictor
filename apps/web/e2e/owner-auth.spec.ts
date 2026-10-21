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

test("alternate-host login keeps the PKCE cookie on the OAuth callback origin", async ({ page, context, baseURL }) => {
  const canonical = new URL(baseURL!);
  canonical.hostname = "owner-auth.test";

  // No request reaches GitHub and no real user account is used.
  await page.route("https://github.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<p>OAuth authorization intercepted for the test.</p>",
  }));

  await page.goto("/login");
  await expect(page).toHaveURL(`${canonical.origin}/login`);
  const authorizationRequest = page.waitForRequest((request) =>
    request.url().startsWith("https://github.com/login/oauth/authorize"));
  await page.getByRole("button", { name: "Continue with GitHub" }).click();
  const authorization = new URL((await authorizationRequest).url());
  expect(authorization.searchParams.get("redirect_uri")).toBe(`${canonical.origin}/api/auth/callback/github`);
  expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");

  const verifier = (await context.cookies(canonical.origin)).find((cookie) =>
    cookie.name.endsWith("pkce.code_verifier"));
  expect(verifier, "the callback hostname must own the PKCE verification cookie").toBeDefined();
  expect(verifier!.httpOnly).toBe(true);
  expect(verifier!.domain).toBe(canonical.hostname);

  let callbackCookies: string | null = null;
  await page.route(`${canonical.origin}/api/auth/callback/github**`, async (route) => {
    callbackCookies = await route.request().headerValue("cookie");
    await route.fulfill({ status: 200, contentType: "text/plain", body: "Callback intercepted" });
  });
  await page.goto(`${canonical.origin}/api/auth/callback/github?code=test-only`);
  expect(callbackCookies, "the browser must send the verifier back on callback").toContain(`${verifier!.name}=${verifier!.value}`);
});

test("an alternate-host login POST restarts on the canonical origin without replaying the action", async ({ request, baseURL }) => {
  const canonical = new URL(baseURL!);
  canonical.hostname = "owner-auth.test";
  const response = await request.post("/login", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe(`${canonical.origin}/login`);
});
