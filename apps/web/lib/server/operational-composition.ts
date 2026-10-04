import { ScheduledReconciliationService } from "../../../../packages/core/src/use-cases/scheduled-reconciliation.ts";
import {
  getCloudPrismaClient,
  PrismaOperationalUsageRepository,
  PrismaReconciliationScopeRepository,
} from "../../../../packages/db/src/cloud/index.js";
import { assertServerRuntime } from "./server-runtime.ts";
import { getStravaIngestionComposition } from "./strava/ingestion-composition.ts";
import { runCloudCoachFeedbackBatch } from "./activity-coach-worker.ts";
import { readCloudEnvironment } from "./cloud-environment.ts";

assertServerRuntime("operational-composition");

let singleton: ReturnType<typeof buildComposition> | undefined;

function buildComposition() {
  const prisma = getCloudPrismaClient();
  const usage = new PrismaOperationalUsageRepository({ prisma });
  const scopes = new PrismaReconciliationScopeRepository({ prisma });
  const ingestion = readCloudEnvironment().features.stravaIngestion
    ? getStravaIngestionComposition()
    : null;
  return Object.freeze({
    usage,
    reconciliation: new ScheduledReconciliationService({
      listConnectedAthleteIds: (limit) => scopes.listConnectedAthleteIds(limit),
      processor: ingestion?.processor ?? disabledProcessor,
      readUsage: () => usage.readUsage(),
      now: () => new Date(),
    }),
    coachFeedback: {
      async run(limit = 25) {
        const athletes = await scopes.listAthleteIds(limit);
        const results = [];
        for (const athleteId of athletes) results.push(await runCloudCoachFeedbackBatch({ athleteId, limit: 5 }));
        return results;
      },
    },
  });
}

const disabledProcessor = Object.freeze({
  async enqueueReconciliation() { return { jobId: "disabled", reused: true }; },
  async processNext() { return { state: "not_available" as const }; },
});

export function getOperationalComposition() {
  singleton ??= buildComposition();
  return singleton;
}
