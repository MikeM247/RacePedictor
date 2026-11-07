import { expect, test, type Page } from "@playwright/test";
import { fixtureCalendarSession, fixturePlan } from "./coaching-fixtures.ts";
import { coachContextSchema } from "../../../packages/core/src/contracts/coach-chat.ts";

const date = "2026-10-03";
const now = `${date}T06:00:00.000Z`;
const hash = "a".repeat(64);
const plan = fixturePlan();
const session = fixtureCalendarSession({ scheduledDate: date, effectiveDate: date, title: "Scroll regression session" });
const activity = { id: "scroll-activity", athleteId: "e2e_athlete", title: "Scroll regression run", sport: "run", localDate: date, occurredAt: now, distanceM: 5000, elapsedTimeS: 1800, avgPaceSecPerKm: 360, elevationGainM: 40, hrAvailable: false, cadenceAvailable: false };
const context = coachContextSchema.parse({
  localDate: date, timezone: "Africa/Johannesburg", fingerprint: hash, suggestedTopic: "general", selectedTopic: "general",
  opening: { kind: "general", text: "How can I help with your training?" },
  sources: { goal: "available", plan: "available", activity: "available", schedule: "available", wellbeing: "missing" },
  goal: { title: "Autumn goal", target: "Finish comfortably" }, plan: { id: plan.id, version: 1, approvalHash: hash },
  todaySchedule: { kind: "unscheduled", message: "No session is scheduled today." },
  latestActivity: { id: activity.id, title: activity.title, sport: activity.sport, occurredAt: now, localDate: date, distanceM: 5000, elapsedTimeS: 1800, avgPaceSecPerKm: 360, elevationGainM: 40, revision: 1, review: null }, nextSession: null,
  recentActivities: [], wellbeing: null, selectedRecord: null, ambiguousSessionIds: [], ambiguousSessions: [], canSend: true,
  actions: [{ label: "View last activity", href: "/dashboard/activities?activityId=scroll-activity", kind: "activity" }, { label: "View next session", href: `/dashboard/calendar?date=${date}&session=${session.id}`, kind: "session" }],
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver(() => document.querySelectorAll<HTMLElement>("nextjs-portal").forEach((node) => { node.style.display = "none"; }))
      .observe(document, { childList: true, subtree: true });
  });
  await page.clock.setFixedTime(new Date(now));
  // Every API request is synthetic, including simulated failed sends. Never reach a database.
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data: unknown = {};
    if (route.request().method() !== "GET") {
      return route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Synthetic reply failure. ".repeat(12) } } });
    }
    if (path === "/api/v1/auth/session") data = { authenticated: true, actor: { userId: "owner_test", activeAthleteId: "e2e_athlete", credentialKind: "session" }, reason: null };
    else if (path.endsWith("/chat/context")) data = context;
    else if (path.endsWith("/chat/conversation")) data = {
      generation: 1, sequence: 40, hasOlder: false, oldestSequence: 1, currentTurn: null,
      messages: Array.from({ length: 40 }, (_, index) => ({ id: `scroll-${index}`, sequence: index + 1, generation: 1, role: index % 2 ? "assistant" : "user", text: "A training observation with enough detail to scroll. ".repeat(20), createdAt: now, topic: "general", selectedRecord: null, turnState: "completed" })),
    };
    else if (path.endsWith("/chat/history")) data = { items: [], nextBefore: null };
    else if (path.endsWith("/voice/capabilities")) return route.fulfill({ status: 404, json: {} });
    else if (path === "/api/v1/coaching/calendar") data = { from: url.searchParams.get("from"), to: url.searchParams.get("to"), timezone: "Africa/Johannesburg", sessions: [session], historicalSessions: [], activities: [activity], activitiesReadStatus: "available", planReadStatus: "active", scheduleReadStatus: "effective" };
    else if (path.endsWith("/plans/active")) data = plan;
    else if (path.endsWith("/goal-context/active")) data = { context: null };
    else if (path.endsWith("/coaching/today")) data = { date, timezone: "Africa/Johannesburg", state: "upcoming", status: "upcoming", plan, session, stale: { isStale: false } };
    else if (path === "/api/v1/activities/scroll-activity") data = { activity: { ...activity, sourceType: "manual", endedAt: `${date}T06:30:00.000Z`, elevationLossM: 20, dedupeHash: hash, createdAt: now, splits: [], routeSignature: null } };
    else if (path.endsWith("/dashboard/overview")) return route.fulfill({ json: { fetchStatus: "empty", stale: { isStale: false } } });
    else if (path.endsWith("/dashboard/appearance")) data = { heroImageUrl: null };
    else if (path === "/api/v1/activities" || path.includes("wellbeing-check-ins") || path.endsWith("/race-history")) data = { items: [] };
    return route.fulfill({ json: { data } });
  });
});

