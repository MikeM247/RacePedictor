import path from "node:path";
import home from "./playwright.home.local.config.ts";
import { e2eRoot } from "./e2e/fixture-paths.ts";

export default {
  ...home,
  testMatch: ["milestone-management.spec.ts"],
  globalSetup: "./e2e/milestone-local-fixture.mjs",
  outputDir: path.join(e2eRoot, "milestone-test-results"),
  reporter: [["list"]],
};
