import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { e2eDatabasePath, e2eExchangePath, e2eRepositoryRoot, e2eRoot, e2eSnapshotPath, e2eVaultPath } from "./e2e/fixture-paths.ts";

const port = 3313;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["redesign-readiness.spec.ts"],
  globalSetup: "./e2e/readiness-local-fixture.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(e2eRoot, "readiness-local-test-results"),
  reporter: [["list"], ["json", { outputFile: path.join(e2eRoot, "results", "readiness-local.json") }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
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
      RACEPREDICTOR_NEXT_DIST_DIR: `.next-e2e-readiness-local-${process.env.RACEPREDICTOR_E2E_RUN_ID}`,
      RACEPREDICTOR_ATHLETE_ID: "e2e_athlete",
      RACEPREDICTOR_DATABASE_PATH: e2eDatabasePath,
      RACEPREDICTOR_DASHBOARD_SNAPSHOT: e2eSnapshotPath,
      RACEPREDICTOR_COACH_EXCHANGE_PATH: e2eExchangePath,
      RACEPREDICTOR_VAULT_PATH: e2eVaultPath,
      RACEPREDICTOR_DATA_SOURCE: "local",
      RACEPREDICTOR_UTC_OFFSET: "+02:00",
    },
  },
});
