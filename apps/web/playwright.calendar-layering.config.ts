import { defineConfig } from "@playwright/test";
import online from "./playwright.online.config.ts";

const webServer = online.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error("Expected one online fixture server");

export default defineConfig({
  ...online,
  testMatch: ["home-calendar-companion.spec.ts", "calendar-month-summary.spec.ts"],
  grep: /shared calendar overlays|calendar-month-summary/,
  projects: online.projects?.map((project) => ({
    ...project,
    metadata: { ...project.metadata, calendarMonthSummary: true },
  })),
  webServer: {
    ...webServer,
    env: {
      ...webServer.env,
      RACEPREDICTOR_CALENDAR_MONTH_SUMMARY_ENABLED: "true",
    },
  },
});
