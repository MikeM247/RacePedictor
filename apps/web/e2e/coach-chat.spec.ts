import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { CoachConversationMessage, CoachConversationState, CoachRecordReference, CoachTopic } from "../../../packages/core/src/contracts/coach-chat.ts";

const now = "2026-10-22T05:00:00.000Z";
const activityRef = { type: "activity", id: "activity_latest_01" } as const;
const sessionRef = { type: "session", id: "session_next_01" } as const;

function context(topic: "reflect" | "prepare" | "general" = "reflect") {
  return {
    localDate: "2026-10-22", timezone: "Africa/Johannesburg", fingerprint: "a".repeat(64), suggestedTopic: "reflect", selectedTopic: topic,
    opening: { kind: topic === "reflect" ? "reflect" : "prepare", text: topic === "reflect" ? "How did your 8 km run feel?" : "Your next approved session is Easy run on 2026-10-23." },
    sources: { goal: "available", plan: "available", activity: "available", schedule: "available", wellbeing: "missing" },
    goal: { title: "Build toward Comrades", target: "Finish comfortably" }, plan: { id: "plan_current_01", version: 3, approvalHash: "b".repeat(64) },
    todaySchedule: { kind: "unscheduled", message: "No session is scheduled today." },
    latestActivity: { id: activityRef.id, title: "Morning 8 km run", sport: "run", occurredAt: now, localDate: "2026-10-22", distanceM: 8000, elapsedTimeS: 2880, avgPaceSecPerKm: 360, elevationGainM: 50, revision: 2, review: null },
    nextSession: { id: sessionRef.id, planId: "plan_current_01", date: "2026-10-23", title: "Easy run", kind: "run", status: "upcoming", revision: 1, purpose: "Build aerobic consistency", prescription: "Run conversationally for 40 minutes.", durationMinutes: 40, distanceMeters: null, startTime: "06:00", cautions: ["Stop if pain changes your gait."], warnings: [] },
    recentActivities: [], wellbeing: null,
    actions: [
      { label: "View race plan", href: "/dashboard/plan", kind: "plan" },
      { label: "View last activity", href: `/dashboard/activities?activityId=${activityRef.id}&returnTo=%2Fdashboard%2Fcoach`, kind: "activity" },
      { label: "View next session", href: "/dashboard/calendar?date=2026-10-23&session=session_next_01", kind: "session" },
    ], selectedRecord: topic === "reflect" ? activityRef : topic === "prepare" ? sessionRef : null,
    ambiguousSessionIds: [], ambiguousSessions: [], canSend: true,
  };
}

function message(id: string, sequence: number, role: "user" | "assistant", text: string, turnState: "processing" | "completed" | "failed" | "abandoned" | "expired", selectedRecord: CoachRecordReference | null = activityRef, topic: CoachTopic | null = "reflect"): CoachConversationMessage {
  return { id, sequence, generation: 1, role, text, createdAt: now, topic, selectedRecord, turnState, eventType: null, activityReflectionRevision: null, eventPayload: null };
}

function conversation(messages: CoachConversationMessage[] = [], currentTurn: CoachConversationState["currentTurn"] = null): CoachConversationState {
  return { generation: 1, sequence: messages.length ? Math.max(...messages.map((item) => item.sequence)) : 0, messages, hasOlder: false, oldestSequence: messages[0]?.sequence ?? null, currentTurn };
}

async function mockSession(page: Page) {
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ json: { data: { authenticated: true, actor: { userId: "owner_test", activeAthleteId: "athlete_test", credentialKind: "session" }, reason: null } } }));
}

async function confirmAndStartNewChat(page: Page) {
  await page.getByRole("button", { name: "Clear chat", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Start a new discussion?" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText(/saved to Previous chats/i)).toBeVisible();
  await confirmation.getByRole("button", { name: "Save and start new" }).click();
}

test("complete Coach panel fits desktop viewports and bounds long drafts", async ({ page }) => {
  await mockSession(page);
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("reflect") } }));
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: conversation(Array.from({ length: 40 }, (_, index) => message(`fit_${index}`, index + 1, index % 2 ? "assistant" : "user", "A long observation. ".repeat(30), "completed"))) } }));
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1896, height: 910 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard/coach");
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Message ORBIT" }).fill("Draft line\n".repeat(150));
    await expect.poll(() => page.locator(".coach-chat-panel").evaluate((node) => node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(viewport.height);
    for (const selector of [".coach-composer textarea", ".coach-send-button", ".coach-action-row", ".coach-chat-boundary"]) {
      const rect = await page.locator(selector).boundingBox();
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.locator(".coach-transcript").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  }
});

