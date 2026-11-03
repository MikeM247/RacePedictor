import test from "node:test";
import assert from "node:assert/strict";
import { calculateCalendarTotals } from "../lib/calendar-totals.ts";
import type { CalendarActivityView, CalendarSessionView } from "../lib/coaching-ui-state.ts";

function session(id: string, effectiveDate: string, overrides: Partial<CalendarSessionView> = {}): CalendarSessionView {
  return {
    id, title: "Easy run", kind: "run", purpose: "Build consistency", prescription: "Easy effort", cautions: [],
    durationMinutes: 40, distanceMeters: 6000, scheduledDate: effectiveDate, prescribedDate: effectiveDate,
    effectiveDate, originalDate: effectiveDate, status: "upcoming", revision: 1, warnings: [],
    original: { id, title: "Easy run", kind: "run", purpose: "Build consistency", prescription: "Easy effort", cautions: [], durationMinutes: 40, distanceMeters: 6000, scheduledDate: effectiveDate },
    amendments: [], ...overrides,
  };
}

function activity(id: string, localDate: string, overrides: Partial<CalendarActivityView> = {}): CalendarActivityView {
  return {
    id, localDate, title: "Morning run", sport: "run", distanceMeters: 5000, elapsedTimeSeconds: 1800,
    averagePaceSecondsPerKm: 360, elevationGainMeters: 0, calories: null, ...overrides,
  };
}

const available = { planReadStatus: "active" as const, scheduleReadStatus: "effective" as const, activitiesReadStatus: "available" as const };

test("weekly totals cover boundary dates, deduplicate identities and exclude skipped/rest sessions", () => {
  const totals = calculateCalendarTotals({
    from: "2026-10-26", to: "2026-11-01",
    sessions: [session("mon", "2026-10-26"), session("skip", "2026-10-27", { status: "skipped" }), session("rest", "2026-10-28", { kind: "rest" }), session("next", "2026-11-02")],
    activities: [activity("run-a", "2026-10-26"), activity("run-a", "2026-10-26", { distanceMeters: 999 }), activity("run-b", "2026-11-01", { sport: "trail_run", distanceMeters: 8000 }), activity("ride", "2026-10-29", { sport: "ride" })],
    ...available,
  });
  assert.deepEqual(totals.recorded, { distanceMeters: 13000, durationSeconds: 3600, activityCount: 2, complete: true, missingRecordCount: 0 });
  assert.deepEqual(totals.planned, { distanceMeters: 6000, durationSeconds: 2400, sessionCount: 1, complete: true, missingRecordCount: 0 });
});

test("monthly totals are calculated independently over only dates within the month", () => {
  const sessions = [session("before", "2026-10-31"), session("inside", "2026-11-01"), session("last", "2026-11-30"), session("after", "2026-12-01")];
  const activities = [activity("before", "2026-10-31"), activity("inside", "2026-11-01"), activity("last", "2026-11-30"), activity("after", "2026-12-01")];
  const totals = calculateCalendarTotals({ from: "2026-11-01", to: "2026-11-30", sessions, activities, ...available });
  assert.equal(totals.recorded.activityCount, 2);
  assert.equal(totals.recorded.distanceMeters, 10000);
  assert.equal(totals.planned.sessionCount, 2);
});

test("failed reads, no plan and approved-source fallback remain distinguishable", () => {
  const failedActivities = calculateCalendarTotals({ from: "2026-11-01", to: "2026-11-07", sessions: [], activities: [], ...available, activitiesReadStatus: "unavailable" });
  assert.equal(failedActivities.recorded.complete, false);
  const noPlan = calculateCalendarTotals({ from: "2026-11-01", to: "2026-11-07", sessions: [], activities: [], ...available, planReadStatus: "none" });
  assert.equal(noPlan.planned.complete, false);
  const fallback = calculateCalendarTotals({ from: "2026-11-01", to: "2026-11-07", sessions: [session("fallback", "2026-11-01")], activities: [], ...available, scheduleReadStatus: "approved_fallback" });
  assert.equal(fallback.planned.complete, false);
});
