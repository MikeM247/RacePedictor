import { PrismaClient } from "@prisma/client";
import { readPreviewDatabaseOverride } from "./preview-database-configuration.js";

const clientKey = "__racePredictorCloudPrismaClient";

export function getCloudPrismaClient() {
  if (!globalThis[clientKey]) {
    const preview = readPreviewDatabaseOverride();
    globalThis[clientKey] = new PrismaClient(preview ? {
      datasources: { db: { url: preview.url } },
    } : undefined);
  }
  return globalThis[clientKey];
}