test("desktop and mobile chat screens render without horizontal overflow", async ({ page }, testInfo) => {
  await mockSession(page);
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("reflect") } }));
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: conversation() } }));
  const captureDirectory = process.env.RACEPREDICTOR_UI_CAPTURE_DIR ?? testInfo.outputDir;
  mkdirSync(captureDirectory, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/coach");
  await expect(page.getByRole("main", { name: "Coach chat" })).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(captureDirectory, "orbit-chat-desktop.png"), animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".dashboard-mobile-header")).toBeVisible();
  await expect(page.locator(".coach-mobile-context-launcher")).toBeVisible();
  await expect.poll(() => page.locator(".coach-mobile-avatar img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(captureDirectory, "orbit-chat-mobile.png"), animations: "disabled" });

  for (const viewport of [{ width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const bounds = await page.evaluate(() => {
      const panel = document.querySelector(".coach-chat-panel")!.getBoundingClientRect();
      const send = document.querySelector(".coach-send-button")!.getBoundingClientRect();
      return { width: document.documentElement.scrollWidth, viewport: innerWidth, panelTop: panel.top, panelBottom: panel.bottom, sendBottom: send.bottom };
    });
    expect(bounds.width).toBeLessThanOrEqual(bounds.viewport);
    expect(bounds.panelTop).toBeGreaterThanOrEqual(0);
    expect(bounds.panelBottom).toBeLessThanOrEqual(viewport.height);
    expect(bounds.sendBottom).toBeLessThanOrEqual(viewport.height);
  }
});
test("mobile Coach keeps the chat edge to edge and exposes navigation, context, and conversation actions", async ({ page }) => {
  await mockSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/coaching/chat/context**", (route) => {
    const topic = new URL(route.request().url()).searchParams.get("topic");
    return route.fulfill({ json: { data: context(topic === "prepare" || topic === "general" ? topic : "reflect") } });
  });
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: conversation() } }));
  await page.route("**/api/v1/coaching/chat/history**", (route) => route.fulfill({ json: { data: { items: [], nextBefore: null } } }));
  await page.route("**/api/v1/wellbeing-check-ins?**", (route) => route.fulfill({ json: { data: { items: [] } } }));
  await page.goto("/dashboard/coach");

  await expect(page.getByText(/AI coach · Ready/)).toBeVisible();
  await expect(page.locator(".coach-v2-goal-strip")).toHaveCount(0);
  await expect(page.locator(".coach-v2-toolbar")).toHaveCount(0);
  await expect(page.locator(".dashboard-nav-primary")).toBeHidden();
  await expect(page.locator(".coach-mobile-context-launcher")).toContainText("Morning 8 km run");
  await expect(page.locator(".coach-action-link--plan")).toBeHidden();
  await expect(page.locator(".coach-action-link--activity")).toBeVisible();
  await expect(page.locator(".coach-action-link--session")).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message ORBIT" });
  await composer.fill("Keep this while I change the context.");
  await page.locator(".coach-mobile-context-launcher").click();
  const contextDialog = page.getByRole("dialog", { name: "Choose a topic" });
  await expect(contextDialog.getByRole("button", { name: "Prepare for next training" })).toHaveAttribute("aria-pressed", "false");
  await contextDialog.getByRole("button", { name: "Prepare for next training" }).click();
  await expect(contextDialog).toBeHidden();
  await expect(composer).toHaveValue("Keep this while I change the context.");
  await expect(page.locator(".coach-mobile-context-launcher")).toContainText("Easy run");

  const actionsTrigger = page.getByRole("button", { name: "Conversation actions" });
  await actionsTrigger.click();
  const actionsDialog = page.getByRole("dialog", { name: "Conversation actions" });
  await expect(actionsDialog.getByRole("button", { name: /Previous chats/ })).toBeVisible();
  await expect(actionsDialog.getByRole("button", { name: /Clear chat/ })).toBeVisible();
  await expect(actionsDialog.getByRole("button", { name: /Daily check-in/ })).toBeVisible();
  await actionsDialog.getByRole("button", { name: /Daily check-in/ }).click();
  const checkInDialog = page.getByRole("dialog", { name: "Daily check-in" });
  await checkInDialog.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(checkInDialog.getByRole("combobox", { name: "How do you feel overall?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(actionsTrigger).toBeFocused();

  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("dialog", { name: "Navigation" });
  await expect(navigation.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Calendar", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Readiness", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();

  const fit = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    panelBottom: document.querySelector(".coach-chat-panel")!.getBoundingClientRect().bottom,
    inputFontSize: getComputedStyle(document.querySelector(".coach-composer textarea")!).fontSize,
    sendHeight: document.querySelector(".coach-send-button")!.getBoundingClientRect().height,
  }));
  expect(fit.pageWidth).toBeLessThanOrEqual(fit.viewportWidth);
  expect(fit.panelBottom).toBeLessThanOrEqual(844);
  expect(fit.inputFontSize).toBe("16px");
  expect(fit.sendHeight).toBeGreaterThanOrEqual(44);

  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(composer).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
});
test("Clear chat archives a pending discussion, keeps the draft and opens read-only history", async ({ page }) => {
  await mockSession(page);
  const original = message("saved_question", 1, "user", "How should I approach next week?", "processing");
  let state = conversation([original], { id: "turn_pending", state: "processing", attempt: 1, safeErrorCode: null, messageSaved: true, retryable: false });
  let archived = false;
  const summary = { id: "archive_saved", generation: 1, title: original.text, startedAt: now, archivedAt: now, finalSequence: 1 };
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context(new URL(route.request().url()).searchParams.get("topic") === "general" ? "general" : "reflect") } }));
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: state } }));
  await page.route("**/api/v1/coaching/chat/conversation/archive", async (route) => {
    expect(route.request().postDataJSON().expectedSequence).toBe(1);
    archived = true; state = { ...conversation(), generation: 2 };
    await route.fulfill({ json: { data: { archive: summary, conversation: state } } });
  });
  await page.route("**/api/v1/coaching/chat/history", (route) => route.fulfill({ json: { data: { items: archived ? [summary] : [], nextBefore: null } } }));
  await page.route("**/api/v1/coaching/chat/history/archive_saved", (route) => route.fulfill({ json: { data: { archive: summary, messages: [{ ...original, turnState: "abandoned" }], hasOlder: false, oldestSequence: 1 } } }));
  await page.goto("/dashboard/coach");
  const composer = page.getByRole("textbox", { name: "Message ORBIT" });
  await composer.fill("Keep this unsent question.");
  await confirmAndStartNewChat(page);
  await expect(page.getByText("Chat saved. New discussion started.")).toBeVisible();
  await expect(composer).toHaveValue("Keep this unsent question.");
  await expect(composer).toBeFocused();
  await expect(page.getByRole("button", { name: "Ask ORBIT", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("ORBIT is thinking…")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Conversation messages" }).getByText(original.text)).toHaveCount(0);
  await page.getByRole("button", { name: "Previous chats", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Previous chats" });
  await dialog.getByRole("button", { name: new RegExp(original.text.replace("?", "\\?")) }).click();
  await expect(dialog.getByRole("list", { name: "Saved conversation messages" }).getByText(original.text)).toBeVisible();
  await expect(dialog.getByText(/Read only/)).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close previous chats" }).click();
  await expect(page.getByRole("button", { name: "Previous chats", exact: true })).toBeFocused();
  await expect(composer).toHaveValue("Keep this unsent question.");
  await page.reload();
  await expect(composer).toHaveValue("Keep this unsent question.");
});

test("failed archive retains transcript and draft and retries the same request identity", async ({ page }) => {
  await mockSession(page);
  let attempts = 0;
  let requestId = "";
  const state = conversation([message("save_failure", 1, "user", "A discussion to retain", "completed")]);
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("general") } }));
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: state } }));
  await page.route("**/api/v1/coaching/chat/conversation/archive", async (route) => {
    const input = route.request().postDataJSON();
    if (!requestId) requestId = input.requestId;
    expect(input.requestId).toBe(requestId); attempts++;
    await route.fulfill({ status: 503, json: { error: { message: "Synthetic database outage" } } });
  });
  await page.goto("/dashboard/coach");
  await page.getByRole("textbox", { name: "Message ORBIT" }).fill("Do not lose this draft");
  await confirmAndStartNewChat(page);
  await expect(page.getByRole("main", { name: "Coach" }).getByRole("alert")).toContainText("Your messages and draft are kept here");
  await expect(page.getByText("A discussion to retain", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message ORBIT" })).toHaveValue("Do not lose this draft");
  await page.getByRole("button", { name: "Retry saving" }).click();
  await expect.poll(() => attempts).toBe(2);
});

