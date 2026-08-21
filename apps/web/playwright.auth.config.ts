import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { e2eRepositoryRoot, e2eRoot } from "./e2e/fixture-paths.ts";

const port = 3313;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "owner-auth.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(e2eRoot, "auth-test-results"),
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    cwd: path.join(e2eRepositoryRoot, "apps", "web"),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      AUTH_SECRET: "",
      AUTH_GITHUB_ID: "",
      AUTH_GITHUB_SECRET: "",
      RACEPREDICTOR_CLOUD_MODE: "enabled",
      RACEPREDICTOR_OWNER_AUTH_CONFIGURED: "true",
      RACEPREDICTOR_OWNER_AUTH_SUBJECT: "github:59341274",
      RACEPREDICTOR_STRAVA_INGESTION_ENABLED: "false",
      RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED: "false",
    },
  },
});
