import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import {
  PrismaTrainingPlanProjectionPublisher,
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

function scope(athleteId) {
  return athleteScopeFor(buildActorContext({
    userId: `device:device-${athleteId}`,
    permittedAthleteIds: [athleteId],
    activeAthleteId: athleteId,
    requestId: `request-${athleteId}`,
    credentialKind: "device",
  }));
}

function plan(athleteId, id = "plan-a") {
  return {
    id, athleteId, goalId: `goal-${athleteId}`, goalRevision: 1, routineRevision: 1,
    version: 1, revision: 2, startsOn: "2026-08-10", endsOn: "2026-08-16", timezone: "Africa/Johannesburg",
    weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Approved aerobic week", sessionIds: ["run-a"] }],
    workouts: [{ id: "run-a", kind: "run", scheduledDate: "2026-08-10", title: "Easy run", purpose: "Aerobic base", prescription: "Run easily for 30 minutes.", cautions: [], durationMinutes: 30 }],
    contextArtifactId: `context-${athleteId}`, createdAt: "2026-08-09T08:00:00.000Z",
    approval: { goalRationale: "Approved goal", rationale: "Approved rationale", summary: "Approved plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash: "b".repeat(64) },
    status: "active", activatedAt: "2026-08-09T09:00:00.000Z", activatedBy: "user",
  };
}

function fakePrisma() {
  const devices = new Map([["device-a", { id: "device-a", athleteId: "athlete-a", status: "active" }]]);
  const projections = [];
  const changes = [];
  const transaction = {
    pairedDevice: { findUnique: async ({ where }) => {
      const row = devices.get(where.id_athleteId.id);
      return row?.athleteId === where.id_athleteId.athleteId ? row : null;
    } },
    trainingPlanProjection: {
      findUnique: async ({ where }) => projections.find((row) => row.athleteId === where.athleteId_planId.athleteId && row.planId === where.athleteId_planId.planId) ?? null,
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const row of projections) if (row.athleteId === where.athleteId && row.active === where.active) { Object.assign(row, data); count += 1; }
        return { count };
      },
      create: async ({ data }) => { projections.push({ ...data }); return data; },
    },
    syncChange: {
      aggregate: async ({ where }) => ({ _max: { cursor: changes.filter((item) => item.athleteId === where.athleteId).at(-1)?.cursor ?? null } }),
      create: async ({ data }) => { changes.push({ ...data }); return data; },
    },
  };
  return {
    devices, projections, changes,
    trainingPlanProjection: transaction.trainingPlanProjection,
    $transaction: async (operation) => operation(transaction),
  };
}