test("archiving synchronizes tabs without discarding either draft", async ({ page, context: browserContext }) => {
  let state = conversation([message("shared_message", 1, "user", "A shared discussion", "completed")]);
  await browserContext.route("**/api/v1/auth/session", (route) => route.fulfill({ json: { data: { authenticated: true, actor: { activeAthleteId: "athlete_test", credentialKind: "session" } } } }));
  await browserContext.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("general") } }));
  await browserContext.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: state } }));
  await browserContext.route("**/api/v1/coaching/chat/conversation/archive", (route) => {
    state = { ...conversation(), generation: 2 };
    return route.fulfill({ json: { data: { archive: { id: "shared_archive", generation: 1, title: "A shared discussion", startedAt: now, archivedAt: now, finalSequence: 1 }, conversation: state } } });
  });
  await page.goto("/dashboard/coach");
  const second = await browserContext.newPage();
  await second.goto("/dashboard/coach");
  await page.getByRole("textbox", { name: "Message ORBIT" }).fill("First tab draft");
  await second.getByRole("textbox", { name: "Message ORBIT" }).fill("Second tab draft");
  await confirmAndStartNewChat(page);
  await expect(page.getByText("Chat saved. New discussion started.")).toBeVisible();
  await expect(second.getByRole("list", { name: "Conversation messages" }).getByText("A shared discussion", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message ORBIT" })).toHaveValue("First tab draft");
  await expect(second.getByRole("textbox", { name: "Message ORBIT" })).toHaveValue("Second tab draft");
  await second.close();
});

