import { getCloudPrismaClient, PrismaCloudActivityImportRepository, R2RawObjectStore } from "../../../../packages/db/src/cloud/index.js";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("activity-import-composition");

let singleton: ReturnType<typeof buildComposition> | undefined;

function buildComposition() {
  const prisma = getCloudPrismaClient();
  const objects = new R2RawObjectStore({
    bucket: required("R2_BUCKET"),
    endpoint: required("R2_ENDPOINT"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  });
  return Object.freeze({ imports: new PrismaCloudActivityImportRepository({ prisma, objects }) });
}

export function getActivityImportComposition() {
  singleton ??= buildComposition();
  return singleton;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value.length > 1024) throw new Error(`${name} is not configured`);
  return value;
}
