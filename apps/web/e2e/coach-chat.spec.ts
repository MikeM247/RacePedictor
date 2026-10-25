import { expect, test, type Page } from "@playwright/test";
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
      { label: "View last activity", href: `/dashboard/activities?activityId=${activityRef.id}&returnTo=%2Fdashboard`, kind: "activity" },
      { label: "View next session", href: "/dashboard/calendar?date=2026-10-23&session=session_next_01", kind: "session" },
    ], selectedRecord: topic === "reflect" ? activityRef : topic === "prepare" ? sessionRef : null,
    ambiguousSessionIds: [], ambiguousSessions: [], canSend: true,
  };
}

function message(id: string, sequence: number, role: "user" | "assistant", text: string, turnState: "processing" | "completed" | "failed" | "abandoned" | "expired", selectedRecord: CoachRecordReference | null = activityRef, topic: CoachTopic | null = "reflect"): CoachConversationMessage {
  return { id, sequence, generation: 1, role, text, createdAt: now, topic, selectedRecord, turnState };
}

function conversation(messages: CoachConversationMessage[] = [], currentTurn: CoachConversationState["currentTurn"] = null): CoachConversationState {
  return { generation: 1, sequence: messages.length ? Math.max(...messages.map((item) => item.sequence)) : 0, messages, hasOlder: false, oldestSequence: messages[0]?.sequence ?? null, currentTurn };
}

async function mockSession(page: Page) {
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ json: { data: { authenticated: true, actor: { userId: "owner_test", activeAthleteId: "athlete_test", credentialKind: "session" }, reason: null } } }));
}

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

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Coach", level: 1 })).toBeVisible();
  await expect(page.getByText("How did your 8 km run feel?")).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include(".coach-v2-layout").analyze();
  expect(accessibility.violations.map(({ id, impact }) => `${id}:${impact}`)).toEqual([]);
  await expect(page.getByText("Morning 8 km run", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Coach", level: 1 })).toBeVisible();

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
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Retry reply" })).toBeVisible();
  await page.getByRole("button", { name: "Retry reply" }).click();
  await expect(page.getByText(/The current prescription is 40 minutes/u)).toBeVisible();
  await expect(page.getByText("Can I shorten tomorrow's run?")).toHaveCount(1);
});
