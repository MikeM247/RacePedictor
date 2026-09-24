import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { e2eRepositoryRoot, e2eRoot } from "./e2e/fixture-paths.ts";

const port = 3312;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["online-dashboard.spec.ts", "redesign-coverage.spec.ts", "redesign-home.spec.ts", "redesign-readiness.spec.ts", "f08-recovery.spec.ts", "redesign-training-detail.spec.ts", "redesign-review-consistency.spec.ts", "redesign-responsive.spec.ts", "redesign-accessibility.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(e2eRoot, "online-test-results"),
  reporter: [["list"], ["json", { outputFile: path.join(e2eRoot, "results", "online.json") }]],
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
      RACEPREDICTOR_NEXT_DIST_DIR: `.next-e2e-online-${process.env.RACEPREDICTOR_E2E_RUN_ID}`,
      RACEPREDICTOR_DATA_SOURCE: "online-fixture",
    },
  },
});
