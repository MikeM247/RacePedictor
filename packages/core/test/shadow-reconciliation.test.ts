import assert from "node:assert/strict";
import test from "node:test";
import { reconcileShadowActivities, type ShadowActivity } from "../src/services/shadow-reconciliation.ts";

test("representative Strava and CSV/GPX shadow records reconcile identity, timing, distance, duration, splits, and weeks", () => {
  const provider = [activity("strava-1", "source-1", "hash-1", "2026-08-03T06:00:00.000Z"), activity("strava-2", "source-2", "hash-2", "2026-08-05T06:00:00.000Z")];
  const local = [
    activity("csv-1", "source-1", "hash-1", "2026-08-03T06:00:02.000Z", { distanceM: 5_010 }),
    activity("gpx-2", "source-2", "hash-2", "2026-08-05T06:00:01.000Z", { distanceM: 5_005 }),
  ];
  const result = reconcileShadowActivities({ provider, local });
  assert.deepEqual(result.counts, { requested: 2, fetched: 2, retained: 2, normalized: 2, duplicate: 0, ambiguous: 0, rejected: 0, failed: 0 });
  assert.equal(result.releaseCandidateBlocked, false);
  assert.deepEqual(result.discrepancies, []);
});

test("every missing, ambiguous, duplicate, metric, split, and weekly discrepancy is an explicit release block", () => {
  const provider = [
    activity("missing", "missing", "missing", "2026-08-03T06:00:00.000Z"),
    activity("ambiguous", null, "shared", "2026-08-04T06:00:00.000Z"),
    activity("metric", "metric", "metric", "2026-08-05T06:00:00.000Z"),
    activity("duplicate", "metric", "metric-duplicate", "2026-08-05T06:00:00.000Z"),
  ];
  const local = [
    activity("shared-1", null, "shared", "2026-08-04T06:00:00.000Z"),
    activity("shared-2", null, "shared", "2026-08-04T06:00:00.000Z"),
    activity("metric-local", "metric", "metric", "2026-08-05T06:01:00.000Z", { distanceM: 6_000, elapsedTimeS: 1_900, splitCount: 4 }),
  ];
  const result = reconcileShadowActivities({ provider, local });
  assert.equal(result.releaseCandidateBlocked, true);
  assert.ok(result.discrepancies.length >= 6);
  assert.equal(result.discrepancies.every((item) => item.releaseBlock), true);
  assert.deepEqual(new Set(result.discrepancies.map((item) => item.code)), new Set([
    "MISSING_LOCAL_MATCH", "AMBIGUOUS_LOCAL_MATCH", "DUPLICATE_PROVIDER_MATCH", "TIMING_MISMATCH", "DISTANCE_MISMATCH",
    "DURATION_MISMATCH", "SPLIT_COUNT_MISMATCH", "WEEKLY_AGGREGATE_MISMATCH",
  ]));
});

function activity(id: string, sourceActivityId: string | null, dedupeHash: string, occurredAt: string, overrides: Partial<ShadowActivity> = {}): ShadowActivity {
  return { id, sourceActivityId, dedupeHash, occurredAt, distanceM: 5_000, elapsedTimeS: 1_800, splitCount: 5, ...overrides };
}
