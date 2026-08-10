import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeterministicLocalCue,
  buildTargetCountdown,
  isIanaTimezone,
  localDateInIanaTimezone,
} from "../lib/today-coaching.ts";

test("resolves the local date across an IANA timezone boundary", () => {
  const instant = new Date("2026-08-05T22:30:00.000Z");
  assert.equal(localDateInIanaTimezone(instant, "Africa/Johannesburg"), "2026-08-06");
  assert.equal(localDateInIanaTimezone(instant, "America/Los_Angeles"), "2026-08-05");
  assert.equal(isIanaTimezone("Africa/Johannesburg"), true);
  assert.equal(isIanaTimezone("UTC+2"), false);
});

test("builds stable target countdown labels", () => {
  assert.deepEqual(buildTargetCountdown("2026-08-05", "2026-09-16"), { days: 42, label: "42 days to target" });
  assert.deepEqual(buildTargetCountdown("2026-08-05", "2026-08-05"), { days: 0, label: "Target day" });
  assert.deepEqual(buildTargetCountdown("2026-08-08", "2026-08-05"), { days: -3, label: "3 days past target" });
});

test("local cues are deterministic and preserve Phase 1 boundaries", () => {
  const first = buildDeterministicLocalCue("missed");
  const second = buildDeterministicLocalCue("missed");
  assert.equal(first, second);
  assert.match(first, /no plan change has been made/);
  assert.match(buildDeterministicLocalCue("upcoming", "Easy aerobic run"), /Easy aerobic run/);
});
