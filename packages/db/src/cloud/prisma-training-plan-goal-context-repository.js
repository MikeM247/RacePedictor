import { randomUUID } from "node:crypto";
import {
  goalContextGoalSchema,
  raceMilestoneSchema,
  settledGoalSchema,
  trainingPlanGoalContextPublishRequestSchema,
  trainingPlanSchema,
} from "../../../core/src/contracts/coaching.ts";
import { calculatePlanGoalContextHash } from "../../../core/src/services/plan-goal-context.ts";
import { assertAthleteOwnership, assertAthleteScope } from "./athlete-scope.js";

export class TrainingPlanGoalContextConflictError extends Error {
  constructor() {
    super("Approved goal context conflicts with its immutable projection");
    this.name = "TrainingPlanGoalContextConflictError";
    this.code = "GOAL_CONTEXT_CONFLICT";
  }
}

export class TrainingPlanGoalContextUnavailableError extends Error {
  constructor() {
    super("The matching approved plan projection is unavailable");
    this.name = "TrainingPlanGoalContextUnavailableError";
    this.code = "GOAL_CONTEXT_UNAVAILABLE";
  }
}

export class TrainingPlanGoalContextHashError extends Error {
  constructor() {
    super("Approved goal context hash is invalid");
    this.name = "TrainingPlanGoalContextHashError";
    this.code = "GOAL_CONTEXT_HASH_INVALID";
  }
}

export class PrismaTrainingPlanGoalContextRepository {
  #prisma;
  #now;

  constructor({ prisma, now = () => new Date() }) {
    if (!prisma?.trainingPlanGoalContextProjection || !prisma?.trainingPlanProjection || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma training-plan goal-context client is required");
    }
    this.#prisma = prisma;
    this.#now = now;
  }

  async publish(scope, value, pairedDeviceId) {
    const athleteId = assertAthleteScope(scope);
    const parsed = trainingPlanGoalContextPublishRequestSchema.parse(value);
    assertAthleteOwnership(scope, parsed.athleteId);
    if (!pairedDeviceId) throw new Error("Paired device is required");
    const { contextHash, ...hashInput } = parsed;
    if (calculatePlanGoalContextHash(hashInput) !== contextHash) throw new TrainingPlanGoalContextHashError();

    return this.#prisma.$transaction(async (transaction) => {
      const device = await transaction.pairedDevice.findUnique({
        where: { id_athleteId: { id: pairedDeviceId, athleteId } },
      });
      if (!device || device.status !== "active") throw new Error("Paired device is unavailable");

      const planRow = await transaction.trainingPlanProjection.findUnique({
        where: { athleteId_planId: { athleteId, planId: parsed.planId } },
      });
      if (!planRow) throw new TrainingPlanGoalContextUnavailableError();
      const planResult = trainingPlanSchema.safeParse(planRow.plan);
      if (!planResult.success) throw new TrainingPlanGoalContextUnavailableError();
      const plan = planResult.data;
      if (planRow.athleteId !== athleteId
        || planRow.planId !== parsed.planId
        || planRow.planVersion !== parsed.planVersion
        || planRow.contentHash !== parsed.approvalContentHash
        || plan.id !== parsed.planId
        || plan.athleteId !== athleteId
        || plan.version !== parsed.planVersion
        || plan.goalId !== parsed.goalId
        || plan.goalRevision !== parsed.goalRevision
        || plan.approval.contentHash !== parsed.approvalContentHash
        || !["active", "retired"].includes(plan.status)
        || !sameJson(plan.milestones ?? [], parsed.milestones)) {
        throw new TrainingPlanGoalContextUnavailableError();
      }
      const snapshotGoal = settledGoalSchema.parse(parsed.goal);
      if (snapshotGoal.id !== plan.goalId || snapshotGoal.revision !== plan.goalRevision || snapshotGoal.athleteId !== athleteId) {
        throw new TrainingPlanGoalContextUnavailableError();
      }

      const existing = await transaction.trainingPlanGoalContextProjection.findUnique({
        where: { athleteId_planId: { athleteId, planId: parsed.planId } },
      });
      if (existing) {
        if (existing.contextHash === contextHash
          && sameJson(existing.goal, snapshotGoal)
          && sameJson(existing.milestones, parsed.milestones)
          && existing.approvalContentHash === parsed.approvalContentHash
          && existing.planVersion === parsed.planVersion) {
          return { contextHash: existing.contextHash, publishedAt: existing.publishedAt.toISOString(), reused: true };
        }
        throw new TrainingPlanGoalContextConflictError();
      }

      const publishedAt = this.#now();
      const row = await transaction.trainingPlanGoalContextProjection.create({
        data: {
          id: `goal_context_${randomUUID().replaceAll("-", "")}`,
          athleteId,
          planId: parsed.planId,
          planVersion: parsed.planVersion,
          goalId: parsed.goalId,
          goalRevision: parsed.goalRevision,
          approvalContentHash: parsed.approvalContentHash,
          goal: snapshotGoal,
          milestones: parsed.milestones,
          contextHash,
          pairedDeviceId,
          publishedAt,
        },
      });
      return { contextHash: row.contextHash, publishedAt: row.publishedAt.toISOString(), reused: false };
    }, { isolationLevel: "Serializable" });
  }

  async findForPlan(scope, plan) {
    const athleteId = assertAthleteScope(scope);
    const parsedPlan = trainingPlanSchema.parse(plan);
    assertAthleteOwnership(scope, parsedPlan.athleteId);
    const row = await this.#prisma.trainingPlanGoalContextProjection.findUnique({
      where: { athleteId_planId: { athleteId, planId: parsedPlan.id } },
    });
    if (!row) return null;
    const result = toProjection(row);
    if (row.athleteId !== athleteId
      || row.planId !== parsedPlan.id
      || row.planVersion !== parsedPlan.version
      || row.goalId !== parsedPlan.goalId
      || row.goalRevision !== parsedPlan.goalRevision
      || row.approvalContentHash !== parsedPlan.approval.contentHash
      || !sameJson(result.milestones, parsedPlan.milestones ?? [])) {
      throw new TrainingPlanGoalContextUnavailableError();
    }
    return result;
  }
}

function toProjection(row) {
  const goal = settledGoalSchema.parse(row.goal);
  const milestones = raceMilestoneSchema.array().max(12).parse(row.milestones);
  if (goal.id !== row.goalId || goal.revision !== row.goalRevision || goal.athleteId !== row.athleteId) {
    throw new TrainingPlanGoalContextUnavailableError();
  }
  const hashInput = {
    athleteId: row.athleteId,
    planId: row.planId,
    planVersion: row.planVersion,
    goalId: row.goalId,
    goalRevision: row.goalRevision,
    approvalContentHash: row.approvalContentHash,
    goal,
    milestones,
  };
  if (calculatePlanGoalContextHash(hashInput) !== row.contextHash) throw new TrainingPlanGoalContextUnavailableError();
  return {
    goal: goalContextGoalSchema.parse({
      id: goal.id,
      athleteId: goal.athleteId,
      revision: goal.revision,
      title: goal.title,
      why: goal.why,
      target: goal.target,
    }),
    milestones,
    contextHash: row.contextHash,
    publishedAt: row.publishedAt.toISOString(),
  };
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
