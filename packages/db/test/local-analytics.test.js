import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { runLocalAnalytics } from "../src/local-analytics.js";
import { importGarminCsv } from "../src/local-garmin-pipeline.js";

const header = "Activity Type,Date,Favorite,Title,Distance,Time,Avg HR,Max HR,Aerobic TE,Avg Run Cadence,Max Run Cadence,Avg Pace,Best Pace,Total Ascent,Total Descent,Moving Time,Elapsed Time";
const activity = (date, distance, elapsed, pace, trainingEffect) =>
  `Running,${date},false,Test Run,${distance},${elapsed},145,170,${trainingEffect},160,175,${pace},4:30,80,75,${elapsed},${elapsed}`;

test("reconciles weekly features and writes a dashboard snapshot", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-analytics-"));
  const sourcePath = path.join(directory, "Activities.csv");
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const snapshotPath = path.join(directory, "state", "dashboard-overview.json");
  await writeFile(
    sourcePath,
    [
      header,
      activity("2026-07-13 06:00:00", "10.00", "00:55:00", "5:30", "2.5"),
      activity("2026-07-20 06:00:00", "12.00", "01:04:00", "5:20", "3.4"),
      activity("2026-07-27 06:00:00", "18.00", "01:33:00", "5:10", "4.1"),
    ].join("\n"),
    "utf8",
  );
  await importGarminCsv({ sourcePath, vaultPath: path.join(directory, "vault"), databasePath });
  const result = await runLocalAnalytics({ databasePath, snapshotPath });

  assert.equal(result.weeklyFeatureCount, 3);
  assert.equal(result.reconciliation.activityCount, 3);
  assert.equal(result.reconciliation.activityDistanceM, result.reconciliation.weeklyDistanceM);
  assert.ok(result.prediction.predictedTimeS > 0);
  assert.equal(result.prediction.targetDistanceM, 21097.5);

  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  assert.equal(snapshot.fetchStatus, "success");
  assert.equal(snapshot.data.predictionSummary.targetDistanceM, 21097.5);
  assert.deepEqual(
    snapshot.data.predictionOptions.map((prediction) => prediction.targetDistanceM),
    [5000, 10000, 21097.5, 42195],
  );
  assert.equal(snapshot.data.importProgress.normalizedCount, 3);
  assert.equal(snapshot.data.featureTrendPoints.length, 3);

  const database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM weekly_features").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM predictions").get().count, 4);
  database.close();
});
