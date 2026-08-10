import { buildCloudDashboard } from "../../../core/src/services/cloud-dashboard.ts";
import { assertAthleteScope } from "./athlete-scope.js";

const MAX_DASHBOARD_ACTIVITIES = 500;

export class PrismaCloudDashboardRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.activity || !prisma?.import) throw new Error("A Prisma cloud dashboard client is required");
    this.#prisma = prisma;
  }

  async getOverview(scope, generatedAt = new Date()) {
    const athleteId = assertAthleteScope(scope);
    const [activities, latestImport] = await Promise.all([
      this.#prisma.activity.findMany({
        where: { athleteId, deletedAt: null },
        orderBy: { occurredAt: "desc" },
        take: MAX_DASHBOARD_ACTIVITIES,
        select: {
          id: true,
          athleteId: true,
          occurredAt: true,
          distanceM: true,
          elapsedTimeS: true,
        },
      }),
      this.#prisma.import.findFirst({
        where: { athleteId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          stagedCount: true,
          normalizedCount: true,
          duplicateCount: true,
          rejectedCount: true,
          updatedAt: true,
        },
      }),
    ]);
    return buildCloudDashboard({
      athleteId,
      activities: activities.map((activity) => ({
        id: activity.id,
        athleteId: activity.athleteId,
        occurredAt: activity.occurredAt.toISOString(),
        distanceM: Number(activity.distanceM),
        elapsedTimeS: activity.elapsedTimeS,
      })),
      latestImport: latestImport ? {
        importId: latestImport.id,
        status: latestImport.status,
        stagedCount: latestImport.stagedCount,
        normalizedCount: latestImport.normalizedCount,
        duplicateCount: latestImport.duplicateCount,
        rejectedCount: latestImport.rejectedCount,
        updatedAt: latestImport.updatedAt.toISOString(),
      } : null,
      generatedAt: generatedAt.toISOString(),
    });
  }
}
