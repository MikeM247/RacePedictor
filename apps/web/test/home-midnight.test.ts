import test from "node:test";
import assert from "node:assert/strict";
import { millisecondsUntilLocalMidnight } from "../lib/home-midnight.ts";
import { milestoneHomeEnabled } from "../lib/server/milestone-home-feature.ts";
test("midnight refresh follows the saved timezone and the 25-hour DST day", () => {
  const almostMidnight = millisecondsUntilLocalMidnight(
    "Africa/Johannesburg",
    new Date("2026-10-30T21:59:59Z"),
  );
  assert.ok(almostMidnight >= 1000 && almostMidnight < 1250);
  const fallBack = millisecondsUntilLocalMidnight(
    "America/New_York",
    new Date("2026-11-01T04:00:00Z"),
  );
  assert.ok(fallBack >= 25 * 3600000 && fallBack < 25 * 3600000 + 250);
});
test("one switch defaults off for Home, image UI, image API and device API", () => {
  assert.equal(milestoneHomeEnabled({}), false);
  assert.equal(
    milestoneHomeEnabled({ RACEPREDICTOR_MILESTONE_HOME_ENABLED: "false" }),
    false,
  );
  assert.equal(
    milestoneHomeEnabled({ RACEPREDICTOR_MILESTONE_HOME_ENABLED: "true" }),
    true,
  );
});
