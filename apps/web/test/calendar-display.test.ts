import test from "node:test";
import assert from "node:assert/strict";
import { calendarDayRecords, compactCalendarMetric, displayWeekDates, relativeCalendarLabel, shiftDisplayDate } from "../lib/calendar-display.ts";
import { localDateInTimezone, normalizeCalendarActivities, normalizeCalendarSessions } from "../lib/coaching-ui-state.ts";

test("compact day metrics prefer real distance, fall back to duration, and disclose unavailable values", () => {
  assert.equal(compactCalendarMetric(7500, 2700), "7.5 km");
  assert.equal(compactCalendarMetric(1, 2700), "1 m");
  assert.equal(compactCalendarMetric(undefined, 2700), "45 min");
  assert.equal(compactCalendarMetric(0, 75), "1.3 min");
  assert.equal(compactCalendarMetric(undefined, undefined), "N/A");
  assert.equal(compactCalendarMetric(0, 0), "N/A");
  assert.equal(compactCalendarMetric(NaN, Infinity), "N/A");
  assert.equal(compactCalendarMetric(-1, -1), "N/A");
});

test("day projection retains both kinds and counts actually hidden records", () => {
  const date = "2026-10-03";
  const sessions = normalizeCalendarSessions({ sessions: [1, 2, 3].map((id) => ({ id: `s${id}`, title: `Plan ${id}`, effectiveDate: date, scheduledDate: date, kind: "run", purpose: "Aerobic", prescription: "Easy", durationMinutes: 40 })) });
  const activities = normalizeCalendarActivities({ activities: [1, 2, 3].map((id) => ({ id: `a${id}`, title: `Run ${id}`, localDate: date, sport: "run", distanceMeters: 5000, elapsedTimeSeconds: 1800 })) });
  const mixed = calendarDayRecords(date, sessions, activities);
  assert.deepEqual(mixed.planned.map((row) => row.id), ["s1", "s2", "s3"]);
  assert.deepEqual(mixed.recorded.map((row) => row.id), ["a1", "a2", "a3"]);
  assert.equal(mixed.hiddenCount, 4);
  assert.equal(calendarDayRecords(date, sessions, []).hiddenCount, 2);
  assert.equal(calendarDayRecords(date, [], activities).hiddenCount, 2);
  assert.equal(calendarDayRecords(date, sessions.slice(0, 1), activities.slice(0, 1)).hiddenCount, 0);
  assert.equal(calendarDayRecords("2026-10-04", sessions, activities).planned.length, 0);
  assert.equal(sessions[0].status, "upcoming");
});

test("relative labels and weeks respect saved-zone midnight, year and DST boundaries", () => {
  const today = localDateInTimezone("Africa/Johannesburg", new Date("2026-12-31T22:30:00Z"));
  assert.equal(today, "2027-01-01");
  assert.equal(relativeCalendarLabel("2027-01-02", today), "Tomorrow");
  assert.equal(relativeCalendarLabel("2026-12-31", today), "Yesterday");
  assert.deepEqual(displayWeekDates(today), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(localDateInTimezone("America/New_York", new Date("2026-03-08T06:30:00Z")), "2026-03-08");
  assert.equal(shiftDisplayDate("2026-03-08", 1), "2026-03-09");
});
