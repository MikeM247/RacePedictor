import assert from "node:assert/strict";
import test from "node:test";
import {
  activationRequestBody,
  canSubmitConfirmation,
  conflictMessage,
  decisionRequestBody,
  isPlanConflict,
  uncertainMessage,
  type PlanConfirmationSnapshot,
} from "../lib/plan-confirmation-state.ts";

const approval: PlanConfirmationSnapshot = {
  kind: "approve", targetId: "proposal-reviewed", targetRevision: 7,
  targetLabel: "draft version 4", replacingPlanId: "plan-reviewed", expectedActivePlanId: "plan-reviewed",
  historyWasStale: false,
};

test("binds the exact reviewed approval identity and never invents a revision", () => {
  assert.deepEqual(decisionRequestBody(approval, false), {
    decision: "approve", expectedRevision: 7, acknowledgeStale: false, replacingPlanId: "plan-reviewed",
  });
  assert.equal(decisionRequestBody({ ...approval, targetRevision: null }, false), null);
  assert.equal(canSubmitConfirmation({ snapshot: { ...approval, targetRevision: null }, phase: "ready", acknowledgement: false }), false);
});

test("requires an explicit stale-history acknowledgement without changing the reviewed request", () => {
  const stale = { ...approval, historyWasStale: true };
  assert.equal(canSubmitConfirmation({ snapshot: stale, phase: "ready", acknowledgement: false }), false);
  assert.equal(canSubmitConfirmation({ snapshot: stale, phase: "ready", acknowledgement: true }), true);
  assert.deepEqual(decisionRequestBody(stale, true), { ...decisionRequestBody(approval, false), acknowledgeStale: true });
});

test("uses the reviewed active-plan identity exactly, including an authoritative absence", () => {
  const activation: PlanConfirmationSnapshot = { ...approval, kind: "activate", targetId: "approved-version", targetRevision: null, replacingPlanId: null, expectedActivePlanId: null, historyWasStale: false };
  assert.deepEqual(activationRequestBody(activation), { expectedActivePlanId: null });
  assert.equal(activationRequestBody({ ...activation, targetId: "" }), null);
});

test("classifies actual and unknown conflicts without relying on server prose", () => {
  assert.equal(isPlanConflict({ status: 409, code: "UNRECOGNISED" }), true);
  assert.equal(isPlanConflict({ code: "PLAN_ACTIVATION_REJECTED" }), true);
  assert.equal(isPlanConflict({ status: 503, code: "UNAVAILABLE" }), false);
  assert.match(conflictMessage({ code: "STALE_HISTORY_ACKNOWLEDGEMENT_REQUIRED" }), /history changed/i);
  assert.match(conflictMessage({ status: 409 }), /reload/i);
});

test("keeps lost outcomes qualified, including rejection", () => {
  assert.match(uncertainMessage({ ...approval, kind: "approve" }), /could not confirm/i);
  assert.match(uncertainMessage({ ...approval, kind: "reject" }), /could not confirm/i);
  assert.notEqual(uncertainMessage({ ...approval, kind: "reject" }), "Draft rejected. The active plan was not changed.");
});
