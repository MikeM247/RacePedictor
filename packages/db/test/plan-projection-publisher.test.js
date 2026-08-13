import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import {
  PrismaTrainingPlanProjectionActivator,
  PrismaTrainingPlanProjectionPublisher,
  TrainingPlanActivationError,
  TrainingPlanProjectionConflictError,
} from "../src/cloud/index.js";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const scopeA = scope("athlete-a");
const scopeB = scope("athlete-b");

test("approved plan publication is device-fenced, replay-safe, athlete-scoped, and emits plan/calendar changes", async () => {
  const prisma = fakePrisma();
  const publisher = new PrismaTrainingPlanProjectionPublisher({ prisma, now: () => NOW });
  const value = plan("athlete-a");
  const first = await publisher.publishApproved(scopeA, value, "device-a");
  assert.equal(first.reused, false);
  assert.deepEqual(prisma.changes.map((change) => [change.cursor, change.entityType, change.entityId]), [
    [1n, "plan", "plan-a"],
    [2n, "calendar_session", "run-a"],
  ]);
  assert.equal((await publisher.publishApproved(scopeA, value, "device-a")).reused, true);
  assert.equal(prisma.changes.length, 2);
  await assert.rejects(
    publisher.publishApproved(scopeA, { ...value, revision: 3 }, "device-a"),
    (error) => error instanceof TrainingPlanProjectionConflictError,
  );
  await assert.rejects(publisher.publishApproved(scopeB, plan("athlete-b"), "device-a"), /unavailable/u);
  prisma.devices.get("device-a").status = "revoked";
  await assert.rejects(publisher.publishApproved(scopeA, plan("athlete-a", "plan-b"), "device-a"), /unavailable/u);
});

test("draft proposals cannot cross the approved online projection boundary", async () => {
  const prisma = fakePrisma();
  const publisher = new PrismaTrainingPlanProjectionPublisher({ prisma });
  const { activatedAt: _activatedAt, activatedBy: _activatedBy, ...draft } = plan("athlete-a");
  await assert.rejects(publisher.publishApproved(scopeA, { ...draft, status: "draft" }, "device-a"), /approved/u);
  assert.equal(prisma.changes.length, 0);
});

test("publishing a replacement retires the prior projection without corrupting approved history", async () => {
  const prisma = fakePrisma();
  const publisher = new PrismaTrainingPlanProjectionPublisher({ prisma, now: () => NOW });
  await publisher.publishApproved(scopeA, plan("athlete-a"), "device-a");
  await publisher.publishApproved(scopeA, plan("athlete-a", "plan-b"), "device-a");
  const first = prisma.projections.find((row) => row.planId === "plan-a");
  const second = prisma.projections.find((row) => row.planId === "plan-b");
  assert.equal(first.active, false);
  assert.equal(first.planStatus, "retired");
  assert.equal(first.plan.status, "retired");
  assert.equal(first.plan.revision, 3);
  assert.equal(second.active, true);
  assert.equal(second.plan.status, "active");
  assert.deepEqual(prisma.changes.slice(2).map((change) => [change.entityType, change.entityId, change.entityVersion]), [
    ["plan", "plan-a", 3],
    ["plan", "plan-b", 2],
    ["calendar_session", "run-b", 2],
  ]);
});

test("a signed-in owner can select an approved plan atomically with stale-tab protection", async () => {
  const prisma = fakePrisma();
  const publisher = new PrismaTrainingPlanProjectionPublisher({ prisma, now: () => NOW });
  await publisher.publishApproved(scopeA, plan("athlete-a"), "device-a");
  await publisher.publishApproved(scopeA, plan("athlete-a", "plan-b"), "device-a");
  const later = new Date("2026-08-11T12:00:00.000Z");
  const activator = new PrismaTrainingPlanProjectionActivator({ prisma, now: () => later });
  const selected = await activator.activate(ownerScope("athlete-a"), "plan-a", "plan-b");
  assert.equal(selected.reused, false);
  assert.equal(selected.activePlan.id, "plan-a");
  assert.equal(selected.activePlan.status, "active");
  assert.equal(selected.activePlan.revision, 4);
  assert.equal(selected.retiredPlan.id, "plan-b");
  assert.equal(selected.retiredPlan.revision, 3);
  assert.equal(prisma.projections.filter((row) => row.active).length, 1);
  assert.equal(prisma.projections.find((row) => row.active).planId, "plan-a");
  assert.equal((await activator.activate(ownerScope("athlete-a"), "plan-a", "plan-a")).reused, true);
  await assert.rejects(
    activator.activate(ownerScope("athlete-a"), "plan-b", "plan-b"),
    (error) => error instanceof TrainingPlanActivationError && error.code === "PLAN_ACTIVATION_CONFLICT",
  );
  await assert.rejects(
    activator.activate(scopeA, "plan-b", "plan-a"),
    (error) => error instanceof TrainingPlanActivationError && error.code === "SESSION_REQUIRED",
  );
});

