import assert from "node:assert/strict";
import test from "node:test";
import {
  canAmendFutureSession,
  canRecordPastSessionSkip,
  changeHistoryLabel,
  externalAutomationStatusLabel,
  formatAdjustmentCue,
  formatApiErrorDetails,
  formatSessionTarget,
  handoffStatusLabel,
  normalizeCalendarSessions,
  normalizeCalendarActivities,
  normalizeHistoricalCalendarSessions,
  outOfPlanRangeWarning,
  sameDayConflictWarning,
  weekRange,
} from "../lib/coaching-ui-state.ts";

test("calculates a stable Monday-to-Sunday calendar range", () => {
  assert.deepEqual(weekRange("2026-08-05"), { from: "2026-08-03", to: "2026-08-09" });
});

test("normalizes API sessions while preserving prescribed dates and revision", () => {
  assert.deepEqual(normalizeCalendarSessions({ data: { sessions: [{
    id: "run-1", title: "Easy run", effectiveDate: "2026-08-05", prescribedDate: "2026-08-04", revision: 3,
  }] } })[0], {
    id: "run-1", title: "Easy run", kind: "run", purpose: "Follow the approved prescription.",
    prescription: "Follow the approved prescription.", cautions: [], durationMinutes: 0,
    scheduledDate: "2026-08-05", prescribedDate: "2026-08-04",
    effectiveDate: "2026-08-05", originalDate: "2026-08-04", status: "upcoming", revision: 3,
    warnings: [],
    original: {
      id: "run-1", title: "Easy run", kind: "run", purpose: "Follow the approved prescription.",
      prescription: "Follow the approved prescription.", cautions: [], durationMinutes: 0,
      scheduledDate: "2026-08-04",
    },
    amendments: [],
  });
});

test("normalizes immutable source values and reasoned change history", () => {
  const [session] = normalizeCalendarSessions({ sessions: [{
    id: "run-amended", kind: "run", title: "Short treadmill run", purpose: "Maintain rhythm.",
    prescription: "Run easily for 30 minutes.", durationMinutes: 30,
    prescribedDate: "2026-08-20", effectiveDate: "2026-08-21", revision: 3,
    original: {
      id: "run-amended", kind: "run", title: "Aerobic run", purpose: "Build aerobic fitness.",
      prescription: "Run easily for 50 minutes.", cautions: [], durationMinutes: 50, scheduledDate: "2026-08-20",
    },
    amendments: [{
      id: "change-2", operation: "amend", reason: "Limited time after work travel.",
      changedAt: "2026-08-18T16:00:00.000Z", changedFields: ["title", "durationMinutes"], resultingRevision: 3,
    }],
  }] });
  assert.equal(session.original.prescription, "Run easily for 50 minutes.");
  assert.equal(session.prescription, "Run easily for 30 minutes.");
  assert.equal(session.amendments[0].reason, "Limited time after work travel.");
  assert.equal(changeHistoryLabel(session.amendments[0]), "amend · title, durationMinutes · revision 3");
});

test("keeps recorded runs and historical planned sessions available by calendar date", () => {
  const payload = {
    activities: [{
      id: "activity-1", localDate: "2026-08-13", title: "Morning Run", sport: "run",
      distanceM: 10000, elapsedTimeS: 3600, avgPaceSecPerKm: 360, elevationGainM: 120,
    }],
    historicalSessions: [{
      id: "plan-run-1", planId: "plan-old", planVersion: 2, kind: "run", scheduledDate: "2026-08-13",
      title: "Easy 10 km", purpose: "Maintain aerobic volume.", prescription: "Run 10 km easily.",
      cautions: [], durationMinutes: 60, distanceMeters: 10000, intensityRpe: 3,
    }],
  };
  const [activity] = normalizeCalendarActivities(payload);
  const [session] = normalizeHistoricalCalendarSessions(payload);
  assert.equal(activity.localDate, "2026-08-13");
  assert.equal(session.scheduledDate, "2026-08-13");
  assert.equal(session.planVersion, 2);
});

