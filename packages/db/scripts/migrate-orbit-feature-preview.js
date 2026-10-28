import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { readOrbitFeaturePreviewDatabaseOverride } from "../src/cloud/orbit-feature-preview-database-configuration.js";

if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "codex/orbit-post-run-review") {
  throw new Error("ORBIT preview migrations require the feature-branch Vercel Preview environment");
}
const database = readOrbitFeaturePreviewDatabaseOverride();
if (!database) throw new Error("ORBIT isolated feature-preview database is required");
for (const key of ["AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "RACEPREDICTOR_OWNER_AUTH_CONFIGURED", "RACEPREDICTOR_OWNER_AUTH_SUBJECT", "RACEPREDICTOR_OWNER_ATHLETE_ID", "RACEPREDICTOR_ORBIT_PREVIEW_ORIGIN"]) {
  if (!process.env[key]?.trim()) throw new Error(`Required ORBIT preview setting missing: ${key}`);
}
let origin;
try { origin = new URL(process.env.RACEPREDICTOR_ORBIT_PREVIEW_ORIGIN); } catch { throw new Error("ORBIT preview origin must be a valid HTTPS origin"); }
if (origin.protocol !== "https:" || origin.origin !== process.env.AUTH_URL) throw new Error("ORBIT preview OAuth origin does not match the configured stable origin");
if (process.env.RACEPREDICTOR_STRAVA_INGESTION_ENABLED !== "false" || process.env.RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED !== "false") throw new Error("ORBIT preview ingestion and Second Brain sync must be disabled");

const root = fileURLToPath(new URL("../../../", import.meta.url));
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../node_modules/prisma/build/index.js", import.meta.url)), "migrate", "deploy", "--schema", "packages/db/prisma/schema.prisma"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: database.url, DATABASE_URL_UNPOOLED: database.directUrl },
  stdio: "inherit",
});
if (result.error) throw new Error("ORBIT feature-preview migration command could not start");
if (result.status !== 0) process.exit(result.status ?? 1);

const prisma = new PrismaClient({ datasources: { db: { url: database.directUrl } } });
try {
  const migration = await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '20261028120000_orbit_post_run_review' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  if (migration.length !== 1) throw new Error("ORBIT migration was not recorded as applied");
  for (const table of ["coach_run_review_activations", "activity_run_review_states", "coach_run_review_offers", "activity_reflection_mutations"]) {
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 0`);
  }
  console.log("Verified ORBIT migration and isolated feature-preview tables.");
} finally { await prisma.$disconnect(); }
