import { trainingPlanSchema } from "../../../core/src/contracts/coaching.ts";
import { assertAthleteScope } from "./athlete-scope.js";

const MAX_PLAN_HISTORY = 100;

export class CloudCoachingProjectionError extends Error {
  constructor() {
    super("The cloud coaching projection is inconsistent");
    this.name = "CloudCoachingProjectionError";
    this.code = "INCONSISTENT_PROJECTION";
  }
}
export class PrismaCloudCoachingRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.trainingPlanProjection) throw new Error("A Prisma cloud coaching client is required");
    this.#prisma = prisma;
  }

  async getActivePlan(scope) {
    const athleteId = assertAthleteScope(scope);
    const rows = await this.#prisma.trainingPlanProjection.findMany({
      where: { athleteId, active: true },
      orderBy: [{ planVersion: "desc" }, { planId: "desc" }],
      take: 2,
      select: projectionSelect,
    });
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new CloudCoachingProjectionError();
    const plan = parseProjection(rows[0], athleteId);
    if (plan.status !== "active") throw new CloudCoachingProjectionError();
    return plan;
  }

  async listHistory(scope) {
    const athleteId = assertAthleteScope(scope);
    const rows = await this.#prisma.trainingPlanProjection.findMany({
      where: { athleteId, planStatus: { in: ["active", "retired"] } },
      orderBy: [{ planVersion: "desc" }, { planId: "desc" }],
      take: MAX_PLAN_HISTORY,
      select: projectionSelect,
    });
    return rows.map((row) => parseProjection(row, athleteId));
  }

  async findPlan(scope, planId) {
    const athleteId = assertAthleteScope(scope);
    const normalizedPlanId = typeof planId === "string" ? planId.trim() : "";
    if (!normalizedPlanId) return null;
    const row = await this.#prisma.trainingPlanProjection.findUnique({
      where: { athleteId_planId: { athleteId, planId: normalizedPlanId } },
      select: projectionSelect,
    });
    return row ? parseProjection(row, athleteId) : null;
  }
}

const projectionSelect = {
  athleteId: true,
  planId: true,
  planVersion: true,
  planStatus: true,
  active: true,
  contentHash: true,
  plan: true,
};

function parseProjection(row, athleteId) {
  const result = trainingPlanSchema.safeParse(row.plan);
  if (!result.success) throw new CloudCoachingProjectionError();
  const plan = result.data;
  if (row.athleteId !== athleteId
    || plan.athleteId !== athleteId
    || plan.id !== row.planId
    || plan.version !== row.planVersion
    || plan.status !== row.planStatus
    || plan.approval.contentHash !== row.contentHash
    || row.active !== (plan.status === "active")) {
    throw new CloudCoachingProjectionError();
  }
  return plan;
}