function scope(athleteId) {
  return athleteScopeFor(buildActorContext({
    userId: `device:device-${athleteId}`,
    permittedAthleteIds: [athleteId],
    activeAthleteId: athleteId,
    requestId: `request-${athleteId}`,
    credentialKind: "device",
  }));
}

function ownerScope(athleteId) {
  return athleteScopeFor(buildActorContext({
    userId: `owner-${athleteId}`,
    permittedAthleteIds: [athleteId],
    activeAthleteId: athleteId,
    requestId: `owner-request-${athleteId}`,
    credentialKind: "session",
  }));
}

function plan(athleteId, id = "plan-a") {
  const workoutId = id === "plan-a" ? "run-a" : "run-b";
  const contentHash = id === "plan-a" ? "b".repeat(64) : "c".repeat(64);
  return {
    id, athleteId, goalId: `goal-${athleteId}`, goalRevision: 1, routineRevision: 1,
    version: 1, revision: 2, startsOn: "2026-08-10", endsOn: "2026-08-16", timezone: "Africa/Johannesburg",
    weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Approved aerobic week", sessionIds: [workoutId] }],
    workouts: [{ id: workoutId, kind: "run", scheduledDate: "2026-08-10", title: "Easy run", purpose: "Aerobic base", prescription: "Run easily for 30 minutes.", cautions: [], durationMinutes: 30 }],
    contextArtifactId: `context-${athleteId}`, createdAt: "2026-08-09T08:00:00.000Z",
    approval: { goalRationale: "Approved goal", rationale: "Approved rationale", summary: "Approved plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash },
    status: "active", activatedAt: "2026-08-09T09:00:00.000Z", activatedBy: "user",
  };
}

function fakePrisma() {
  const devices = new Map([["device-a", { id: "device-a", athleteId: "athlete-a", status: "active" }]]);
  const projections = [];
  const changes = [];
  const sessions = [];
  const transaction = {
    pairedDevice: { findUnique: async ({ where }) => {
      const row = devices.get(where.id_athleteId.id);
      return row?.athleteId === where.id_athleteId.athleteId ? row : null;
    } },
    trainingPlanProjection: {
      findUnique: async ({ where }) => projections.find((row) => row.athleteId === where.athleteId_planId.athleteId && row.planId === where.athleteId_planId.planId) ?? null,
      findMany: async ({ where, take }) => projections
        .filter((row) => row.athleteId === where.athleteId && (where.active === undefined || row.active === where.active))
        .sort((left, right) => right.planVersion - left.planVersion || right.planId.localeCompare(left.planId))
        .slice(0, take),
      update: async ({ where, data }) => {
        const row = projections.find((item) => item.id === where.id);
        if (!row) throw new Error("Projection was not found");
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }) => {
        const row = { id: `projection-${projections.length + 1}`, ...data };
        projections.push(row);
        return row;
      },
    },
    calendarSessionProjection: {
      upsert: async ({ where, create }) => {
        const key = where.athleteId_planId_sessionId;
        let row = sessions.find((item) => item.athleteId === key.athleteId && item.planId === key.planId && item.sessionId === key.sessionId);
        if (!row) { row = { id: `session-${sessions.length + 1}`, ...create }; sessions.push(row); }
        return row;
      },
    },
    syncChange: {
      aggregate: async ({ where }) => ({ _max: { cursor: changes.filter((item) => item.athleteId === where.athleteId).at(-1)?.cursor ?? null } }),
      create: async ({ data }) => { changes.push({ ...data }); return data; },
    },
  };
  return {
    devices, projections, changes, sessions,
    trainingPlanProjection: transaction.trainingPlanProjection,
    $transaction: async (operation) => operation(transaction),
  };
}
