import { spawnSync } from "node:child_process";

if (!process.env.VERCEL) {
  console.log("Skipping runtime database migration outside Vercel.");
  process.exit(0);
}

const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
if (!runtimeDatabaseUrl) {
  throw new Error("DATABASE_URL is required for the Vercel runtime database migration");
}

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, [
  "prisma",
  "migrate",
  "deploy",
  "--schema",
  "../../packages/db/prisma/schema.prisma",
], {
  cwd: new URL("../../../apps/web/", import.meta.url),
  env: { ...process.env, DIRECT_URL: runtimeDatabaseUrl },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