test("a late retry response cannot replace the new discussion or its draft", async ({ page }) => {
  await mockSession(page);
  let state = conversation([message("late_question", 1, "user", "A saved failed question", "failed")], { id: "late_turn", state: "failed", attempt: 1, safeErrorCode: "PROVIDER_TIMEOUT", messageSaved: true, retryable: true });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let retryStarted = false;
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("general") } }));
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: state } }));
  await page.route("**/api/v1/coaching/chat/turns/late_turn/retry", async (route) => { retryStarted = true; await held; await route.fulfill({ json: { data: { failure: { code: "STALE_REPLY", message: "This obsolete failure must not appear" } } } }); });
  await page.route("**/api/v1/coaching/chat/conversation/archive", (route) => {
    state = { ...conversation(), generation: 2 };
    return route.fulfill({ json: { data: { archive: { id: "late_archive", generation: 1, title: "A saved failed question", startedAt: now, archivedAt: now, finalSequence: 1 }, conversation: state } } });
  });
  await page.goto("/dashboard/coach");
  await page.getByRole("button", { name: "Retry reply" }).click();
  await expect.poll(() => retryStarted).toBe(true);
  await confirmAndStartNewChat(page);
  await expect(page.getByText("Chat saved. New discussion started.")).toBeVisible();
  await page.getByRole("textbox", { name: "Message ORBIT" }).fill("My new draft");
  const completed = page.waitForResponse("**/api/v1/coaching/chat/turns/late_turn/retry");
  release(); await completed;
  await expect(page.getByText("This obsolete failure must not appear")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message ORBIT" })).toHaveValue("My new draft");
  await expect(page.getByRole("list", { name: "Conversation messages" }).getByText("A saved failed question")).toHaveCount(0);
});

test("Previous chats loads earlier saved messages and retries a failed history read", async ({ page }) => {
  await mockSession(page);
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("general") } }));
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: conversation() } }));
  let listAttempts = 0;
  const archive = { id: "paged_archive", generation: 1, title: "A long saved discussion", startedAt: now, archivedAt: now, finalSequence: 60 };
  await page.route("**/api/v1/coaching/chat/history", (route) => ++listAttempts === 1 ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { data: { items: [archive], nextBefore: null } } }));
  await page.route("**/api/v1/coaching/chat/history/paged_archive**", (route) => {
    const older = new URL(route.request().url()).searchParams.has("before");
    const messages = Array.from({ length: older ? 20 : 40 }, (_, index) => { const sequence = (older ? 1 : 21) + index; return message(`history_${sequence}`, sequence, "user", `Saved entry ${sequence}`, "completed"); });
    return route.fulfill({ json: { data: { archive, messages, hasOlder: !older, oldestSequence: older ? 1 : 21 } } });
  });
  await page.goto("/dashboard/coach");
  await page.getByRole("button", { name: "Previous chats", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Previous chats" });
  await expect(dialog.getByRole("alert")).toContainText("Saved chats could not be loaded");
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await dialog.getByRole("button", { name: /A long saved discussion/ }).click();
  await expect(dialog.getByRole("list", { name: "Saved conversation messages" }).getByRole("listitem")).toHaveCount(40);
  await dialog.getByRole("button", { name: "Load earlier messages" }).click();
  await expect(dialog.getByRole("list", { name: "Saved conversation messages" }).getByRole("listitem")).toHaveCount(60);
  await expect(dialog.getByText("Saved entry 1", { exact: true })).toBeVisible();
});

