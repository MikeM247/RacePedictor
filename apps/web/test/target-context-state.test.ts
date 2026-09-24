import assert from "node:assert/strict";
import test from "node:test";
import { createTargetRequestGate, retainedTarget, targetContextFromNetworkFailure, targetContextFromResponse, targetContextLoading } from "../lib/target-context-state.ts";

const goal = { id: "goal_123", title: "Spring half", why: "A measured race", targetDate: "2026-10-04", countdown: { days: 19, label: "19 days" } };
const today = (target: typeof goal | null) => ({ data: {
  athleteId: "athlete_123", date: "2026-09-15", sessionId: null, message: "Rest today.", source: "fallback", generatedAt: "2026-09-15T08:00:00.000Z", idempotencyKey: "today_123", timezone: "Africa/Johannesburg", state: "rest", status: "rest", goal: target, plan: null, planVersion: null, session: null, localCue: "Rest is prescribed.", scheduleWarnings: [], stale: { isStale: false, reason: null }, links: { plan: "/dashboard/plan", calendar: "/dashboard/calendar", session: null },
} });
const previous = { title: goal.title, targetDate: goal.targetDate, countdown: goal.countdown.label };

test("confirms target absence only from a schema-valid null goal", () => {
  assert.deepEqual(targetContextFromResponse(new Response(JSON.stringify(today(goal)), { status: 200 }), today(goal), null), { kind: "target", target: previous });
  assert.deepEqual(targetContextFromResponse(new Response(JSON.stringify(today(null)), { status: 200 }), today(null), previous), { kind: "absence" });
  for (const status of [404, 503]) assert.deepEqual(targetContextFromResponse(new Response("{}", { status }), {}, previous), { kind: "failed", previous, authorizationLost: false });
  assert.deepEqual(targetContextFromResponse(new Response("{}", { status: 200 }), { data: { goal: null } }, previous), { kind: "failed", previous, authorizationLost: false });
});

test("retains a confirmed target during loading and non-authority failures, but clears it after a valid null or authority loss", () => {
  assert.deepEqual(targetContextLoading(previous), { kind: "loading", previous });
  assert.deepEqual(targetContextFromNetworkFailure(previous), { kind: "failed", previous, authorizationLost: false });
  assert.equal(retainedTarget({ kind: "absence" }), null);
  assert.deepEqual(targetContextFromResponse(new Response("{}", { status: 401 }), {}, previous), { kind: "failed", previous: null, authorizationLost: true });
});

test("a target retry makes an older response stale", () => {
  const gate = createTargetRequestGate();
  const first = gate.begin();
  const retry = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(retry), true);
});
