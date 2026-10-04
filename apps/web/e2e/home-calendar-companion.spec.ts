import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { fixturePlan, fixtureCalendarSession } from "./coaching-fixtures.ts";
import { expectAxeClean, expectNoApplicationWrites, recordApplicationWrites } from "./test-helpers.ts";
import { e2eRoot } from "./fixture-paths.ts";
import { assertHomeLayout } from "./home-layout-assertions.ts";

const date = "2026-10-03";
const hash = "a".repeat(64);
const activities = [1, 2].map((i) => ({ id: `recorded-${i}`, athleteId: "e2e_athlete", title: `Recorded run ${i}`, sport: "run", localDate: date, occurredAt: `2026-10-03T0${i}:00:00.000Z`, localOccurredAt: null, distanceM: 5000, elapsedTimeS: 1800, avgPaceSecPerKm: 360, elevationGainM: 40, hrAvailable: false, cadenceAvailable: false }));
const sessions = [1, 2].map((i) => fixtureCalendarSession({ id: `planned-${i}`, title: `Planned session ${i}`, scheduledDate: date, prescribedDate: "2026-10-02", originalDate: "2026-10-02", effectiveDate: date, purpose: "Develop aerobic endurance.", prescription: "Run easily for 45 minutes.", revision: 2, original: { id: `planned-${i}`, title: `Original session ${i}`, kind: "run", purpose: "Approved aerobic purpose.", prescription: "Original approved prescription.", scheduledDate: "2026-10-02", durationMinutes: 45, cautions: [] }, amendments: [{ id: `amend-${i}`, operation: "reschedule", reason: "Owner moved this session for availability.", changedAt: "2026-10-01T08:00:00.000Z", changedFields: ["effectiveDate"], resultingRevision: 2 }] }));
const plan = fixturePlan({ id: "companion-plan" });
const review = { id: "coach-review", athleteId: "e2e_athlete", activityId: "recorded-2", revision: 1, inputFingerprint: hash, headline: "Controlled recorded effort.", assessment: "The recorded pace remained steady. This session alone does not establish race readiness.", nextStep: "Follow the approved plan if recovery remains normal.", comparison: { matchState: "suggested", planId: plan.id, sessionId: "planned-2", planVersion: plan.version, sessionTitle: "Planned session 2", plannedDurationMinutes: 45, actualDurationMinutes: 30, plannedDistanceMeters: 7000, actualDistanceMeters: 5000, plannedIntensityRpe: 3, actualPerceivedEffort: null, interpretation: "Possible session only; link unconfirmed." }, evidence: [{ source: "activity", label: "Recorded duration", reference: "recorded-2" }], limitations: ["Heart-rate data was unavailable."], generatedAt: "2026-10-03T08:00:00.000Z", publishedAt: "2026-10-03T08:01:00.000Z", model: "fixture-model", promptVersion: "fixture.v1" };

function dayCell(page: Page, date: string) {
  return page.locator(".calendar-day").filter({ has: page.locator(`.calendar-day-heading time[datetime="${date}"]`) });
}