test("Settings explicitly confirms permanent deletion and clears only the current athlete browser state", async ({ page }) => {
  await mockSession(page);
  let deleted = false;
  await page.route("**/api/v1/coaching/chat/conversation", (route) => {
    if (route.request().method() === "DELETE") { deleted = true; return route.fulfill({ json: { data: { generation: 3, sequence: 0 } } }); }
    return route.fulfill({ json: { data: { ...conversation(), generation: 2 } } });
  });
  await page.goto("/dashboard/settings?section=coach");
  await expect(page.getByRole("button", { name: "Permanently delete all coaching history", exact: true })).toBeVisible();
  await page.evaluate(() => { sessionStorage.setItem("racepredictor.coach.v2.athlete_test.draft", "Delete my draft"); sessionStorage.setItem("racepredictor.coach.v2.other_athlete.draft", "Keep another athlete's state"); });
  await page.getByRole("button", { name: "Permanently delete all coaching history", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Permanently delete all coaching history?" });
  await expect(dialog).toContainText("all previous chats");
  await dialog.getByRole("button", { name: "Delete all history", exact: true }).click();
  await expect.poll(() => deleted).toBe(true);
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("racepredictor.coach.v2.athlete_test.draft"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("racepredictor.coach.v2.other_athlete.draft"))).toBe("Keep another athlete's state");
});

test("online Coach reflects on a real activity, completes a reply, restores a tab draft and exposes exact record actions", async ({ page }) => {
  let state = conversation();
  await mockSession(page);
  await page.route("**/api/v1/coaching/chat/context**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const selectedTopic = params.get("topic") === "prepare" ? "prepare" : params.get("topic") === "general" ? "general" : "reflect";
    await route.fulfill({ json: { data: context(selectedTopic) } });
  });
  await page.route("**/api/v1/coaching/chat/conversation**", (route) => route.fulfill({ json: { data: state } }));
  await page.route("**/api/v1/coaching/chat/turns", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.text).toBe("The last hill felt harder than expected.");
    const user = message("coach_user_1", 1, "user", request.text, "completed");
    const assistant = message("coach_assistant_1", 2, "assistant", "That makes sense. Did the effort rise gradually, or did something change on the hill?", "completed", null);
    state = conversation([user, assistant], { id: "coach_turn_1", state: "completed", attempt: 1, safeErrorCode: null, messageSaved: true, retryable: false });
    await route.fulfill({ json: { data: { turn: { id: "coach_turn_1", state: "completed", attempt: 1, messageSaved: true, retryable: false }, userMessage: user, assistantMessage: assistant, failure: null } } });
  });

  await page.goto("/dashboard/coach");
  await expect(page.getByRole("main", { name: "Coach chat" })).toBeVisible();
  await expect(page.getByText("How did your 8 km run feel?")).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include(".coach-v2-layout").analyze();
  expect(accessibility.violations.map(({ id, impact }) => `${id}:${impact}`)).toEqual([]);
  await expect(page.locator(".coach-context-row > strong").filter({ hasText: "Morning 8 km run" })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message ORBIT" });
  await composer.fill("The last hill felt harder than expected.");
  await composer.press("Enter");
  await expect(page.getByText("Did the effort rise gradually, or did something change on the hill?")).toBeVisible();
  const activityLink = page.getByRole("link", { name: /View last activity/ });
  await expect(activityLink).toHaveAttribute("href", /activityId=activity_latest_01/u);
  await activityLink.click();
  await expect(page).toHaveURL(/activityId=activity_latest_01/u);
  await expect(page).toHaveURL(/recovery=/u);
  await page.goBack();
  await expect(page.getByRole("main", { name: "Coach chat" })).toBeVisible();

  await composer.fill("Keep this draft while I check the plan.");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("racepredictor.coach.v2.athlete_test.draft"))).toBe("Keep this draft while I check the plan.");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Message ORBIT" })).toHaveValue("Keep this draft while I check the plan.");
  await page.setViewportSize({ width: 320, height: 760 });
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  // 640 CSS pixels approximates a 200% zoom viewport on a 1280px desktop screen.
  await page.setViewportSize({ width: 640, height: 800 });
  const zoomWidths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(zoomWidths.document).toBeLessThanOrEqual(zoomWidths.viewport);
});

