import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import { trainingPlanSchema } from "../../core/src/contracts/coaching.ts";
import { calculatePlanGoalContextHash } from "../../core/src/services/plan-goal-context.ts";
import {
  PrismaTrainingPlanGoalContextRepository,
  TrainingPlanGoalContextConflictError,
  TrainingPlanGoalContextUnavailableError,
} from "../src/cloud/index.js";

const athleteId = "athlete-goal-context";
const deviceId = "device-goal-context";
const scope = athleteScopeFor(buildActorContext({
  userId: `device:${deviceId}`,
  permittedAthleteIds: [athleteId],
  activeAthleteId: athleteId,
  requestId: "request-goal-context",
  credentialKind: "device",
}));
const publishedAt = new Date("2026-09-25T08:00:00.000Z");

function plan() {
  return trainingPlanSchema.parse({
    id: "plan-goal-context", athleteId, goalId: "goal-goal-context", goalRevision: 4,
    routineRevision: 2, version: 7, revision: 3, startsOn: "2026-09-21", endsOn: "2026-09-27",
    timezone: "Africa/Johannesburg",
    weeklyStructure: [{ weekStartsOn: "2026-09-21", focus: "Approved week", sessionIds: ["session-goal-context"] }],
    workouts: [{ id: "session-goal-context", kind: "run", scheduledDate: "2026-09-22", title: "Easy run", purpose: "Aerobic", prescription: "Run easily.", cautions: [], durationMinutes: 30 }],
    milestones: [{ id: "half-marathon", title: "Half marathon", distanceMeters: 21_097.5, targetDate: "2026-10-15", targetTimeSeconds: 7_200 }],
    contextArtifactId: "context-goal-context", createdAt: "2026-09-20T08:00:00.000Z",
    approval: { goalRationale: "Synthetic approved goal", rationale: "Synthetic approval", summary: "Synthetic plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash: "b".repeat(64) },
    status: "active", activatedAt: "2026-09-20T09:00:00.000Z", activatedBy: "user",
  });
}

function context(overrides = {}) {
  const goal = {
    id: "goal-goal-context", athleteId, revision: 4, title: "Marathon target", why: "Synthetic approved goal",
    target: { kind: "performance", distanceMeters: 42_195, targetDate: "2026-11-01", targetTimeSeconds: 14_400 },
    status: "settled", createdAt: "2026-08-01T08:00:00.000Z", updatedAt: "2026-08-02T08:00:00.000Z",
    settledAt: "2026-08-02T08:00:00.000Z", settledBy: "user",
  };
  const base = {
    athleteId, planId: "plan-goal-context", planVersion: 7, goalId: goal.id, goalRevision: goal.revision,
    approvalContentHash: "b".repeat(64), goal, milestones: plan().milestones,
    ...overrides,
  };
  return { ...base, contextHash: calculatePlanGoalContextHash(base) };
}

function fakePrisma(approvedPlan = plan()) {
  const projections = new Map([[`${athleteId}:${approvedPlan.id}`, {
    athleteId, planId: approvedPlan.id, planVersion: approvedPlan.version,
    contentHash: approvedPlan.approval.contentHash, plan: approvedPlan,
  }]]);
  const contexts = new Map();
  const devices = new Map([[`${deviceId}:${athleteId}`, { id: deviceId, athleteId, status: "active" }]]);
  const contextDelegate = {
    findUnique: async ({ where }) => contexts.get(`${where.athleteId_planId.athleteId}:${where.athleteId_planId.planId}`) ?? null,
    create: async ({ data }) => {
      const key = `${data.athleteId}:${data.planId}`;
      if (contexts.has(key)) throw Object.assign(new Error("unique violation"), { code: "P2002" });
      contexts.set(key, data);
      return data;
    },
  };
  const transaction = {
    pairedDevice: { findUnique: async ({ where }) => devices.get(`${where.id_athleteId.id}:${where.id_athleteId.athleteId}`) ?? null },
    trainingPlanProjection: { findUnique: async ({ where }) => projections.get(`${where.athleteId_planId.athleteId}:${where.athleteId_planId.planId}`) ?? null },
    trainingPlanGoalContextProjection: contextDelegate,
  };
  return {
    contexts,
    client: {
      trainingPlanProjection: transaction.trainingPlanProjection,
      trainingPlanGoalContextProjection: contextDelegate,
      $transaction: async (operation) => operation(transaction),
    },
  };
}

test("approved goal context sidecar is device-fenced, immutable, and replay-safe", async () => {
  const fake = fakePrisma();
  const repository = new PrismaTrainingPlanGoalContextRepository({ prisma: fake.client, now: () => publishedAt });
  const value = context();

  const first = await repository.publish(scope, value, deviceId);
  assert.equal(first.reused, false);
  assert.equal(first.publishedAt, publishedAt.toISOString());
  assert.equal(fake.contexts.size, 1);

  const replay = await repository.publish(scope, value, deviceId);
  assert.equal(replay.reused, true);
  assert.equal(fake.contexts.size, 1);

  await assert.rejects(repository.publish(scope, context({ goal: { ...value.goal, title: "Changed title" } }), deviceId),
    (error) => error instanceof TrainingPlanGoalContextConflictError);
  const result = await repository.findForPlan(scope, plan());
  assert.equal(result.goal.title, "Marathon target");
  assert.equal(result.milestones[0].title, "Half marathon");
  assert.equal(result.contextHash, value.contextHash);
});

test("sidecar publication requires matching athlete, device, plan revision, and approved hash", async () => {
  const fake = fakePrisma();
  const repository = new PrismaTrainingPlanGoalContextRepository({ prisma: fake.client });
  const foreign = context({ athleteId: "athlete-other", goal: { ...context().goal, athleteId: "athlete-other" } });
  await assert.rejects(repository.publish(scope, foreign, deviceId), /not authorized/u);
  await assert.rejects(repository.publish(scope, context({ planVersion: 8 }), deviceId),
    (error) => error instanceof TrainingPlanGoalContextUnavailableError);
  await assert.rejects(repository.publish(scope, context(), "device-other"), /unavailable/u);
  assert.equal(fake.contexts.size, 0);
});