async function mockCompanion(page: Page, options: { planned?: Array<Omit<typeof sessions[number], "distanceMeters"> & { distanceMeters?: number }>; recorded?: typeof activities; activityFailure?: boolean; timezone?: string; longReview?: boolean; longNarrative?: boolean } = {}) {
  await page.addInitScript(() => {
    const hideDevIndicator = () => {
      document.querySelectorAll("nextjs-portal").forEach((element) => { (element as HTMLElement).style.display = "none"; });
    };
    new MutationObserver(hideDevIndicator).observe(document, { childList: true, subtree: true });
  });
  await page.clock.setFixedTime(new Date("2026-10-03T08:00:00.000Z"));
  const planned = options.planned ?? sessions;
  const recorded = options.recorded ?? activities;
  const reply = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  await page.route("**/api/v1/coaching/calendar?**", (route) => route.fulfill(reply({ from: "2026-09-28", to: "2026-11-01", timezone: options.timezone ?? "Africa/Johannesburg", sessions: planned, activities: recorded, historicalSessions: [], activitiesReadStatus: options.activityFailure ? "unavailable" : "available" })));
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill(reply(options.longNarrative ? { ...plan, approval: { ...plan.approval, rationale: "Maintain consistency while respecting recovery and the approved training constraints. ".repeat(12) } } : plan)));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill(reply({ date, timezone: options.timezone ?? "Africa/Johannesburg", state: "upcoming", status: "upcoming", todayScheduleKind: "prescribed_session", plan: { id: plan.id, version: plan.version }, session: planned[0] ?? null, nextWorkout: null, links: { calendar: "/dashboard/calendar", session: planned[0] ? `/dashboard/calendar?date=${date}&session=${planned[0].id}` : null }, stale: { isStale: false } })));
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill(reply({ context: { state: "ready", plan: { id: plan.id, version: plan.version, revision: plan.revision, startsOn: plan.startsOn, endsOn: plan.endsOn, timezone: "Africa/Johannesburg", approvalContentHash: plan.approval.contentHash }, goal: { id: plan.goalId, athleteId: "e2e_athlete", revision: plan.goalRevision, title: "Approved autumn goal", why: options.longNarrative ? "Build confidence through consistent training without ignoring recovery or the approved constraints. ".repeat(12) : "Build confidence through consistent training.", target: { kind: "performance", distanceMeters: 21100, targetTimeSeconds: 7200, targetDate: "2026-10-12" } }, milestones: [{ id: "race-milestone", title: "Approved race milestone", distanceMeters: 10000, targetTimeSeconds: 3300, targetDate: "2026-10-04" }], projection: { contextHash: hash, publishedAt: "2026-10-03T08:00:00.000Z" } } })));
  await page.route("**/api/v1/activities**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/v1/activities") return route.fulfill(reply({ items: recorded }));
    const id = pathname.split("/")[4];
    const savedReview = { ...review, activityId: id, assessment: options.longReview ? "A complete qualified assessment with conditional advice. ".repeat(20) : review.assessment };
    const coachFeedback = { activityId: id, status: "ready", review: savedReview, requestId: null, updatedAt: "2026-10-03T08:01:00.000Z", readRevision: 1 };
    if (pathname.endsWith("/coach-review")) return route.fulfill(reply(coachFeedback));
    if (pathname.endsWith("/feedback")) return route.fulfill(reply({ activityId: id, coachFeedback, athleteFeedback: null, legacyReviews: [] }));
    const activity = recorded.find((item) => item.id === id) ?? recorded[0];
    return route.fulfill(reply({ activity: { ...activity, sourceType: "manual", endedAt: "2026-10-03T03:30:00.000Z", elevationLossM: 20, dedupeHash: hash, createdAt: "2026-10-03T04:00:00.000Z", splits: [], routeSignature: null } }));
  });
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchStatus: "empty", stale: { isStale: false } }) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Fixture freshness unavailable" } }) }));
}

test("mixed multiple records open independently with original/history and feedback intact", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCompanion(page);
  await page.goto(`/dashboard/calendar?date=${date}`);
  const cell = page.locator(".calendar-day").filter({ hasText: "Planned session 1" });
  await expect(cell).toContainText("RECORDED");
  await expect(cell).toContainText("+2 more");
  const pane = page.getByRole("complementary", { name: "Selected day" });
  await expect(pane.getByRole("button", { name: /View planned session:/ })).toHaveCount(2);
  await expect(pane.getByRole("button", { name: /View activity:/ })).toHaveCount(2);
  await expect(pane).toContainText("Sharing a date does not confirm");
  for (const session of sessions) {
    const launcher = pane.getByRole("button", { name: `View planned session: ${session.title}` });
    await launcher.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(`#session-${session.id}`)).toBeFocused();
    await expect(dialog).toContainText("Run easily for 45 minutes.");
    await dialog.locator(`#session-${session.id} .session-source summary`).click();
    await expect(dialog.locator(`#session-${session.id}`)).toContainText("Original approved prescription.");
    await dialog.locator(`#session-${session.id} .session-history summary`).click();
    await expect(dialog.locator(`#session-${session.id}`)).toContainText("Owner moved this session for availability.");
    await page.keyboard.press("Escape");
    await expect(launcher).toBeFocused();
  }
  for (const activity of activities) {
    const launcher = pane.getByRole("button", { name: `View activity: ${activity.title}` });
    await launcher.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(`#calendar-record-${activity.id}`)).toBeFocused();
    await expect(dialog).toContainText("Run at a glance");
    await expect(dialog).toContainText("Athlete feedback");
    await expect(dialog.getByRole("heading", { name: "AI coach feedback", exact: true })).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(launcher).toBeFocused();
  }
  await expectAxeClean(page, "desktop mixed calendar");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(e2eRoot, "companion-calendar-desktop-viewport.png") });
  await page.screenshot({ path: path.join(e2eRoot, "companion-calendar-desktop.png"), fullPage: true });
  expectNoApplicationWrites(writes);
});

