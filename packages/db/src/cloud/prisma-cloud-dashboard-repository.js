import { buildCloudDashboard } from "../../../core/src/services/cloud-dashboard.ts";
import { assertAthleteScope } from "./athlete-scope.js";

import { aggregateWeeklyTraining, trainingWindow, DEFAULT_TRAINING_TIMEZONE, RUNNING_SPORTS } from "../../../core/src/services/weekly-training.ts";
import { PrismaCloudCoachingRepository } from "./prisma-cloud-coaching-repository.js";

const MAX_DASHBOARD_ACTIVITIES = 500;

export class PrismaCloudDashboardRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.activity || !prisma?.import) throw new Error("A Prisma cloud dashboard client is required");
    this.#prisma = prisma;
  }

  async getOverview(scope, generatedAt = new Date()) {
    const athleteId = assertAthleteScope(scope);
    const [activities, latestImport, weeklyTraining] = await Promise.all([
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
      this.#readWeeklyTraining(scope, generatedAt),
    ]);
    return { ...buildCloudDashboard({
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
    }), weeklyTraining };
  }

  async #readWeeklyTraining(scope, generatedAt) {
    const athleteId = assertAthleteScope(scope);
    let timezone = DEFAULT_TRAINING_TIMEZONE;
    try {
      if (this.#prisma.trainingPlanProjection) {
        const plan = await new PrismaCloudCoachingRepository({ prisma: this.#prisma }).getActivePlan(scope);
        timezone = plan?.timezone ?? timezone;
      }
    } catch { /* Training reads remain independent of goal availability. */ }
    const window = trainingWindow(generatedAt.toISOString(), timezone);
    try {
      // One date-bounded query with no row cap. The extra day at either edge
      // covers every IANA UTC offset; the aggregator applies exact local dates.
      const rows = await this.#prisma.activity.findMany({
        where: { athleteId, deletedAt: null, sport: { in: RUNNING_SPORTS }, occurredAt: {
          gte: new Date(Date.parse(window.windowStart) - 86_400_000),
          lt: new Date(Date.parse(window.windowEnd) + 86_400_000),
        } },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: { athleteId: true, occurredAt: true, sport: true, distanceM: true, elapsedTimeS: true, avgPaceSecPerKm: true, elevationGainM: true },
      });
      const number = value => value == null ? null : Number(value);
      return aggregateWeeklyTraining({ athleteId, generatedAt: window.generatedAt, timezone, activities: rows.map(row => ({
        ...row, occurredAt: row.occurredAt.toISOString(), distanceM: number(row.distanceM),
        elapsedTimeS: number(row.elapsedTimeS), avgPaceSecPerKm: number(row.avgPaceSecPerKm), elevationGainM: number(row.elevationGainM),
      })) });
    } catch {
      return { ...window, status: "unavailable", weeks: [] };
    }
  }
}
