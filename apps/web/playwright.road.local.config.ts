import path from "node:path";
import home from "./playwright.home.local.config.ts";
import { e2eRoot } from "./e2e/fixture-paths.ts";

export default {
  ...home,
  testMatch: ["road-to-comrades.spec.ts"],
  outputDir: path.join(e2eRoot, "road-test-results"),
  reporter: [["list"]],
};
