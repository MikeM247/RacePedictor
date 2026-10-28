import assert from "node:assert/strict";
import test from "node:test";
import { AthleteJournalConflictError, PrismaAthleteJournalRepository } from "../src/cloud/prisma-athlete-journal-repository.js";

const athleteId = "athlete_reflection";
const activityId = "activity_reflection";
const requestId = "fbe2187a-6041-4e59-b1c7-3c7d16def011";
const now = new Date("2026-01-28T12:00:00.000Z");

function harness() {
  let reflection = null;
  let state = null;
  const receipts = new Map();
  let receiptCounter = 0;
  const tx = {
    $queryRaw: async () => [{ id: activityId }],
    activity: { findFirst: async () => ({ sport: "run", endedAt: new Date(now.getTime() - 1_000) }) },
    activityRevision: { findFirst: async () => ({ revisionNumber: 4 }) },
    activityReflection: {
      findUnique: async () => reflection,
      findFirst: async () => reflection,
      upsert: async ({ create, update }) => {
        reflection = { ...(reflection ?? create), ...update, createdAt: reflection?.createdAt ?? now, updatedAt: now };
        return reflection;
      },
      update: async ({ data }) => {
        reflection = { ...reflection, revision: reflection.revision + 1, ...data, updatedAt: now };
        return reflection;
      },
    },
    activityRunReviewState: {
      findUnique: async () => state,
      upsert: async ({ create, update }) => {
        state = state ? { ...state, ...update, revision: state.revision + (update.revision?.increment ?? 0) } : { ...create, createdAt: now };
        return state;
      },
    },
    activityReflectionMutation: {
      findUnique: async ({ where }) => receipts.get(where.athleteId_requestId.requestId) ?? null,
      create: async ({ data }) => {
        const row = { id: `mutation_${++receiptCounter}`, createdAt: now, ...data };
        receipts.set(data.requestId, row);
        return row;
      },
    },
    dailyWellbeingCheckIn: {},
  };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const repository = new PrismaAthleteJournalRepository({ prisma });
  const scope = { athleteId, actor: { activeAthleteId: athleteId, permittedAthleteIds: [athleteId] } };
  return { repository, scope, get reflection() { return reflection; }, get state() { return state; }, get receipts() { return receipts; } };
}

function validInput(overrides = {}) {
  return {
    requestId, expectedRevision: 0, expectedActivityRevision: 4, type: "training",
    answers: { overallRpe: 5, expectation: "as_expected", pain: { present: "no" }, postRun: { rpeAnswer: "rated", discomfort: "none", note: "Felt controlled" } },
    sections: [{ id: "hill", kind: "turning_point", location: "km 4", notes: "Kept steady" }],
    ...overrides,
  };
}

test("saving v2 feedback and completion is one atomic write and same request replays without a duplicate", async () => {
  const app = harness();
  const saved = await app.repository.savePostRunReflection(app.scope, activityId, validInput());
  assert.equal(saved.reflection.questionnaireVersion, "activity-reflection.v2");
  assert.equal(saved.state.completedReflectionRevision, saved.reflection.revision);
  assert.ok(saved.state.suppressedAt);
  assert.equal(app.receipts.size, 1);
  const replay = await app.repository.savePostRunReflection(app.scope, activityId, validInput());
  assert.equal(replay.replayed, true);
  assert.equal(replay.reflection.revision, saved.reflection.revision);
  assert.equal(app.receipts.size, 1);
  await assert.rejects(app.repository.savePostRunReflection(app.scope, activityId, validInput({ answers: { ...validInput().answers, postRun: { rpeAnswer: "rated", discomfort: "none", note: "Changed" } } })), AthleteJournalConflictError);
});

test("delete preserves the journal context, retains suppression, and an old save replay never restores feedback", async () => {
  const app = harness();
  const saved = await app.repository.savePostRunReflection(app.scope, activityId, validInput());
  const deleted = await app.repository.deletePostRunReflection(app.scope, activityId, { requestId: "2643d654-98bc-430e-8530-9751cc17ddfb", expectedStateRevision: saved.state.revision });
  assert.equal(deleted.reflection, null);
  assert.equal(deleted.state.completedAt, null);
  assert.ok(deleted.state.suppressedAt);
  assert.equal(app.reflection.questionnaireVersion, "activity-reflection.v1");
  assert.equal(app.reflection.answers.expectation, "as_expected");
  assert.deepEqual(app.reflection.sections, validInput().sections);
  const reconciled = await app.repository.getReflectionMutation(app.scope, activityId, saved.operation.requestId);
  assert.equal(reconciled.reflection, null);
  assert.ok(reconciled.state.suppressedAt);
  const retry = await app.repository.savePostRunReflection(app.scope, activityId, validInput());
  assert.equal(retry.replayed, true);
  assert.equal(retry.reflection, null);
  assert.ok(retry.state.suppressedAt);
  assert.equal(app.reflection.answers.postRun, undefined);
});

test("explicit reopen clears suppression and permits a review without deleting the saved reflection", async () => {
  const app = harness();
  const saved = await app.repository.savePostRunReflection(app.scope, activityId, validInput());
  const reopened = await app.repository.reopenPostRunReflection(app.scope, activityId, { requestId: "e97d8215-951c-44ef-a155-92ac0d99a5aa", expectedStateRevision: saved.state.revision });
  assert.equal(reopened.state.completedAt, null);
  assert.equal(reopened.state.suppressedAt, null);
  assert.ok(reopened.state.reopenedAt);
  assert.equal(reopened.reflection.questionnaireVersion, "activity-reflection.v2");
});