test("allows only sessions after the athlete's current local date", () => {
  assert.equal(canAmendFutureSession({ effectiveDate: "2026-08-14" }, "2026-08-13"), true);
  assert.equal(canAmendFutureSession({ effectiveDate: "2026-08-13" }, "2026-08-13"), false);
  assert.equal(canAmendFutureSession({ effectiveDate: "2026-08-12" }, "2026-08-13"), false);
});

test("allows a past session to be recorded as skipped without opening any other past edits", () => {
  assert.equal(canRecordPastSessionSkip({ effectiveDate: "2026-08-12", status: "upcoming" }, "2026-08-13"), true);
  assert.equal(canRecordPastSessionSkip({ effectiveDate: "2026-08-13", status: "upcoming" }, "2026-08-13"), false);
  assert.equal(canRecordPastSessionSkip({ effectiveDate: "2026-08-12", status: "skipped" }, "2026-08-13"), false);
});

test("preserves the approved prescription and formats a concrete session target", () => {
  const [session] = normalizeCalendarSessions({ sessions: [{
    id: "run-target", title: "Progression", effectiveDate: "2026-08-05",
    prescription: "Run four controlled kilometres, then cool down.", cautions: ["Keep the effort controlled."],
    durationMinutes: 45, distanceMeters: 7000, intensityRpe: 4, startTime: "06:30",
  }] });
  assert.equal(session.prescription, "Run four controlled kilometres, then cool down.");
  assert.deepEqual(session.cautions, ["Keep the effort controlled."]);
  assert.equal(formatSessionTarget(session), "7 km · 45 min · RPE 4");
});

test("warns when a proposed calendar move leaves the approved plan range", () => {
  const range = { startsOn: "2026-08-03", endsOn: "2026-09-13" };
  assert.equal(outOfPlanRangeWarning("2026-08-10", range), null);
  assert.match(outOfPlanRangeWarning("2026-09-14", range) ?? "", /Outside approved plan range/);
});

test("summarizes auditable calendar adjustments without implying workout completion", () => {
  const [session] = normalizeCalendarSessions({ sessions: [{
    id: "run-moved", title: "Moved run", prescribedDate: "2026-08-05",
    effectiveDate: "2026-08-06", revision: 2,
  }] });
  assert.equal(formatAdjustmentCue(session), "Adjustment history: moved from 2026-08-05 to 2026-08-06 · revision 2.");
});

test("formats field-level API validation details", () => {
  assert.deepEqual(formatApiErrorDetails([[
    { path: ["proposal", "workouts", 0, "prescription"], message: "Required" },
  ]]), ["proposal.workouts.0.prescription: Required"]);
});

test("keeps handoff preparation separate from confirmed external scheduling", () => {
  assert.equal(handoffStatusLabel("prepared"), "Prepared for Codex");
  assert.equal(externalAutomationStatusLabel("prepared"), "Not scheduled — handoff prepared");
  assert.match(externalAutomationStatusLabel("scheduled"), /user confirmed/);
});

test("warns before moving onto another active session but ignores skipped sessions", () => {
  const sessions = normalizeCalendarSessions({ sessions: [
    { id: "run-1", title: "Easy run", prescribedDate: "2026-08-04", effectiveDate: "2026-08-05" },
    { id: "run-2", title: "Long run", prescribedDate: "2026-08-06", effectiveDate: "2026-08-06" },
    { id: "run-3", title: "Skipped run", prescribedDate: "2026-08-06", effectiveDate: "2026-08-06", status: "skipped" },
  ] });
  assert.match(sameDayConflictWarning(sessions, "run-1", "2026-08-06") ?? "", /Long run/);
  assert.doesNotMatch(sameDayConflictWarning(sessions, "run-1", "2026-08-06") ?? "", /Skipped run/);
  assert.equal(sameDayConflictWarning(sessions, "run-1", "2026-08-07"), null);
});
