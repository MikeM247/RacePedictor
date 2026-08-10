import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { toDashboardViewModel, toSummaryKpis } from "../lib/dashboard-view-model.ts";
import { LocalDashboardDataSource } from "../lib/local-dashboard-data-source.ts";

const snapshot = {
  fetchStatus: "success",
  stale: { isStale: false },
  data: {
    predictionSummary: {
      athleteId: "athlete_001",
      targetDistanceM: 21097.5,
      predictedTimeS: 8094,
      predictedPaceSecPerKm: 383.6,
      bandLowS: 7541,
      bandHighS: 8647,
      modelVersion: "test-v1",
      generatedAt: "2026-08-04T00:00:00.000Z",
    },
    predictionOptions: [
      { targetDistanceM: 5000, predictedTimeS: 1745, predictedPaceSecPerKm: 349, bandLowS: 1630, bandHighS: 1860 },
      { targetDistanceM: 10000, predictedTimeS: 3635, predictedPaceSecPerKm: 363.5, bandLowS: 3400, bandHighS: 3870 },
      { targetDistanceM: 21097.5, predictedTimeS: 8094, predictedPaceSecPerKm: 383.6, bandLowS: 7541, bandHighS: 8647 },
      { targetDistanceM: 42195, predictedTimeS: 16850, predictedPaceSecPerKm: 399.3, bandLowS: 15400, bandHighS: 18300 },
    ].map((prediction) => ({
      athleteId: "athlete_001",
      modelVersion: "test-v1",
      generatedAt: "2026-08-04T00:00:00.000Z",
      ...prediction,
    })),
    driverContributions: [],
    featureTrendPoints: [],
    importProgress: {
      importId: "import_1",
      status: "completed",
      stagedCount: 120,
      normalizedCount: 120,
      duplicateCount: 0,
      rejectedCount: 0,
      updatedAt: "2026-08-04T00:00:00.000Z",
    },
  },
} as const;

test("loads the local snapshot and formats race estimates", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-web-"));
  const snapshotPath = path.join(directory, "dashboard.json");
  await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

  const result = await new LocalDashboardDataSource(snapshotPath).getDashboardData();
  assert.equal(result.fetchStatus, "success");
  const viewModel = toDashboardViewModel(result);
  assert.deepEqual(viewModel.summaryKpis.map((kpi) => [kpi.title, kpi.value]), [
    ["Half marathon estimate", "2:14:54"],
    ["Predicted pace", "6:24/km"],
    ["Confidence band", "2:05:41 - 2:24:07"],
  ]);
  assert.equal(viewModel.predictionOptions.length, 4);
  assert.deepEqual(toSummaryKpis(viewModel.predictionOptions[0]).map((kpi) => [kpi.title, kpi.value]), [
    ["5 km estimate", "29:05"],
    ["Predicted pace", "5:49/km"],
    ["Confidence band", "27:10 - 31:00"],
  ]);
});

test("returns a recoverable error when the snapshot is missing", async () => {
  const result = await new LocalDashboardDataSource("missing-dashboard.json").getDashboardData();
  assert.equal(result.fetchStatus, "error");
  if (result.fetchStatus === "error") assert.match(result.errorMessage, /Run the Garmin refresh/);
});
