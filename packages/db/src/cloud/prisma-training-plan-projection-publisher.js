import { trainingPlanSchema } from "../../../core/src/contracts/coaching.ts";
import { assertAthleteOwnership, assertAthleteScope } from "./athlete-scope.js";

export class TrainingPlanProjectionConflictError extends Error {
  constructor() {
    super("Approved plan conflicts with its immutable projection");
    this.name = "TrainingPlanProjectionConflictError";
    this.code = "PLAN_PROJECTION_CONFLICT";
  }
}

export class PrismaTrainingPlanProjectionPublisher {
  #prisma;
  #now;

  constructor({ prisma, now = () => new Date() }) {
    if (!prisma?.trainingPlanProjection || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma training-plan projection client is required");
    }
    this.#prisma = prisma;
    this.#now = now;
  }

  async publishApproved(scope, value, pairedDeviceId) {
    const athleteId = assertAthleteScope(scope);
    const plan = trainingPlanSchema.parse(value);
    assertAthleteOwnership(scope, plan.athleteId);
    if (!["active", "retired"].includes(plan.status)) throw new Error("Only explicitly approved plans can be published");
    return this.#prisma.$transaction(async (transaction) => {
      const device = await transaction.pairedDevice.findUnique({
        where: { id_athleteId: { id: pairedDeviceId, athleteId } },
      });
      if (!device || device.status !== "active") throw new Error("Paired device is unavailable");
      const existing = await transaction.trainingPlanProjection.findUnique({
        where: { athleteId_planId: { athleteId, planId: plan.id } },
      });
      if (existing) {
        if (JSON.stringify(existing.plan) === JSON.stringify(plan)) return { plan, reused: true };
        throw new TrainingPlanProjectionConflictError();
      }
      if (plan.status === "active") {
        await transaction.trainingPlanProjection.updateMany({ where: { athleteId, active: true }, data: { active: false } });
      }
      const occurredAt = this.#now();
      await transaction.trainingPlanProjection.create({
        data: {
          athleteId,
          planId: plan.id,
          planVersion: plan.version,
          planStatus: plan.status,
          active: plan.status === "active",
          contentHash: plan.approval.contentHash,
          plan,
          publishedAt: occurredAt,
        },
      });
      let cursor = await nextCursor(transaction, athleteId);
      await transaction.syncChange.create({ data: {
        athleteId, cursor, entityType: "plan", entityId: plan.id, operation: "upsert",
        entityVersion: plan.revision, selectedFields: plan, occurredAt,
      } });
      for (const workout of plan.workouts) {
        cursor += 1n;
        await transaction.syncChange.create({ data: {
          athleteId, cursor, entityType: "calendar_session", entityId: workout.id, operation: "upsert",
          entityVersion: plan.revision, selectedFields: workout, occurredAt,
        } });
      }
      return { plan, reused: false };
    });
  }
}

async function nextCursor(transaction, athleteId) {
  const latest = await transaction.syncChange.aggregate({ where: { athleteId }, _max: { cursor: true } });
  return (latest._max.cursor ?? 0n) + 1n;
}
