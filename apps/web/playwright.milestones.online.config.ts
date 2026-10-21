import path from "node:path";
import online from "./playwright.online.config.ts";
import { e2eRoot } from "./e2e/fixture-paths.ts";

export default { ...online, testMatch: ["milestone-online-handoff.spec.ts"], outputDir: path.join(e2eRoot, "milestone-online-test-results"), reporter: [["list"]] };