test("post-run review saves explicit RPE before offering a feedback-aware Coach response", async ({ page }) => {
  await mockSession(page);
  let savedReflection: any = null;
  let chat = conversation();
  const savedState = { activityId: activityRef.id, completedAt: now, completedReflectionRevision: 1, suppressedAt: now, reopenedAt: null, revision: 1 };
  const makeReflection = () => savedReflection ? {
    revision: savedReflection.revision, questionnaireVersion: "activity-reflection.v2", rpeAnswer: "rated", overallRpe: 7,
    expectation: null, legacyPain: null, discomfort: "none", symptoms: null, energy: null, fuel: null, fuelNote: null,
    note: null, raceNotes: null, sections: [],
  } : null;
  await page.route("**/api/v1/coaching/run-review/offers", (route) => route.fulfill({ json: { data: { status: "reserved", offer: { id: "offer_post_run", activityId: activityRef.id, token: "token_post_run", tabId: "tab_post_run" } } } }));
  await page.route("**/api/v1/coaching/run-review/offers/offer_post_run/present", (route) => route.fulfill({ json: { data: { canPresent: true, activity: { id: activityRef.id, title: "Morning 8 km run", sport: "run", occurredAt: now, distanceM: 8000, elapsedTimeS: 2880, avgPaceSecPerKm: 360, elevationGainM: 50, revision: 2 } } } }));
  await page.route("**/api/v1/coaching/run-review/offers/offer_post_run/outcome", (route) => route.fulfill({ json: { data: { id: "offer_post_run", outcome: "shown" } } }));
  await page.route("**/api/v1/coaching/chat/context**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const selected = params.get("recordId") === activityRef.id;
    const value = context("reflect") as any;
    value.selectedRecord = selected ? activityRef : null;
    value.selectedActivity = selected ? { ...value.latestActivity, reflection: makeReflection() } : null;
    await route.fulfill({ json: { data: value } });
  });
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: chat } }));
  await page.route(`**/api/v1/activities/${activityRef.id}/reflection/run-review`, (route) => route.fulfill({ json: { data: { state: savedReflection ? savedState : null, reflection: savedReflection, activityRevision: 2 } } }));
  await page.route(`**/api/v1/activities/${activityRef.id}/reflection`, async (route) => {
    expect(route.request().method()).toBe("PUT");
    const request = route.request().postDataJSON();
    expect(request.answers.overallRpe).toBe(7);
    expect(request.answers.postRun.rpeAnswer).toBe("rated");
    expect(request.answers.postRun.discomfort).toBe("none");
    savedReflection = { id: "reflection_post_run", athleteId: "athlete_test", activityId: activityRef.id, revision: 1, activityRevision: 2, type: null,
      answers: request.answers, sections: [], questionnaireVersion: "activity-reflection.v2", createdAt: now, updatedAt: now };
    await route.fulfill({ json: { data: { reflection: savedReflection, state: savedState, activityRevision: 2, replayed: false } } });
  });
  await page.route("**/api/v1/coaching/chat/run-review-followups", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.activityId).toBe(activityRef.id);
    expect(request.reflectionRevision).toBe(1);
    const receipt: NonNullable<CoachConversationMessage["eventPayload"]> = { activityId: activityRef.id, activityTitle: "Morning 8 km run", occurredAt: now, reflectionRevision: 1, rpeAnswer: "rated", overallRpe: 7,
      expectation: null, discomfort: "none", symptoms: null, energy: null, fuel: null, fuelNote: null, note: null, raceNotes: null };
    const user = { ...message("feedback_event", 1, "user", "Run feedback saved", "completed"), eventType: "activity_reflection" as const, activityReflectionRevision: 1, eventPayload: receipt };
    const assistant = message("feedback_reply", 2, "assistant", "You reported a hard RPE 7 effort with no discomfort. I’ll factor that into future guidance.", "completed", activityRef, "reflect");
    chat = conversation([user, assistant], { id: "feedback_turn", state: "completed", attempt: 1, safeErrorCode: null, messageSaved: true, retryable: false });
    await route.fulfill({ json: { data: { turn: { id: "feedback_turn", state: "completed", attempt: 1, safeErrorCode: null, messageSaved: true, retryable: false }, userMessage: user, assistantMessage: assistant, failure: null } } });
  });

  await page.goto("/dashboard/coach");
  await expect(page.getByRole("heading", { name: "Morning 8 km run" })).toBeVisible();
  await page.getByRole("button", { name: "Tell ORBIT how it felt" }).click();
  await page.locator(`input[name="run-rpe-${activityRef.id}"][value="7"]`).check();
  await page.locator(`#run-discomfort-${activityRef.id}`).selectOption("none");
  await page.getByRole("button", { name: "Save feedback" }).click();
  await expect(page.getByText("RPE: 7/10 · Discomfort: none")).toBeVisible();
  await expect(page.getByText("Saved run feedback", { exact: true })).toBeVisible();
  await expect(page.getByText("Structured from your saved review; this is not a message you typed.")).toBeVisible();
  await expect(page.getByText(/factor that into future guidance/u)).toBeVisible();
});

