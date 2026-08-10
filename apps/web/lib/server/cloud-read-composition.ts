import {
  getCloudPrismaClient,
  PrismaCloudActivityRepository,
  PrismaCloudCoachingRepository,
  PrismaCloudDashboardRepository,
  PrismaOnlineStatusRepository,
  PrismaSyncChangeRepository,
} from "../../../../packages/db/src/cloud/index.js";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("cloud-read-composition");

let singleton: ReturnType<typeof buildComposition> | undefined;

function buildComposition() {
  const prisma = getCloudPrismaClient();
  return Object.freeze({
    activities: new PrismaCloudActivityRepository({ prisma }),
    coaching: new PrismaCloudCoachingRepository({ prisma }),
    dashboard: new PrismaCloudDashboardRepository({ prisma }),
    status: new PrismaOnlineStatusRepository({ prisma }),
    changes: new PrismaSyncChangeRepository({ prisma }),
  });
}

export function getCloudReadComposition() {
  singleton ??= buildComposition();
  return singleton;
}
