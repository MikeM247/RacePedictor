import assert from "node:assert/strict";
import test from "node:test";
import { externalTaskReference, hasUnsavedReminderChanges, reminderStage, settingsReadError, shouldRecoverBeforeRetry } from "../lib/settings-workflow-state.ts";

const saved = { enabled: true, localTime: "05:45", timezone: "Africa/Johannesburg" };

test("does not manufacture editable defaults after an initial preference failure, while retaining prior reads on refresh failure", () => {
  assert.deepEqual(settingsReadError({ status: "loading" }, "Preferences could not be loaded"), { status: "error", message: "Preferences could not be loaded" });
  assert.deepEqual(settingsReadError({ status: "ready", data: saved, checkedAt: 10 }, "Refresh failed"), { status: "error", data: saved, checkedAt: 10, message: "Refresh failed" });
});

test("keeps a draft distinct from its confirmed preference baseline", () => {
  assert.equal(hasUnsavedReminderChanges(saved, saved), false);
  assert.equal(hasUnsavedReminderChanges(saved, { ...saved, localTime: "06:30" }), true);
  assert.equal(hasUnsavedReminderChanges(null, saved), true);
});

test("stages reminder preparation without confusing prepared artifacts with external scheduling", () => {
  assert.equal(reminderStage({ preferencesAvailable: false, dirty: false, enabled: true, externalStatus: "not_configured", generatedHandoff: false, continuing: false }), "preferences-unavailable");
  assert.equal(reminderStage({ preferencesAvailable: true, dirty: true, enabled: true, externalStatus: "not_configured", generatedHandoff: false, continuing: false }), "editing");
  assert.equal(reminderStage({ preferencesAvailable: true, dirty: false, enabled: true, externalStatus: "prepared", generatedHandoff: true, continuing: false }), "continue");
  assert.equal(reminderStage({ preferencesAvailable: true, dirty: false, enabled: true, externalStatus: "prepared", generatedHandoff: false, continuing: false }), "confirm");
  assert.equal(reminderStage({ preferencesAvailable: true, dirty: false, enabled: true, externalStatus: "prepared", generatedHandoff: false, continuing: true }), "confirm");
  assert.equal(reminderStage({ preferencesAvailable: true, dirty: false, enabled: true, externalStatus: "scheduled", generatedHandoff: false, continuing: false }), "scheduled");
});

test("does not hydrate a task-reference input from a prepared artifact path and requires a reread after unknown writes", () => {
  assert.equal(externalTaskReference("prepared", "Coach Exchange/Generated/reminder.md"), "");
  assert.equal(externalTaskReference("scheduled", "codex://tasks/123"), "codex://tasks/123");
  assert.equal(shouldRecoverBeforeRetry(true), true);
  assert.equal(shouldRecoverBeforeRetry(false), false);
});