test("Home and Coach are separate destinations and Orbit opens chat without sending a message", async ({ page }) => {
  const sentTurns: string[] = [];
  await mockSession(page);
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("general") } }));
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: conversation() } }));
  await page.route("**/api/v1/coaching/chat/turns", async (route) => { sentTurns.push(route.request().url()); await route.fulfill({ status: 500 }); });
  await page.route("**/api/v1/coaching/milestones", (route) => route.fulfill({ json: { data: { revision: 0, sourceVersion: "coach-home-fixture", today: "2026-10-22", history: [], availability: { goal: true, history: true }, entries: [], removed: [], context: {
    state: "ready", plan: { id: "plan_home", version: 1, revision: 1, startsOn: "2026-09-01", endsOn: "2027-06-13", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) },
    goal: { id: "goal_home", athleteId: "athlete_test", revision: 1, title: "Build toward Comrades", why: "Run steadily.", target: { kind: "performance", distanceMeters: 89_000, targetDate: "2027-06-13", eventName: "Build toward Comrades" } },
    milestones: [], projection: { contextHash: "b".repeat(64), publishedAt: now },
  } } } }));
  await page.route("**/api/v1/coaching/race-history", (route) => route.fulfill({ json: { data: { items: [], publishedAt: null } } }));
  await page.route("**/api/v1/dashboard/appearance", (route) => route.fulfill({ json: { data: { heroImageUrl: "/road-to-comrades-v2.webp" } } }));
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Coach", exact: true })).not.toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Talk to Orbit" }).click();
  await expect(page).toHaveURL(/\/dashboard\/coach$/u);
  await expect(page.getByRole("main", { name: "Coach chat" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Coach", exact: true })).toHaveAttribute("aria-current", "page");
  expect(sentTurns).toEqual([]);
  await page.reload();
  await expect(page.getByRole("main", { name: "Coach chat" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/?$/u);
  await expect(page.getByRole("link", { name: "Talk to Orbit" })).toBeVisible();
  await expect(page.locator(".coach-composer")).toHaveCount(0);
  expect(sentTurns).toEqual([]);
});

test("Coach topic, selected record, unsent draft and transcript position survive Coach to Home to Coach", async ({ page }) => {
  await mockSession(page);
  await page.route("**/api/v1/coaching/chat/context**", async (route) => {
    const topic = new URL(route.request().url()).searchParams.get("topic");
    await route.fulfill({ json: { data: context(topic === "prepare" ? "prepare" : topic === "reflect" ? "reflect" : "general") } });
  });
  const messages = Array.from({ length: 40 }, (_, index) => message(`continuity_${index}`, index + 1, index % 2 ? "assistant" : "user", `Conversation entry ${index + 1}. ${"A detailed training observation. ".repeat(12)}`, "completed", null, "general"));
  await page.route("**/api/v1/coaching/chat/conversation", (route) => route.fulfill({ json: { data: conversation(messages) } }));
  await page.route("**/api/v1/coaching/milestones", (route) => route.fulfill({ json: { data: { revision: 0, sourceVersion: "coach-home-fixture", today: "2026-10-22", history: [], availability: { goal: true, history: true }, entries: [], removed: [], context: {
    state: "ready", plan: { id: "plan_home", version: 1, revision: 1, startsOn: "2026-09-01", endsOn: "2027-06-13", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) },
    goal: { id: "goal_home", athleteId: "athlete_test", revision: 1, title: "Build toward Comrades", why: "Run steadily.", target: { kind: "performance", distanceMeters: 89_000, targetDate: "2027-06-13", eventName: "Build toward Comrades" } },
    milestones: [], projection: { contextHash: "b".repeat(64), publishedAt: now },
  } } } }));
  await page.route("**/api/v1/coaching/race-history", (route) => route.fulfill({ json: { data: { items: [], publishedAt: null } } }));
  await page.route("**/api/v1/dashboard/appearance", (route) => route.fulfill({ json: { data: { heroImageUrl: "/road-to-comrades-v2.webp" } } }));

  await page.goto("/dashboard/coach");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  const prepare = page.getByRole("button", { name: "Prepare for next training" });
  await prepare.click();
  await expect(prepare).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".coach-context-row > strong").filter({ hasText: "Easy run" })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message ORBIT" });
  await composer.fill("Keep this question while I revisit my goal.");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("racepredictor.coach.v2.athlete_test.draft"))).toBe("Keep this question while I revisit my goal.");
  const transcript = page.getByRole("list", { name: "Conversation messages" });
  await transcript.evaluate((node) => { node.scrollTop = 140; node.dispatchEvent(new Event("scroll")); });
  await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("racepredictor.coach.v2.athlete_test.scrollTop")))).toBeGreaterThan(100);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("racepredictor.coach.v2.athlete_test.topic"))).toBe("prepare");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("racepredictor.coach.v2.athlete_test.record"))).toContain('"session_next_01"');

  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/u);
  await expect(page.getByRole("heading", { name: "Build toward Comrades", level: 2 })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Coach", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/coach$/u);
  await expect(page.getByRole("button", { name: "Prepare for next training" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".coach-context-row > strong").filter({ hasText: "Easy run" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message ORBIT" })).toHaveValue("Keep this question while I revisit my goal.");
  await expect.poll(() => page.getByRole("list", { name: "Conversation messages" }).evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
});

test("failed reply can be retried without duplicating its saved athlete message", async ({ page }) => {
  const saved = message("coach_user_failed", 1, "user", "Can I shorten tomorrow's run?", "failed");
  let state = conversation([saved], { id: "coach_turn_failed", state: "failed", attempt: 1, safeErrorCode: "PROVIDER_TIMEOUT", messageSaved: true, retryable: true });
  await mockSession(page);
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("prepare") } }));
  await page.route("**/api/v1/coaching/chat/conversation**", (route) => route.fulfill({ json: { data: state } }));
  await page.route("**/api/v1/coaching/chat/turns/coach_turn_failed/retry", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.expectedAttempt).toBe(1);
    const assistant = message("coach_assistant_retried", 2, "assistant", "The current prescription is 40 minutes. If time is tight, keep the effort easy and use Calendar to review any change.", "completed", sessionRef, "prepare");
    state = conversation([{ ...saved, turnState: "completed" }, assistant], { id: "coach_turn_failed", state: "completed", attempt: 2, safeErrorCode: null, messageSaved: true, retryable: false });
    await route.fulfill({ json: { data: { turn: { id: "coach_turn_failed", state: "completed", attempt: 2, messageSaved: true, retryable: false }, userMessage: saved, assistantMessage: assistant, failure: null } } });
  });
  await page.goto("/dashboard/coach");
  await expect(page.getByRole("button", { name: "Retry reply" })).toBeVisible();
  await page.getByRole("button", { name: "Retry reply" }).click();
  await expect(page.getByText(/The current prescription is 40 minutes/u)).toBeVisible();
  await expect(page.getByText("Can I shorten tomorrow's run?")).toHaveCount(1);
});

