import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { readPreviewDatabaseOverride } from "../src/cloud/preview-database-configuration.js";

// This release command must never fall back to integration-injected production URLs.
if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "work") {
  throw new Error("Coach staging migration requires the Vercel Preview work branch");
}
const preview = readPreviewDatabaseOverride();
if (!preview) throw new Error("Isolated staging database configuration is required");
const required = ["AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "RACEPREDICTOR_OWNER_AUTH_CONFIGURED", "RACEPREDICTOR_OWNER_AUTH_SUBJECT", "RACEPREDICTOR_OWNER_ATHLETE_ID"];
for (const key of required) if (!process.env[key]?.trim()) throw new Error(`Required staging variable missing: ${key}`);
if (process.env.AUTH_URL !== "https://racepedictor-road-to-comrades.vercel.app") throw new Error("Unexpected staging authentication origin");
if (process.env.RACEPREDICTOR_STRAVA_INGESTION_ENABLED !== "false" || process.env.RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED !== "false") throw new Error("Staging ingestion and Second Brain publication must remain disabled");

console.log("Verified Preview/work isolation, authentication variables and disabled background ingestion.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../node_modules/prisma/build/index.js", import.meta.url)), "migrate", "deploy", "--schema", "packages/db/prisma/schema.prisma"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: preview.url, DATABASE_URL_UNPOOLED: preview.directUrl },
  stdio: "inherit",
});
if (result.error) throw new Error("Staging migration command could not start");
if (result.status !== 0) process.exit(result.status ?? 1);

const prisma = new PrismaClient({ datasources: { db: { url: preview.directUrl } } });
try {
  const migration = await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '20261025180000_coach_conversation_archives' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  if (migration.length !== 1) throw new Error("Archive migration was not recorded as applied");
  await prisma.$queryRaw`SELECT "id" FROM "coach_conversation_archives" LIMIT 0`;
  const voiceMigration = await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '20261028160000_coach_voice_usage' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  if (voiceMigration.length !== 1) throw new Error("Voice usage migration was not recorded as applied");
  await prisma.$queryRaw`SELECT "id" FROM "coach_voice_usage_buckets" LIMIT 0`;
  await prisma.$queryRaw`SELECT "id" FROM "coach_voice_attempts" LIMIT 0`;
  console.log("Verified coach archive and voice usage migrations on the isolated staging database.");
} finally { await prisma.$disconnect(); }
