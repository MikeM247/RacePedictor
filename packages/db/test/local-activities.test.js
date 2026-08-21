import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getLocalActivity, listLocalActivities } from "../src/local-activities.js";
import { importGarminCsv } from "../src/local-garmin-pipeline.js";

const header = "Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Aerobic TE,Avg Run Cadence,Max Run Cadence,Avg Pace,Best Pace,Total Ascent,Total Descent,Moving Time,Elapsed Time,Avg Power,Steps";
const activity = ({ date, title, distance, elapsed, pace }) =>
  `Running,${date},false,${title},${distance},500,${elapsed},145,170,3.2,160,175,${pace},4:30,80,75,${elapsed},${elapsed},250,9000`;

test("lists, filters, paginates, and reads activity details", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-activities-"));
  const sourcePath = path.join(directory, "Activities.csv");
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  await writeFile(sourcePath, [
    header,
    activity({ date: "2026-07-13 06:00:00", title: "Easy River Run", distance: "8.00", elapsed: "00:48:00", pace: "6:00" }),
    activity({ date: "2026-07-20 06:00:00", title: "Tempo Run", distance: "10.00", elapsed: "00:55:00", pace: "5:30" }),
    activity({ date: "2026-07-27 06:00:00", title: "Sunday Long Run", distance: "18.00", elapsed: "01:45:00", pace: "5:50" }),
  ].join("\n"), "utf8");
  await importGarminCsv({ sourcePath, vaultPath: path.join(directory, "vault"), databasePath });

  const firstPage = listLocalActivities({ databasePath, limit: 2 });
  assert.equal(firstPage.items.length, 2);
  assert.equal(firstPage.items[0].title, "Sunday Long Run");
  assert.ok(firstPage.nextCursor);

  const secondPage = listLocalActivities({ databasePath, cursor: firstPage.nextCursor, limit: 2 });
  assert.deepEqual(secondPage.items.map((item) => item.title), ["Easy River Run"]);
  assert.equal(secondPage.nextCursor, undefined);

  const filtered = listLocalActivities({
    databasePath,
    search: "tempo",
    from: "2026-07-20",
    to: "2026-07-20",
  });
  assert.deepEqual(filtered.items.map((item) => item.title), ["Tempo Run"]);

  const detail = getLocalActivity({ databasePath, activityId: firstPage.items[0].id });
  assert.equal(detail.title, "Sunday Long Run");
  assert.equal(detail.distanceM, 18000);
  assert.equal(detail.avgHrBpm, 145);
  assert.equal(detail.avgPowerW, 250);
  assert.deepEqual(detail.splits, []);
  assert.equal(detail.routeSignature, null);
});

test("rejects invalid cursors and date ranges", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-activities-invalid-"));
  const sourcePath = path.join(directory, "Activities.csv");
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  await writeFile(sourcePath, [header, activity({
    date: "2026-07-20 06:00:00",
    title: "Tempo Run",
    distance: "10.00",
    elapsed: "00:55:00",
    pace: "5:30",
  })].join("\n"), "utf8");
  await importGarminCsv({ sourcePath, vaultPath: path.join(directory, "vault"), databasePath });

  assert.throws(() => listLocalActivities({ databasePath, cursor: "missing" }), /Invalid activity cursor/);
  assert.throws(
    () => listLocalActivities({ databasePath, from: "2026-08-01", to: "2026-07-01" }),
    /from must be on or before to/,
  );
});
