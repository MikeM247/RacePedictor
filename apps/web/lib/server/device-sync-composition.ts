import { PairedDeviceService } from "../../../../packages/core/src/use-cases/paired-device.ts";
import {
  getCloudPrismaClient,
  PrismaPairedDeviceRepository,
  PrismaSecondBrainSnapshotRepository,
  PrismaSyncChangeRepository,
  PrismaTrainingPlanProjectionPublisher,
  PrismaTrainingPlanGoalContextRepository,
  PrismaOperationalUsageRepository,
  PrismaActivityReviewRepository,
  PrismaAthleteFeedbackRepository,
  PrismaCloudActivityRepository,
  PrismaAthleteJournalRepository,
} from "../../../../packages/db/src/cloud/index.js";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("device-sync-composition");

let singleton: ReturnType<typeof buildComposition> | undefined;

function buildComposition() {
  const prisma = getCloudPrismaClient();
  const devices = new PrismaPairedDeviceRepository({ prisma });
  return Object.freeze({
    devices,
    deviceService: new PairedDeviceService({ repository: devices }),
    changes: new PrismaSyncChangeRepository({ prisma }),
    snapshots: new PrismaSecondBrainSnapshotRepository({ prisma }),
    plans: new PrismaTrainingPlanProjectionPublisher({ prisma }),
    goalContexts: new PrismaTrainingPlanGoalContextRepository({ prisma }),
    usage: new PrismaOperationalUsageRepository({ prisma }),
    activityReviews: new PrismaActivityReviewRepository({ prisma }),
    athleteFeedback: new PrismaAthleteFeedbackRepository({ prisma }),
    activities: new PrismaCloudActivityRepository({ prisma }),
    journal: new PrismaAthleteJournalRepository({ prisma }),
  });
}

export function getDeviceSyncComposition() {
  singleton ??= buildComposition();
  return singleton;
}
