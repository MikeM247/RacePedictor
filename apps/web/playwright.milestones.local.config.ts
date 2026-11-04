import path from "node:path";
import home from "./playwright.home.local.config.ts";
import { e2eRoot } from "./e2e/fixture-paths.ts";
const homeWebServer = home.webServer as { command: string; env: NodeJS.ProcessEnv };

export default {
  ...home,
  webServer: {
    ...homeWebServer,
    env: { ...homeWebServer.env, RACEPREDICTOR_MILESTONE_HOME_ENABLED: "true" },
  },
  testMatch: ["milestone-management.spec.ts", "milestone-timeline.spec.ts"],
  globalSetup: "./e2e/milestone-local-fixture.mjs",
  outputDir: path.join(e2eRoot, "milestone-test-results"),
  reporter: [["list"]],
};
