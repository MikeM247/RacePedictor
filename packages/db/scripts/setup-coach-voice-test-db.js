import { copyFileSync, existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const envFile = new URL("../.env.test.local", import.meta.url);
if (!existsSync(envFile)) copyFileSync(new URL("../.env.test.local.example", import.meta.url), envFile);
loadEnvFile(envFile);
const url = process.env.COACH_VOICE_TEST_DATABASE_URL;
const parsed = new URL(url);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
    || parsed.port !== "55432" || parsed.pathname !== "/racepredictor_voice_test"
    || !["postgresql:", "postgres:"].includes(parsed.protocol)) {
  throw new Error("Voice-test setup only migrates the disposable loopback database racepredictor_voice_test on port 55432.");
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: packageRoot, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("docker", ["compose", "-f", "compose.voice-test.yml", "up", "-d", "--wait"]);
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const testEnv = { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url };
run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", "prisma/schema.prisma"], testEnv);
run(process.execPath, [prismaCli, "generate", "--schema", "prisma/schema.prisma"], testEnv);
console.log("Disposable voice-test PostgreSQL is ready. Run npm run db:test:voice from the repository root.");