test("compact month opens every day record, preserves deep links, history, feedback and focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCompanion(page);
  await page.goto(`/dashboard/calendar?date=${date}&session=planned-2`);
  await expect(page.getByRole("dialog").locator("#session-planned-2")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".calendar-month-region")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Selected day" })).toBeHidden();
  const cell = dayCell(page, date);
  await expect(cell.locator(".calendar-day-entries--compact")).toContainText("7 km");
  await expect(cell.locator(".calendar-day-entries--compact")).toContainText("5 km");
  await expect(cell.locator(".calendar-compact-more")).toHaveText("+2");
  await cell.click();
  const dialog = page.getByRole("dialog", { name: "Day details — 03 Oct 2026" });
  await expect(dialog.locator(".session-card")).toHaveCount(2);
  await expect(dialog.locator(".calendar-activity-record")).toHaveCount(2);
  await expect(dialog).toContainText("Athlete feedback");
  await expect(dialog.getByRole("heading", { name: "AI coach feedback", exact: true })).toHaveCount(2);
  await dialog.locator("#session-planned-2 .session-source summary").click();
  await expect(dialog.locator("#session-planned-2")).toContainText("Original approved prescription.");
  await dialog.locator("#session-planned-2 .session-history summary").click();
  await expect(dialog.locator("#session-planned-2")).toContainText("Owner moved this session for availability.");
  await expectAxeClean(page, "mobile day dialog");
  await page.keyboard.press("Escape");
  await expect(cell).toBeFocused();
  await expectAxeClean(page, "mobile month calendar");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(e2eRoot, "companion-calendar-mobile-viewport.png") });
  await page.screenshot({ path: path.join(e2eRoot, "companion-calendar-mobile.png"), fullPage: true });
});

test("one-kind overflow, unavailable records and API timezone stay truthful", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCompanion(page, { planned: [], recorded: [...activities, { ...activities[0], id: "recorded-3", title: "Third run" }], timezone: "America/New_York" });
  await page.goto(`/dashboard/calendar?date=${date}`);
  await expect(page.locator(".calendar-day").filter({ hasText: "Recorded run 1" })).toContainText("+2 more");
  await page.getByText("Training totals and timezone", { exact: true }).click();
  await expect(page.getByText(/Dates use America\/New_York/)).toBeVisible();
  await mockCompanion(page, { recorded: [], activityFailure: true });
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Selected day" })).toContainText("Recorded activities could not be loaded");
  await expect(page.getByRole("complementary", { name: "Selected day" })).not.toContainText("No recorded activity.");
});

test("rest, skipped, moved and planned-only days retain independent records without completion claims", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const third = { ...sessions[0], id: "planned-3", title: "Third planned session" };
  for (const variant of [
    { planned: [...sessions, third], recorded: [] },
    { planned: [{ ...sessions[0], kind: "rest" as const, title: "Prescribed rest", durationMinutes: 0 }, sessions[1]], recorded: activities },
    { planned: [{ ...sessions[0], status: "skipped" as const }, sessions[1]], recorded: activities },
  ]) {
    await mockCompanion(page, variant);
    await page.goto(`/dashboard/calendar?date=${date}`);
    const pane = page.getByRole("complementary", { name: "Selected day" });
    await expect(pane.getByRole("button", { name: /View planned session:/ })).toHaveCount(variant.planned.length);
    await expect(pane.getByRole("button", { name: /View activity:/ })).toHaveCount(variant.recorded.length);
    await expect(pane).not.toContainText(/completed|fulfilled/i);
    if (!variant.recorded.length) await expect(page.locator(".calendar-day").filter({ hasText: "Planned session 1" })).toContainText("+2 more");
    if (variant.planned[0].status === "skipped") await expect(pane).toContainText("skipped");
    await pane.getByRole("button", { name: `View planned session: ${variant.planned[0].title}` }).click();
    await expect(page.getByRole("dialog").locator("#session-planned-1")).toBeFocused();
    await page.keyboard.press("Escape");
  }
});

test("Calendar initial date resolves across saved-zone midnight without hanging a same-month read", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCompanion(page, { timezone: "America/New_York" });
  await page.clock.setFixedTime(new Date("2026-10-03T00:30:00.000Z"));
  await page.goto("/dashboard/calendar");
  await expect(page.locator(".calendar-month-region")).toBeVisible();
  await expect(dayCell(page, "2026-10-02")).toHaveAttribute("aria-current", "date");
  await expect(dayCell(page, "2026-10-02")).toHaveAttribute("aria-pressed", "true");
});

