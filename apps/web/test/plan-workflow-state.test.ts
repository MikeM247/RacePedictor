import assert from "node:assert/strict";
import test from "node:test";
import { isActionableProposal, isDocumentedActivePlanAbsence, isPrivacyReadFailure, restorationValues, shouldApplyRead } from "../lib/plan-workflow-state.ts";

test("only documented NOT_FOUND active-plan responses are normal absence", () => {
  assert.equal(isDocumentedActivePlanAbsence({ status: 404, code: "NOT_FOUND" }), true);
  assert.equal(isDocumentedActivePlanAbsence({ status: 404, code: "CONTEXT_ARTIFACT_UNREADABLE" }), false);
  assert.equal(isDocumentedActivePlanAbsence({ status: 503, code: "NOT_FOUND" }), false);
  assert.equal(isPrivacyReadFailure({ status: 401 }), true);
});

test("a saved proposal is inspectable but never actionable before authoritative active-plan state", () => {
  const proposal = { id: "proposal_1", status: "proposed", version: 2, contextArtifactId: "artifact_1" };
  assert.equal(isActionableProposal({ proposal, activePlan: null, activePlanStatus: "loading", contextArtifactId: "artifact_1" }), false);
  assert.equal(isActionableProposal({ proposal, activePlan: { version: 1 }, activePlanStatus: "success", contextArtifactId: "artifact_1" }), true);
  assert.equal(isActionableProposal({ proposal, activePlan: null, activePlanStatus: "success", contextArtifactId: "artifact_other" }), false);
});

test("a late read cannot apply after a newer request or mutation invalidates it", () => {
  assert.equal(shouldApplyRead(3, 2), false);
  assert.equal(shouldApplyRead(3, 3), true);
});

test("restoration retains supported goal and routine values without defaults", () => {
  assert.deepEqual(restorationValues({ profile: { displayName: "Ava", why: "Race", timezone: "Europe/London", units: "imperial" }, planningGoal: { title: "10K", target: { targetDate: "2026-10-01", distanceMeters: 10000, targetTimeSeconds: 2700 } }, routine: { timezone: "Europe/London", preferredLongRunDay: "saturday", days: [{ day: "saturday", available: true }] } }), {
    displayName: "Ava", why: "Race", title: "10K", targetDate: "2026-10-01", distanceKm: "10", targetTime: "0:45:00", timezone: "Europe/London", units: "imperial", preferredLongRunDay: "saturday", desiredSessionsPerWeek: undefined, goalKind: undefined, days: ["saturday"],
  });
});

test("restoration identifies a supported goal shape instead of converting another target", () => {
  const restored = restorationValues({ planningGoal: { target: { kind: "consistency", metric: "sessions" } }, routine: { desiredSessionsPerWeek: 2 } });
  assert.equal(restored.goalKind, "consistency");
  assert.equal(restored.distanceKm, undefined);
  assert.equal(restored.desiredSessionsPerWeek, 2);
});
