import { assertAthleteScope } from "./athlete-scope.js";
import {
  activateApprovedPlan,
  appendPlanSyncChanges,
  parsePlanProjection,
  retireApprovedPlan,
} from "./training-plan-projection-lifecycle.js";

export class TrainingPlanActivationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrainingPlanActivationError";
    this.code = code;
  }
}

export class PrismaTrainingPlanProjectionActivator {
  #prisma;
  #now;

  constructor({ prisma, now = () => new Date() }) {
    if (!prisma?.trainingPlanProjection || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma training-plan projection client is required");
    }
    this.#prisma = prisma;
    this.#now = now;
  }

  async activate(scope, planId, expectedActivePlanId) {
    const athleteId = assertAthleteScope(scope);
    if (scope.actor.credentialKind !== "session") {
      throw new TrainingPlanActivationError("SESSION_REQUIRED", "A signed-in owner session is required");
    }
    const normalizedPlanId = typeof planId === "string" ? planId.trim() : "";
    if (!normalizedPlanId) throw new TrainingPlanActivationError("PLAN_NOT_FOUND", "Approved plan version was not found");

    try {
      return await this.#prisma.$transaction(async (transaction) => {
        const candidateRow = await transaction.trainingPlanProjection.findUnique({
          where: { athleteId_planId: { athleteId, planId: normalizedPlanId } },
        });
        if (!candidateRow) {
          throw new TrainingPlanActivationError("PLAN_NOT_FOUND", "Approved plan version was not found");
        }
        const activeRows = await transaction.trainingPlanProjection.findMany({
          where: { athleteId, active: true },
          orderBy: [{ planVersion: "desc" }, { planId: "desc" }],
          take: 2,
        });
        if (activeRows.length > 1) {
          throw new TrainingPlanActivationError("INCONSISTENT_PROJECTION", "Approved plan state is inconsistent");
        }
        const currentRow = activeRows[0] ?? null;
        const currentPlanId = currentRow?.planId ?? null;
        if (currentPlanId !== expectedActivePlanId) {
          throw new TrainingPlanActivationError("PLAN_ACTIVATION_CONFLICT", "The active plan changed; reload before choosing again");
        }

        let candidate;
        try {
          candidate = parsePlanProjection(candidateRow, athleteId);
        } catch {
          throw new TrainingPlanActivationError("INCONSISTENT_PROJECTION", "Approved plan state is inconsistent");
        }
        if (candidate.status === "active") {
          if (currentPlanId !== candidate.id) {
            throw new TrainingPlanActivationError("INCONSISTENT_PROJECTION", "Approved plan state is inconsistent");
          }
          return { activePlan: candidate, retiredPlan: null, reused: true };
        }
        if (candidate.status !== "retired") {
          throw new TrainingPlanActivationError("PLAN_NOT_APPROVED", "Only an approved plan version can be activated");
        }

        const occurredAt = this.#now();
        let retiredPlan = null;
        if (currentRow) {
          try {
            retiredPlan = retireApprovedPlan(parsePlanProjection(currentRow, athleteId), occurredAt);
          } catch {
            throw new TrainingPlanActivationError("INCONSISTENT_PROJECTION", "Approved plan state is inconsistent");
          }
          await transaction.trainingPlanProjection.update({
            where: { id: currentRow.id },
            data: { active: false, planStatus: "retired", plan: retiredPlan },
          });
        }

        const activePlan = activateApprovedPlan(candidate, occurredAt);
        await transaction.trainingPlanProjection.update({
          where: { id: candidateRow.id },
          data: { active: true, planStatus: "active", plan: activePlan },
        });
        await appendPlanSyncChanges(
          transaction,
          athleteId,
          retiredPlan ? [retiredPlan, activePlan] : [activePlan],
          occurredAt,
          activePlan.id,
        );
        return { activePlan, retiredPlan, reused: false };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof TrainingPlanActivationError) throw error;
      if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
        throw new TrainingPlanActivationError("PLAN_ACTIVATION_CONFLICT", "The active plan changed; reload before choosing again");
      }
      throw error;
    }
  }
}
