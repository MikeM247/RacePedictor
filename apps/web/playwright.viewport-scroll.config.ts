import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { e2eRepositoryRoot, e2eRoot } from "./e2e/fixture-paths.ts";

const themes = [{ name: "legacy", enabled: "false", port: 3320 }, { name: "shared", enabled: "true", port: 3321 }];

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(e2eRoot, "viewport-scroll-results"),
  reporter: [["list"]],
  use: {
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: themes.flatMap(({ name, port }) => [
    { name, testMatch: name === "shared" ? ["viewport-scroll.spec.ts", "calendar-month-summary.spec.ts"] : ["viewport-scroll.spec.ts"], grepInvert: /@touch/, use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${port}` } },
    { name: `${name}-touch`, testMatch: "viewport-scroll.spec.ts", grep: /@touch/, use: { ...devices["Pixel 7"], baseURL: `http://127.0.0.1:${port}` } },
  ]),
  webServer: themes.map(({ name, enabled, port }) => ({
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    cwd: path.join(e2eRepositoryRoot, "apps", "web"),
    url: `http://127.0.0.1:${port}`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      RACEPREDICTOR_NEXT_DIST_DIR: `.next-e2e-scroll-${name}-${process.env.RACEPREDICTOR_E2E_RUN_ID}`,
      RACEPREDICTOR_DATA_SOURCE: "online-fixture",
      DATABASE_URL: "postgresql://e2e:e2e@127.0.0.1:1/e2e?connect_timeout=1",
      DATABASE_URL_UNPOOLED: "postgresql://e2e:e2e@127.0.0.1:1/e2e?connect_timeout=1",
      RACEPREDICTOR_CLOUD_MODE: "enabled",
      RACEPREDICTOR_E2E_OWNER_AUTH_ENABLED: "true",
      RACEPREDICTOR_COACH_UI_ENABLED: "true",
      RACEPREDICTOR_COACH_CHAT_ENABLED: "true",
      RACEPREDICTOR_MILESTONE_HOME_ENABLED: "false",
      RACEPREDICTOR_CALENDAR_MONTH_SUMMARY_ENABLED: enabled,
    },
  })),
});