async function expectUnlocked(page: Page) {
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
}

async function expectCalendarWheelScroll(page: Page) {
  await expect(page.locator(".calendar-week-row").first()).toBeVisible();
  await expectUnlocked(page);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(8, 350);
  // Try upwards first so the assertion also works when entry positioning is near the bottom.
  await page.mouse.wheel(0, before > 150 ? -180 : 180);
  await expect.poll(() => page.evaluate(() => scrollY)).not.toBe(before);
}

async function expectChatFits(page: Page, allowPanelScroll = false) {
  const panel = page.locator(".coach-chat-panel");
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  const usableBottom = await page.evaluate(() => {
    const nav = document.querySelector(".shared-mobile-nav")?.getBoundingClientRect();
    return nav?.height ? nav.top : (visualViewport?.height ?? innerHeight) + (visualViewport?.offsetTop ?? 0);
  });
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(usableBottom + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (allowPanelScroll) {
    // Use the composer padding so a long transcript or the textarea does not
    // consume the wheel event intended for the outer panel.
    const composer = (await page.locator(".coach-composer").boundingBox())!;
    const y = Math.max(bounds!.y + 3, composer.y + 3);
    await page.mouse.move(bounds!.x + 3, y < bounds!.y + bounds!.height - 3 ? y : bounds!.y + 3);
    await page.mouse.wheel(0, 2000);
  }
  const send = page.getByRole("button", { name: "Send message", exact: true });
  await expect.poll(async () => {
    const box = await send.boundingBox();
    return box ? box.y + box.height : Infinity;
  }).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
  const box = (await send.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(bounds!.y);
}

test("Chat fits desktop, tablet, phone, landscape and zoom-equivalent windows", async ({ page }) => {
  await page.goto("/dashboard/coach");
  await expect(page.getByRole("list", { name: "Conversation messages" }).locator("li")).toHaveCount(40);
  for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768], [768, 900], [640, 800], [390, 844], [320, 640], [844, 390], [390, 360]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("textbox", { name: "Message ORBIT" }).fill("Draft line\n".repeat(150));
    await expectChatFits(page, height < 540);
  }
});

test("the transcript responds to wheel input while the composer remains available", async ({ page }) => {
  await page.goto("/dashboard/coach");
  const transcript = page.getByRole("list", { name: "Conversation messages" });
  await expect(transcript.locator("li")).toHaveCount(40);
  await expectChatFits(page);
  const before = await transcript.evaluate((node) => node.scrollTop);
  await transcript.hover();
  await page.mouse.wheel(0, before > 100 ? -250 : 250);
  await expect.poll(() => transcript.evaluate((node) => node.scrollTop)).not.toBe(before);
  await expectChatFits(page);
});

test("short Chat with a long error can scroll to the composer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto("/dashboard/coach");
  await page.getByRole("textbox", { name: "Message ORBIT" }).fill("Please review my training");
  await expectChatFits(page, true);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("main", { name: "Coach chat" }).getByRole("alert")).toContainText("Synthetic reply failure");
  await expectChatFits(page, true);
});

