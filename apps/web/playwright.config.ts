import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import {
  e2eDatabasePath,
  e2eExchangePath,
  e2eRepositoryRoot,
  e2eRoot,
  e2eSnapshotPath,
  e2eVaultPath,
} from "./e2e/fixture-paths.ts";

const port = 3311;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // Other specs have their own online, Coach, authentication or seeded fixture configuration.
  testMatch: ["activity-split-comparison.spec.ts", "dashboard-brand.spec.ts", "digital-coach.spec.ts", "road-to-comrades.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(e2eRoot, "test-results"),
  reporter: [["list"], ["json", { outputFile: path.join(e2eRoot, "results", "local.json") }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
  }],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    cwd: path.join(e2eRepositoryRoot, "apps", "web"),
    url: baseURL,
    reuseExistingServer: process.env.RACEPREDICTOR_E2E_REUSE_SERVER === "1",
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      RACEPREDICTOR_MILESTONE_HOME_ENABLED: "false",
      RACEPREDICTOR_CLOUD_MODE: "disabled",
      RACEPREDICTOR_NEXT_DIST_DIR: `.next-e2e-local-${process.env.RACEPREDICTOR_E2E_RUN_ID}`,
      RACEPREDICTOR_ATHLETE_ID: "e2e_athlete",
      RACEPREDICTOR_DATABASE_PATH: e2eDatabasePath,
      RACEPREDICTOR_DASHBOARD_SNAPSHOT: e2eSnapshotPath,
      RACEPREDICTOR_COACH_EXCHANGE_PATH: e2eExchangePath,
      RACEPREDICTOR_VAULT_PATH: e2eVaultPath,
      RACEPREDICTOR_DATA_SOURCE: process.env.RACEPREDICTOR_DATA_SOURCE ?? "local",
      RACEPREDICTOR_UTC_OFFSET: "+02:00",
    },
  },
});
