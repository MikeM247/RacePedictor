import test from "node:test";
import assert from "node:assert/strict";
import { resolveCoachUpNext } from "../src/services/coach-up-next.ts";

const session = (id: string, date: string, kind = "run", status = "upcoming", startTime: string | null = null) => ({ id, effectiveDate: date, kind, status, startTime });

test("recorded same-day run advances the displayed next session without mutating completion", () => {
  const result = resolveCoachUpNext({
    today: "2026-10-22", timezone: "Africa/Johannesburg", activitiesAvailable: true,
    todaySessions: [session("today-run", "2026-10-22")],
    sessions: [session("today-run", "2026-10-22"), session("tomorrow-run", "2026-10-23")],
    activities: [{ id: "activity-1", localDate: "2026-10-22", sport: "run", occurredAt: "2026-10-22T05:00:00.000Z", elapsedTimeSeconds: 3_600 }],
  });
  assert.deepEqual(result, { kind: "selected", session: session("tomorrow-run", "2026-10-23"), advancedByRecordedRun: true });
});

test("a later same-day non-run session remains next after a recorded run", () => {
  const result = resolveCoachUpNext({
    today: "2026-10-22", timezone: "Africa/Johannesburg", activitiesAvailable: true,
    todaySessions: [session("morning-run", "2026-10-22", "run", "upcoming", "06:00"), session("strength", "2026-10-22", "strength")],
    sessions: [],
    activities: [{ id: "activity-1", localDate: "2026-10-22", sport: "run", occurredAt: "2026-10-22T04:00:00.000Z", elapsedTimeSeconds: 1_800 }],
  });
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") assert.equal(result.session.id, "strength");
});

test("ambiguous same-day schedule is surfaced instead of guessed", () => {
  const result = resolveCoachUpNext({
    today: "2026-10-22", timezone: "Africa/Johannesburg", activitiesAvailable: true,
    todaySessions: [session("one", "2026-10-22"), session("two", "2026-10-22")],
    sessions: [], activities: [],
  });
  assert.equal(result.kind, "ambiguous");
});

test("rest and skipped sessions are excluded from future workout selection", () => {
  const result = resolveCoachUpNext({
    today: "2026-10-22", timezone: "Africa/Johannesburg", activitiesAvailable: true,
    todaySessions: [],
    sessions: [session("rest", "2026-10-23", "rest"), session("skip", "2026-10-24", "run", "skipped"), session("run", "2026-10-25")],
    activities: [],
  });
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") assert.equal(result.session.id, "run");
});