test("long approved explanations remain complete in disclosures and scroll readably at narrow widths", async ({ page }) => {
  await mockCompanion(page, { longNarrative: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard");
    const narratives = page.locator(".home-narrative-detail");
    await expect(narratives).toHaveCount(2);
    for (const label of ["Why", "Plan"]) {
      const disclosure = narratives.filter({ has: page.locator("summary", { hasText: new RegExp(`^${label}$`) }) });
      await disclosure.locator("summary").click();
      await expect(disclosure).toHaveAttribute("open", "");
      expect((await disclosure.locator("p").innerText()).trim().split(/\s+/).length).toBeGreaterThan(100);
      expect(await disclosure.locator("p").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole("link", { name: /View full session review/ }).click();
    await expect(page.getByRole("heading", { name: "Recorded run 2", exact: true })).toBeVisible();
  }
});

test("one record read can recover independently and future-dated records remain openable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCompanion(page);
  let fail = true;
  let detailReads = 0;
  await page.route("**/api/v1/activities/recorded-2", (route) => {
    detailReads += 1;
    return fail ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Controlled record outage" } }) }) : route.fallback();
  });
  await page.goto(`/dashboard/calendar?date=${date}`);
  await page.getByRole("complementary", { name: "Selected day" }).getByRole("button", { name: "View activity: Recorded run 2" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#calendar-record-recorded-1")).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Controlled record outage");
  fail = false;
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.locator("#calendar-record-recorded-2")).toBeFocused();
  expect(detailReads).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.locator("#calendar-record-recorded-2")).toBeFocused();
  await page.keyboard.press("Escape");
  const future = "2026-10-04";
  await mockCompanion(page, { planned: [], recorded: [{ ...activities[0], localDate: future }] });
  await page.goto(`/dashboard/calendar?date=${future}`);
  await dayCell(page, future).click();
  await expect(page.getByRole("dialog").locator("#calendar-record-recorded-1")).toBeVisible();
});

test("mobile month covers planned, recorded, multiple, empty, rest, skipped, moved and missing metrics", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const variants = [
    { planned: sessions, recorded: [] },
    { planned: [], recorded: activities },
    { planned: [], recorded: activities.map(activity => ({ ...activity, title: "Morning run" })) },
    { planned: [...sessions, { ...sessions[0], id: "planned-3" }], recorded: [] },
    { planned: [], recorded: [...activities, { ...activities[0], id: "recorded-3" }] },
    { planned: [], recorded: [] },
    { planned: [{ ...sessions[0], kind: "rest", title: "Prescribed rest", durationMinutes: 0, distanceMeters: undefined }], recorded: [] },
    { planned: [{ ...sessions[0], status: "skipped" }], recorded: [] },
    { planned: [{ ...sessions[0], distanceMeters: undefined }], recorded: [{ ...activities[0], distanceM: 0, elapsedTimeS: 1500 }] },
    { planned: [{ ...sessions[0], distanceMeters: undefined, durationMinutes: 0 }], recorded: [{ ...activities[0], distanceM: 0, elapsedTimeS: 0 }] },
  ];
  for (const variant of variants) {
    await mockCompanion(page, variant);
    await page.goto(`/dashboard/calendar?date=${date}`);
    const cell = dayCell(page, date);
    const compact = cell.locator(".calendar-day-entries--compact");
    await expect(cell).toHaveAttribute("aria-haspopup", "dialog");
    const extras = Math.max(0, variant.planned.length - 1) + Math.max(0, variant.recorded.length - 1);
    if (extras) await expect(compact.locator(".calendar-compact-more")).toHaveText(`+${extras}`);
    else await expect(compact.locator(".calendar-compact-more")).toHaveCount(0);
    if (variant.planned[0]?.kind === "rest") await expect(compact).toContainText("Rest");
    if (variant.planned[0]?.status === "skipped") await expect(compact).toContainText("Skipped");
    if (variant.recorded[0]?.elapsedTimeS === 1500) { await expect(compact).toContainText("45 min"); await expect(compact).toContainText("25 min"); }
    if (variant.recorded[0]?.elapsedTimeS === 0) { await expect(compact.locator("strong")).toHaveText(["N/A", "N/A"]); await expect(compact).not.toContainText("0 km"); }
    await cell.click();
    const dialog = page.getByRole("dialog", { name: "Day details — 03 Oct 2026" });
    await expect(dialog.locator(".session-card")).toHaveCount(variant.planned.length);
    await expect(dialog.locator(".calendar-activity-record")).toHaveCount(variant.recorded.length);
    if (!variant.recorded.length) await expect(dialog).toContainText("No recorded activity.");
    if (!variant.planned.length) await expect(dialog).toContainText("No session scheduled in the active plan for this date.");
    if (variant.planned.length) {
      await expect(dialog.locator(".session-card").first()).toContainText("Current prescription:");
      await expect(dialog.locator(".session-card").first()).toContainText("Prescribed date");
    }
    if (variant.recorded[0]?.title === "Morning run") await expectAxeClean(page, "same-title activity records have unique landmarks");
    await dialog.getByRole("button", { name: "Close details" }).click();
    await expect(cell).toBeFocused();
  }
  expectNoApplicationWrites(writes);
});

test("mobile day unavailable status and individual record retries preserve other records", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCompanion(page, { recorded: [], activityFailure: true });
  await page.goto(`/dashboard/calendar?date=${date}`);
  const cell = dayCell(page, date);
  await cell.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Recorded activities could not be loaded");
  await expect(dialog).not.toContainText("No recorded activity.");
  await mockCompanion(page);
  await dialog.getByRole("button", { name: "Retry calendar" }).click();
  await expect(dialog.locator(".calendar-activity-record")).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "Retry calendar" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(cell).toBeFocused();
  let failed = true;
  let reads = 0;
  await page.route("**/api/v1/activities/recorded-2", route => {
    reads += 1;
    return failed ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Day detail outage" } }) }) : route.fallback();
  });
  await page.reload();
  await cell.click();
  await expect(dialog.locator("#calendar-record-recorded-1")).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Day detail outage");
  failed = false;
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.locator("#calendar-record-recorded-2")).toBeVisible();
  expect(reads).toBe(2);
  await page.keyboard.press("Escape");
  await expect(cell).toBeFocused();
});

