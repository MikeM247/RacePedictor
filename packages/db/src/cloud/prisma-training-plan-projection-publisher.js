import { trainingPlanSchema } from "../../../core/src/contracts/coaching.ts";
import { assertAthleteOwnership, assertAthleteScope } from "./athlete-scope.js";
import {
  appendPlanSyncChanges,
  parsePlanProjection,
  retireApprovedPlan,
  seedPlanSessionProjections,
} from "./training-plan-projection-lifecycle.js";

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
      const occurredAt = this.#now();
      let retiredPlan = null;
      if (plan.status === "active") {
        const activeRows = await transaction.trainingPlanProjection.findMany({
          where: { athleteId, active: true },
          orderBy: [{ planVersion: "desc" }, { planId: "desc" }],
          take: 2,
        });
        if (activeRows.length > 1) throw new TrainingPlanProjectionConflictError();
        if (activeRows[0]) {
          try {
            retiredPlan = retireApprovedPlan(parsePlanProjection(activeRows[0], athleteId), occurredAt);
          } catch {
            throw new TrainingPlanProjectionConflictError();
          }
          await transaction.trainingPlanProjection.update({
            where: { id: activeRows[0].id },
            data: { active: false, planStatus: "retired", plan: retiredPlan },
          });
        }
      }
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
      await seedPlanSessionProjections(transaction, athleteId, plan);
      await appendPlanSyncChanges(
        transaction,
        athleteId,
        retiredPlan ? [retiredPlan, plan] : [plan],
        occurredAt,
        plan.id,
      );
      return { plan, reused: false };
    }, { isolationLevel: "Serializable" });
  }
}
