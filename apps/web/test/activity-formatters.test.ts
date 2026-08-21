import assert from "node:assert/strict";
import test from "node:test";
import {
  formatActivityDate,
  formatDistance,
  formatDuration,
  formatPace,
  sportLabel,
} from "../lib/activity-formatters.ts";

test("formats activity values for the training list", () => {
  assert.equal(formatActivityDate("2026-08-02 06:14:12", "2026-08-02T04:14:12.000Z"), "02 Aug 2026 · 06:14");
  assert.equal(formatDistance(10005), "10.01 km");
  assert.equal(formatDuration(3669), "1:01:09");
  assert.equal(formatDuration(1799), "29:59");
  assert.equal(formatPace(366.4), "6:06/km");
  assert.equal(formatPace(null), "—");
  assert.equal(sportLabel("trail_run"), "Trail Run");
});