test("visual viewport changes resize the outer Chat without competing panel heights", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/dashboard/coach");
  await expect(page.locator(".coach-chat-panel")).toBeVisible();
  // Emulates keyboard occlusion where the layout viewport itself does not shrink.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: 420 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect.poll(() => page.locator(".coach-v2-layout").evaluate((node) => node.getBoundingClientRect().height)).toBe(420);
  await expectChatFits(page, true);
  expect(await page.locator(".coach-chat-panel").evaluate((node) => (node as HTMLElement).style.height)).toBe("");
  await page.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, "height");
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect.poll(() => page.locator(".coach-v2-layout").evaluate((node) => node.getBoundingClientRect().height)).toBe(768);
});

test("Calendar unlocks after repeated day and session details, activity transitions and route unmount", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto(`/dashboard/calendar?date=${date}`);
  const day = page.locator(`#calendar-day-${date}`);
  for (let index = 0; index < 2; index += 1) {
    await day.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    const lockedY = await page.evaluate(() => scrollY);
    await page.mouse.move(5, 350);
    await page.mouse.wheel(0, 200);
    expect(await page.evaluate(() => scrollY)).toBe(lockedY);
    if (index === 0) await page.keyboard.press("Escape");
    else await page.getByRole("button", { name: "Close details", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(day).toBeFocused();
    await expectCalendarWheelScroll(page);
  }
  await day.click();
  await page.getByRole("dialog").getByRole("button", { name: `View activity: ${activity.title}` }).click();
  const activityDialog = page.getByRole("dialog", { name: activity.title });
  await expect(activityDialog).toBeVisible();
  await activityDialog.locator(".detail-back-button").click();
  await expect(page.getByRole("button", { name: "Close details", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expectCalendarWheelScroll(page);

  await page.goto(`/dashboard/calendar?date=${date}&session=${session.id}`);
  await expect(page.getByRole("button", { name: "Close details", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expectCalendarWheelScroll(page);

  await page.goto("/dashboard");
  const calendarLink = page.getByRole("link", { name: "Calendar", exact: true });
  if (!await calendarLink.isVisible()) {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  }
  await calendarLink.click();
  await expect(page).toHaveURL(/\/dashboard\/calendar/);
  await day.click();
  // Client history unmounts Calendar while its details still hold locks.
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectUnlocked(page);
});

test("Home to Chat to Calendar navigation retains sizing and releases native modal locks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Coach", exact: true }).click();
  await expect(page.getByRole("list", { name: "Conversation messages" }).locator("li")).toHaveCount(40);
  await expectChatFits(page);
  await page.getByRole("button", { name: "Previous chats", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Previous chats" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expectUnlocked(page);
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expectCalendarWheelScroll(page);
  await page.getByRole("link", { name: "Coach", exact: true }).click();
  await expectChatFits(page);
});

test("touch gestures scroll Chat and Calendar after closing details @touch", async ({ page, context }) => {
  await page.goto("/dashboard/coach");
  const transcript = page.getByRole("list", { name: "Conversation messages" });
  await expect(transcript.locator("li")).toHaveCount(40);
  const client = await context.newCDPSession(page);
  async function swipe(x: number, startY: number, endY: number) {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
    for (let step = 1; step <= 8; step += 1) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: startY + (endY - startY) * step / 8 }] });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  const before = await transcript.evaluate((node) => node.scrollTop);
  const bounds = (await transcript.boundingBox())!;
  await swipe(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.y + (before > 100 ? bounds.height * .8 : bounds.height * .2));
  await expect.poll(() => transcript.evaluate((node) => node.scrollTop)).not.toBe(before);
  await page.goto(`/dashboard/calendar?date=${date}`);
  await page.locator(`#calendar-day-${date}`).click();
  await page.getByRole("button", { name: "Close details", exact: true }).click();
  await expectUnlocked(page);
  const calendarY = await page.evaluate(() => scrollY);
  await swipe(8, 350, calendarY > 150 ? 530 : 170);
  await expect.poll(() => page.evaluate(() => scrollY)).not.toBe(calendarY);
});
