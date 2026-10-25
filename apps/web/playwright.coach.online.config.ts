import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { e2eRepositoryRoot, e2eRoot } from "./e2e/fixture-paths.ts";

const port = 3315;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "coach-chat.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(e2eRoot, "coach-online-test-results"),
  reporter: [["list"], ["json", { outputFile: path.join(e2eRoot, "results", "coach-online.json") }]],
  use: { baseURL, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    cwd: path.join(e2eRepositoryRoot, "apps", "web"),
    url: baseURL,
    reuseExistingServer: process.env.RACEPREDICTOR_E2E_REUSE_SERVER === "1",
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      RACEPREDICTOR_NEXT_DIST_DIR: `.next-e2e-coach-${process.env.RACEPREDICTOR_E2E_RUN_ID ?? "local"}`,
      RACEPREDICTOR_DATA_SOURCE: "online-fixture",
      DATABASE_URL: "postgresql://e2e:e2e@127.0.0.1:1/e2e?connect_timeout=1",
      RACEPREDICTOR_CLOUD_MODE: "enabled",
      RACEPREDICTOR_COACH_UI_ENABLED: "true",
      RACEPREDICTOR_COACH_CHAT_ENABLED: "true",
      RACEPREDICTOR_E2E_OWNER_AUTH_ENABLED: "true",
    },
  },
});
