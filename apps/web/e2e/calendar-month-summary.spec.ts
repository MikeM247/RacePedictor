import { expect, test } from "@playwright/test";

const plan = { id: "summary-plan", version: 1, startsOn: "2026-10-01", endsOn: "2026-12-31", timezone: "Africa/Johannesburg" };
const workout = {
  id: "summary-session", kind: "run", scheduledDate: "2026-11-01", prescribedDate: "2026-11-01", originalDate: "2026-11-01", effectiveDate: "2026-11-01",
  startTime: "07:00", title: "Easy supporting run", purpose: "Build aerobic consistency.", prescription: "Run easily for 40 minutes.", durationMinutes: 40,
  distanceMeters: 6000, cautions: [], status: "upcoming", revision: 1, warnings: [],
  original: { id: "summary-session", kind: "run", scheduledDate: "2026-11-01", title: "Easy supporting run", purpose: "Build aerobic consistency.", prescription: "Run easily for 40 minutes.", durationMinutes: 40, distanceMeters: 6000, cautions: [] }, amendments: [],
};
const activity = {
  id: "summary-activity", athleteId: "e2e_athlete", title: "Recorded morning run", occurredAt: "2026-11-01T05:00:00.000Z", localDate: "2026-11-01", sport: "run",
  distanceM: 5000, elapsedTimeS: 1800, avgPaceSecPerKm: 360, elevationGainM: 30, hrAvailable: false, cadenceAvailable: false,
};

async function installCalendarFixtures(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    // Fixed fixture dates can raise the existing shared-header hydration warning.
    // Keep the development overlay from intercepting application navigation.
    new MutationObserver(() => document.querySelectorAll<HTMLElement>("nextjs-portal").forEach((node) => { node.style.display = "none"; }))
      .observe(document, { childList: true, subtree: true });
  });
  await page.clock.setFixedTime(new Date("2026-11-01T05:00:00.000Z"));
  const reply = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  await page.route("**/api/v1/coaching/calendar?**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill(reply({ from: url.searchParams.get("from"), to: url.searchParams.get("to"), timezone: "Africa/Johannesburg", sessions: [workout], historicalSessions: [], activities: [activity], activitiesReadStatus: "available", planReadStatus: "active", scheduleReadStatus: "effective" }));
  });
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill(reply(plan)));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill(reply({ date: "2026-11-01", timezone: "Africa/Johannesburg", state: "upcoming", status: "upcoming", plan, session: workout, stale: { isStale: false } })));
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill(reply({ context: null })));
  await page.route("**/api/v1/coaching/race-history", (route) => route.fulfill(reply({ items: [] })));
  await page.route("**/api/v1/wellbeing-check-ins?**", (route) => route.fulfill(reply({ items: [] })));
  await page.route("**/api/v1/dashboard/appearance", (route) => route.fulfill(reply({ heroImageUrl: null })));
}