test("month navigation, adjacent dates, Today, year boundary and close retain month and scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCompanion(page);
  await page.goto(`/dashboard/calendar?date=${date}`);
  await expect(page.locator(".calendar-weekday-headings strong")).toHaveText(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  await expect(page.locator(".calendar-day")).toHaveCount(35);
  const adjacent = dayCell(page, "2026-09-28");
  await expect(adjacent).toHaveClass(/calendar-day--outside/);
  await adjacent.click();
  await expect(page.getByRole("dialog", { name: "Day details — 28 Sept 2026" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(adjacent).toBeFocused();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-10");
  const lower = dayCell(page, "2026-10-25");
  await lower.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  await lower.click();
  await expect(page.getByRole("dialog", { name: "Day details — 25 Oct 2026" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lower).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-11");
  await expect(page.locator(".calendar-day")).toHaveCount(42);
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-10");
  await page.getByLabel("Choose month and year").selectOption("2026-12");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2027-01");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByLabel("Choose month and year")).toHaveValue("2026-10");
  await expect(dayCell(page, date)).toHaveAttribute("aria-pressed", "true");
  await expect(dayCell(page, date)).toHaveAttribute("aria-current", "date");
  await page.getByText("Training totals and timezone", { exact: true }).click();
  await expect(page.getByText(/Dates use Africa\/Johannesburg/)).toBeVisible();
});

test("month interaction responds to resizing and retains record deep links", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCompanion(page);
  await page.goto(`/dashboard/calendar?date=${date}`);
  const cell = dayCell(page, date);
  await cell.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Selected day" })).toBeVisible();
  await page.setViewportSize({ width: 1199, height: 900 });
  await expect(cell).toHaveAttribute("aria-haspopup", "dialog");
  await cell.click();
  await expect(page.getByRole("dialog", { name: "Day details — 03 Oct 2026" })).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(cell).toBeFocused();
  await expect(cell).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("complementary", { name: "Selected day" }).getByRole("button", { name: "View planned session: Planned session 2" }).click();
  await expect(page.getByRole("dialog").locator("#session-planned-2")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("dialog").locator("#session-planned-2")).toBeFocused();
  await page.keyboard.press("Escape");
  await cell.click();
  await expect(page.getByRole("dialog", { name: "Day details — 03 Oct 2026" })).toBeVisible();
});

test("mobile day details retain permitted past skip and future amendment actions", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const past = "2026-10-02";
  const future = "2026-10-04";
  await mockCompanion(page, { planned: [{ ...sessions[0], effectiveDate: past }, { ...sessions[1], effectiveDate: future }], recorded: [] });
  await page.goto(`/dashboard/calendar?date=${date}`);
  await dayCell(page, past).click();
  const dialog = page.getByRole("dialog", { name: /^Day details/ });
  await expect(dialog.getByRole("button", { name: "Amend session" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Record skipped" }).click();
  const skip = page.getByRole("alertdialog", { name: "Confirm skip" });
  await expect(skip.getByLabel("Reason for this change")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dayCell(page, past)).toBeFocused();
  await dayCell(page, future).click();
  await dialog.getByRole("button", { name: "Amend session" }).click();
  const amend = page.getByRole("dialog", { name: "Amend future session" });
  await expect(amend.getByLabel("Reason for this amendment")).toBeVisible();
  await expect(amend.getByRole("button", { name: "Save reasoned amendment" })).toBeDisabled();
  await amend.getByRole("button", { name: "Cancel" }).click();
  await expect(dayCell(page, future)).toBeFocused();
  expectNoApplicationWrites(writes);
});

test("logo-only nav and mobile month reflow at required widths and 200 percent", async ({ page }) => {
  await mockCompanion(page);
  for (const width of [320, 390, 768, 1024, 1440, 720]) {
    await page.setViewportSize({ width, height: width === 720 ? 450 : 900 });
    await page.goto(`/dashboard/calendar?date=${date}`);
    const brand = page.getByRole("link", { name: "Race Predictor Home", exact: true });
    await expect(brand).toHaveText("");
    await expect(brand.locator("img")).toBeVisible();
    await expect(page.locator(".calendar-month-region")).toBeVisible();
    const cell = dayCell(page, date);
    await expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width < 1200) {
      await expect(cell.locator(".calendar-day-entries--compact")).toBeVisible();
      await expect(cell.locator(".calendar-day-entries--full")).toBeHidden();
      await cell.click();
      const dialog = page.getByRole("dialog", { name: "Day details — 03 Oct 2026" });
      await expect(dialog.locator(".calendar-activity-record")).toHaveCount(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: path.join(e2eRoot, `month-day-dialog-${width}.png`) });
      await page.keyboard.press("Escape");
      await expect(cell).toBeFocused();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(e2eRoot, `month-calendar-${width}.png`), fullPage: true });
  }
});

test("Home preserves supported narrative, separate progress gaps and safe short feedback", async ({ page }) => {
  const writes = recordApplicationWrites(page);
  await mockCompanion(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.locator(".home-group")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Approved autumn goal" })).toBeVisible();
  await expect(page.getByText("Build confidence through consistent training.", { exact: false })).toBeVisible();
  await expect(page.getByText("Continue with a gradual build.", { exact: false })).toBeVisible();
  await expect(page.getByText("Plan adherence", { exact: true })).toBeVisible();
  await expect(page.getByText("Performance", { exact: true })).toBeVisible();
  await expect(page.locator(".home-milestone")).toContainText("Tomorrow");
  await expect(page.locator(".home-activity")).toContainText("Recorded run 2");
  await expect(page.locator(".home-activity")).toContainText("Heart-rate data was unavailable.");
  await expect(page.locator(".home-activity")).not.toContainText(/Plan version|Processing|Checking review/);
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Race Predictor Home", exact: true })).toHaveText("");
  await page.screenshot({ path: path.join(e2eRoot, "companion-home-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAxeClean(page, "mobile companion Home");
  await page.screenshot({ path: path.join(e2eRoot, "companion-home-mobile.png"), fullPage: true });
  for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1024, height: 900 }, { width: 1440, height: 900 }, { width: 1440, height: 1200 }]) {
    await page.setViewportSize(viewport);
    const layout = await assertHomeLayout(page, test.info(), "companion-home");
    if (viewport.width === 390) expect(layout.goalAndTodayFit, "The normal short Goal and Today cards must fit above phone navigation").toBe(true);
  }
  await mockCompanion(page, { longReview: true });
  await page.reload();
  await expect(page.locator(".home-activity")).toContainText("A short takeaway is unavailable");
  await expect(page.getByRole("link", { name: /View full session review/ })).toBeVisible();
  expectNoApplicationWrites(writes);
});
