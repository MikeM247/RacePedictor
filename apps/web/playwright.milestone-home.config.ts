import { defineConfig } from "@playwright/test";
import path from "node:path";
import { tmpdir } from "node:os";
const baseURL =
  process.env.MILESTONE_HOME_TEST_BASE_URL ?? "http://127.0.0.1:3318";
process.env.MILESTONE_HOME_TEST_DB ??= path.join(
  tmpdir(),
  "racepredictor-milestone-home-test",
  "local.sqlite",
);
export default defineConfig({
  testDir: "./e2e",
  testMatch: "milestone-home.spec.ts",
  globalSetup: "./e2e/milestone-home-setup.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: path.join(tmpdir(), "milestone-home-playwright-results"),
  use: {
    baseURL,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: process.env.MILESTONE_HOME_TEST_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3318",
        url: baseURL,
        timeout: 120000,
        reuseExistingServer: false,
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          RACEPREDICTOR_CLOUD_MODE: "disabled",
          RACEPREDICTOR_DATA_SOURCE: "online-fixture",
          RACEPREDICTOR_COACH_UI_ENABLED: "true",
          RACEPREDICTOR_MILESTONE_HOME_ENABLED: "true",
          RACEPREDICTOR_DATABASE_PATH: process.env.MILESTONE_HOME_TEST_DB,
          RACEPREDICTOR_ATHLETE_ID: "milestone_qa",
        },
      },
});