test("Option 08 shares the dark dashboard frame and shows month-only totals below weekly ribbons", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installCalendarFixtures(page);
  await page.goto("/dashboard/calendar");

  const frame = page.locator(".shared-dashboard-theme");
  await expect(frame).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.locator(".calendar-month-summary-option-08 h2", { hasText: "November 2026" })).toBeVisible();
  await expect(page.locator(".calendar-weekday-headings strong")).toHaveText(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  await expect(page.locator(".calendar-week-total")).toHaveCount(6);
  const summary = page.getByRole("region", { name: "November 2026 whole-month totals" });
  await expect(summary.getByText("Planned", { exact: true })).toBeVisible();
  await expect(summary.getByText("6 km", { exact: true })).toBeVisible();
  await expect(summary.getByText("5 km", { exact: true })).toBeVisible();
  expect(await frame.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(8, 20, 30)");
  expect(await frame.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/Arial/i);
  for (const [width, height] of [[320, 800], [390, 844], [768, 900], [1024, 900], [1440, 900], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".calendar-weekday-headings strong")).toHaveCount(7);
    const columnWidths = await page.locator(".calendar-week-row").first().locator(".calendar-day").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)));
    expect(Math.max(...columnWidths) - Math.min(...columnWidths)).toBeLessThanOrEqual(1);
    if (width === 320) expect(Math.min(...columnWidths)).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("normal Calendar entry places today under measured sticky controls on phone and desktop", async ({ page }) => {
  await installCalendarFixtures(page);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard/calendar");
    const today = page.locator("#calendar-day-2026-11-01");
    await expect(today).toBeVisible();
    const geometry = await page.evaluate(() => {
      const cell = document.querySelector<HTMLElement>("#calendar-day-2026-11-01")!.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>(".shared-topnav")!.getBoundingClientRect();
      const controls = document.querySelector<HTMLElement>(".calendar-controls")!.getBoundingClientRect();
      const weekdays = document.querySelector<HTMLElement>(".calendar-weekday-headings")!.getBoundingClientRect();
      const mobileNav = document.querySelector<HTMLElement>(".shared-mobile-nav")?.getBoundingClientRect();
      return { cellTop: cell.top, cellBottom: cell.bottom, stickyBottom: Math.max(nav.bottom, controls.bottom, weekdays.bottom), mobileTop: mobileNav && mobileNav.height > 0 ? mobileNav.top : innerHeight };
    });
    expect(geometry.cellTop).toBeGreaterThanOrEqual(geometry.stickyBottom - 1);
    expect(geometry.cellBottom).toBeLessThanOrEqual(geometry.mobileTop + 1);
  }
});

test("mobile Calendar shell has no legacy header offset and keeps the Home settings icon", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCalendarFixtures(page);
  await page.goto("/dashboard/calendar");

  const settings = page.getByRole("link", { name: "Settings" });
  const geometry = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>(".dashboard-layout")!;
    const nav = document.querySelector<HTMLElement>(".shared-topnav")!;
    const heading = document.querySelector<HTMLElement>(".dashboard-toolbar h1")!;
    const link = document.querySelector<HTMLElement>(".shared-nav-utility>a")!;
    const icon = link.querySelector<SVGElement>("svg")!;
    const navBox = nav.getBoundingClientRect();
    const headingBox = heading.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return {
      layoutPaddingTop: getComputedStyle(layout).paddingTop,
      navTop: navBox.top,
      navHeight: navBox.height,
      titleGap: headingBox.top - navBox.bottom,
      utilityWidth: linkBox.width,
      iconCenterOffset: Math.abs((iconBox.left + iconBox.width / 2) - (linkBox.left + linkBox.width / 2)),
      labelClip: getComputedStyle(link.querySelector("span")!).clip,
    };
  });

  await expect(settings).toBeVisible();
  expect(geometry.layoutPaddingTop).toBe("0px");
  expect(geometry.navTop).toBe(0);
  expect(geometry.navHeight).toBeLessThanOrEqual(72);
  expect(geometry.titleGap).toBeLessThanOrEqual(48);
  expect(geometry.utilityWidth).toBe(44);
  expect(geometry.iconCenterOffset).toBeLessThanOrEqual(1);
  expect(geometry.labelClip).not.toBe("none");
});

test("session links retain their detail target and browser return reveals today's week", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCalendarFixtures(page);
  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page).toHaveURL(/\/dashboard\/calendar/);
  await page.goto("/dashboard/calendar?date=2026-11-01&session=summary-session");
  await expect(page.getByRole("dialog")).toContainText("Easy supporting run");
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Normal-entry history must not retain the explicit session deep link, which
  // correctly opens its details again when revisited.
  await page.goto("/dashboard/calendar");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-12");
  await expect(page.locator("#calendar-day-2026-12-01")).toBeVisible();
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-11");
  await expect(page.locator("#calendar-day-2026-11-01")).toBeVisible();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-12");
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/calendar/);
  await expect(page.locator("#calendar-day-2026-11-01")).toBeVisible();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-11");
  const today = await page.locator("#calendar-day-2026-11-01").boundingBox();
  expect(today?.y).toBeGreaterThan(0);
  expect(today?.y).toBeLessThan(844 - 60);
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-12");
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-11");
});
