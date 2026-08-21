import assert from "node:assert/strict";
import test from "node:test";
import { dashboardFetchResultSchema } from "../src/contracts/dashboard.ts";
import { buildCloudDashboard } from "../src/services/cloud-dashboard.ts";

test("cloud dashboard builds deterministic live predictions and trends from athlete-scoped activities", () => {
  const generatedAt = "2026-08-10T12:00:00.000Z";
  const activities = [
    activity("run-1", "2026-07-20T06:00:00.000Z", 10_000, 3_600),
    activity("run-2", "2026-07-27T06:00:00.000Z", 8_000, 3_000),
    activity("run-3", "2026-08-03T06:00:00.000Z", 15_000, 5_700),
    activity("run-4", "2026-08-10T06:00:00.000Z", 5_000, 1_700),
    { ...activity("foreign", "2026-08-10T07:00:00.000Z", 5_000, 1_000), athleteId: "athlete-b" },
  ];
  const first = buildCloudDashboard({ athleteId: "athlete-a", activities, latestImport: null, generatedAt });
  const replay = buildCloudDashboard({ athleteId: "athlete-a", activities, latestImport: null, generatedAt });
  assert.deepEqual(replay, first);
  assert.equal(first.fetchStatus, "success");
  if (first.fetchStatus !== "success") return;
  assert.equal(first.data.predictionOptions?.length, 4);
  assert.equal(first.data.predictionSummary.targetDistanceM, 21_097.5);
  assert.equal(first.data.featureTrendPoints.length, 4);
  assert.equal(first.data.importProgress.normalizedCount, 4);
  assert.equal(dashboardFetchResultSchema.safeParse(first).success, true);
});

test("cloud dashboard exposes a truthful empty state without sufficient activity history", () => {
  assert.deepEqual(buildCloudDashboard({
    athleteId: "athlete-a",
    activities: [],
    latestImport: null,
    generatedAt: "2026-08-10T12:00:00.000Z",
  }), { fetchStatus: "empty", stale: { isStale: false } });
  assert.equal(buildCloudDashboard({
    athleteId: "athlete-a",
    activities: [activity("short", "2026-08-10T06:00:00.000Z", 3_000, 1_000)],
    latestImport: null,
    generatedAt: "2026-08-10T12:00:00.000Z",
  }).fetchStatus, "empty");
});

function activity(id: string, occurredAt: string, distanceM: number, elapsedTimeS: number) {
  return { id, athleteId: "athlete-a", occurredAt, distanceM, elapsedTimeS };
}
