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
  testIgnore: "online-dashboard.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(e2eRoot, "test-results"),
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    cwd: path.join(e2eRepositoryRoot, "apps", "web"),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
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
