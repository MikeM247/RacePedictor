import { ScheduledReconciliationService } from "../../../../packages/core/src/use-cases/scheduled-reconciliation.ts";
import {
  getCloudPrismaClient,
  PrismaOperationalUsageRepository,
  PrismaReconciliationScopeRepository,
} from "../../../../packages/db/src/cloud/index.js";
import { assertServerRuntime } from "./server-runtime.ts";
import { getStravaIngestionComposition } from "./strava/ingestion-composition.ts";

assertServerRuntime("operational-composition");

let singleton: ReturnType<typeof buildComposition> | undefined;

function buildComposition() {
  const prisma = getCloudPrismaClient();
  const usage = new PrismaOperationalUsageRepository({ prisma });
  const scopes = new PrismaReconciliationScopeRepository({ prisma });
  const ingestion = getStravaIngestionComposition();
  return Object.freeze({
    usage,
    reconciliation: new ScheduledReconciliationService({
      listConnectedAthleteIds: (limit) => scopes.listConnectedAthleteIds(limit),
      processor: ingestion.processor,
      readUsage: () => usage.readUsage(),
      now: () => new Date(),
    }),
  });
}

export function getOperationalComposition() {
  singleton ??= buildComposition();
  return singleton;
}