test("long history preserves reading position, supports image fallback and a keyboard-sized mobile viewport", async ({ page }) => {
  await mockSession(page);
  await page.route("**/*orbit*", (route) => route.abort());
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("general") } }));
  const messages = Array.from({ length: 40 }, (_, i) => message(`long_${i}`, i + 1, i % 2 ? "assistant" : "user", `Synthetic transcript message ${i + 1}. ${"A detailed training observation. ".repeat(16)}`, "completed", null, "general"));
  let polls = 0;
  await page.route("**/api/v1/coaching/chat/conversation**", (route) => {
    polls += 1;
    const processing = polls === 1;
    return route.fulfill({ json: { data: { ...conversation(messages, { id: "long_turn", state: processing ? "processing" : "completed", attempt: 1, safeErrorCode: null, messageSaved: true, retryable: false }), hasOlder: true } } });
  });
  await page.goto("/dashboard/coach");
  const transcript = page.getByRole("list", { name: "Conversation messages" });
  await expect(transcript.locator(".coach-message")).toHaveCount(40);
  await transcript.evaluate((node) => { node.scrollTop = 120; });
  await expect.poll(() => polls).toBeGreaterThan(1);
  expect(await transcript.evaluate((node) => node.scrollTop)).toBeCloseTo(120, 0);
  await expect(page.locator(".coach-message-avatar").first()).toHaveText("O");
  await page.setViewportSize({ width: 390, height: 844 });
  const composer = page.getByRole("textbox", { name: "Message ORBIT" });
  await composer.fill("Synthetic mobile draft");
  await composer.focus();
  // A reduced layout viewport exercises keyboard occlusion/reflow, not a native OS keyboard.
  await page.setViewportSize({ width: 390, height: 420 });
  await page.getByRole("button", { name: "Send message" }).scrollIntoViewIfNeeded();
  await expect(composer).toBeInViewport();
  await expect(page.getByRole("button", { name: "Send message" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(composer).toHaveValue("Synthetic mobile draft");
});

test("Coach reflows at a 200 percent zoom-equivalent viewport", async ({ page }) => {
  await mockSession(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/v1/coaching/chat/context**", (route) => route.fulfill({ json: { data: context("general") } }));
  await page.route("**/api/v1/coaching/chat/conversation**", (route) => route.fulfill({ json: { data: conversation() } }));
  await page.goto("/dashboard/coach");
  await expect(page.getByRole("main", { name: "Coach chat" })).toBeVisible();
  await page.setViewportSize({ width: 640, height: 900 });
  await expect(page.locator(".dashboard-mobile-header")).toBeVisible();
  await expect(page.locator(".coach-mobile-context-launcher")).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.viewport).toBe(640);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  const composer = page.getByRole("textbox", { name: "Message ORBIT" });
  await composer.fill("Synthetic zoom draft");
  await page.getByRole("button", { name: "Send message" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Send message" })).toBeInViewport();
});
