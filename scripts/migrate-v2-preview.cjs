"use strict";
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { readdirSync, readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");

(async () => {
  const root = path.resolve(__dirname, "..");
  const { readPreviewDatabaseOverride } = await import(pathToFileURL(path.join(root, "packages/db/src/cloud/preview-database-configuration.js")));
  const preview = readPreviewDatabaseOverride();
  if (!preview) throw new Error("REQUIRES_WORK_PREVIEW");
  const appRequire = createRequire(path.join(root, "apps/web/package.json"));
  const cli = appRequire.resolve("prisma/build/index.js");
  const env = { ...process.env, DATABASE_URL: preview.url, DATABASE_URL_UNPOOLED: preview.directUrl };
  const run = (command) => execFileSync(process.execPath, [cli, "migrate", command, "--schema", path.join(root, "packages/db/prisma/schema.prisma")], { env, encoding: "utf8", stdio: "pipe", timeout: 120_000 });
  const baselineOnly = new Set(["20261018120000_milestone_lifecycle", "20261019130000_milestone_reconciliation_jobs"]);
  try { run("status"); } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}`;
    if (error.status !== 1 || /P\d{4}/.test(output) || !["20261022120000_v2_coach_conversations", ...baselineOnly].some((name) => output.includes(name))) throw new Error("PREVIEW_MIGRATION_STATUS_FAILED");
  }
  run("deploy");
  run("generate");
  const { PrismaClient } = appRequire("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: preview.directUrl } } });
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"');
    const migrations = path.join(root, "packages/db/prisma/migrations");
    const local = readdirSync(migrations, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name);
    for (const name of local) {
      const checksum = createHash("sha256").update(readFileSync(path.join(migrations, name, "migration.sql"))).digest("hex");
      if (!rows.some((row) => row.migration_name === name && row.checksum === checksum && row.finished_at && !row.rolled_back_at)) throw new Error("APPLIED_MIGRATION_MISMATCH");
    }
    if (rows.some((row) => !local.includes(row.migration_name) && !baselineOnly.has(row.migration_name))) throw new Error("UNEXPECTED_BASELINE_MIGRATION");
    console.log(`[preview-migration] Prisma deploy passed; all ${local.length} checked-in checksums match the dedicated database ledger. Source-baseline entries retained.`);
  } finally { await prisma.$disconnect(); }
})().catch(() => {
  // Prisma errors can contain connection details: do not print child output.
  console.error("[preview-migration] Failed; inspect the isolated preview migration history. No connection details logged.");
  process.exitCode = 1;
});
