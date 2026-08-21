import { PrismaClient } from "@prisma/client";

const clientKey = "__racePredictorCloudPrismaClient";

export function getCloudPrismaClient() {
  if (!globalThis[clientKey]) {
    globalThis[clientKey] = new PrismaClient();
  }
  return globalThis[clientKey];
}
