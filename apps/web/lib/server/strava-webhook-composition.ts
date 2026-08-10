import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/index.js";
import { PrismaWebhookReceiptRepository } from "../../../../packages/db/src/cloud/prisma-webhook-receipt-repository.js";
import { R2RawObjectStore } from "../../../../packages/db/src/cloud/r2-raw-object-store.js";
import { StravaWebhookReceiptService } from "../../../../packages/core/src/use-cases/strava-webhook-receipt.ts";
import { CloudEnvironmentError, readCloudEnvironment } from "./cloud-environment.ts";
import { assertServerRuntime } from "./server-runtime.ts";
import { getStravaIngestionComposition } from "./strava/ingestion-composition.ts";

assertServerRuntime("strava-webhook-composition");

let cachedService: StravaWebhookReceiptService | undefined;

export function getStravaWebhookVerificationToken() {
  return requiredValue("STRAVA_WEBHOOK_VERIFY_TOKEN", process.env.STRAVA_WEBHOOK_VERIFY_TOKEN);
}

export function getStravaWebhookReceiptService() {
  if (cachedService) return cachedService;
  const environment = readCloudEnvironment();
  if (environment.cloudMode !== "enabled" || !environment.features.stravaIngestion) {
    throw new CloudEnvironmentError("Strava webhook receipt is disabled");
  }

  const prisma = getCloudPrismaClient();
  const receiptRepository = new PrismaWebhookReceiptRepository({ prisma });
  const rawObjectStore = new R2RawObjectStore({
    bucket: requiredValue("R2_BUCKET", process.env.R2_BUCKET),
    endpoint: requiredValue("R2_ENDPOINT", process.env.R2_ENDPOINT),
    accessKeyId: requiredValue("R2_ACCESS_KEY_ID", process.env.R2_ACCESS_KEY_ID),
    secretAccessKey: requiredValue("R2_SECRET_ACCESS_KEY", process.env.R2_SECRET_ACCESS_KEY),
  });
  const expectedSubscriptionId = positiveInteger(
    "STRAVA_WEBHOOK_SUBSCRIPTION_ID",
    process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID,
  );
  cachedService = new StravaWebhookReceiptService({
    receiptRepository,
    rawObjectStore,
    expectedSubscriptionId,
    jobScheduler: { schedule: getStravaIngestionComposition().schedule },
  });
  return cachedService;
}

function requiredValue(name: string, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 1024) throw new CloudEnvironmentError(`${name} is not configured`);
  return normalized;
}

function positiveInteger(name: string, value: string | undefined) {
  const normalized = requiredValue(name, value);
  if (!/^[1-9][0-9]*$/.test(normalized)) throw new CloudEnvironmentError(`${name} is invalid`);
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) throw new CloudEnvironmentError(`${name} is invalid`);
  return parsed;
}
