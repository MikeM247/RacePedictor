import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { importGarminCsv, normalizeGarminActivity, parseCsv, parseDurationSeconds } from "../src/local-garmin-pipeline.js";

const headers = [
  "Activity Type", "Date", "Favorite", "Title", "Distance", "Calories", "Time",
  "Avg HR", "Max HR", "Aerobic TE", "Avg Run Cadence", "Max Run Cadence", "Avg Pace",
  "Best Pace", "Total Ascent", "Total Descent", "Moving Time", "Elapsed Time", "Steps",
];

const row = (overrides = {}) => {
  const values = {
    "Activity Type": "Running",
    Date: "2026-08-02 07:28:42",
    Favorite: "false",
    Title: "Synthetic Long Run",
    Distance: "21.11",
    Calories: "1,657",
    Time: "02:42:50",
    "Avg HR": "146",
    "Max HR": "181",
    "Aerobic TE": "5.0",
    "Avg Run Cadence": "151",
    "Max Run Cadence": "240",
    "Avg Pace": "7:43",
    "Best Pace": "5:51",
    "Total Ascent": "390",
    "Total Descent": "388",
    "Moving Time": "02:42:09",
    "Elapsed Time": "02:42:50",
    Steps: "24,598",
    ...overrides,
  };
  return headers.map((header) => `"${String(values[header] ?? "").replaceAll('"', '""')}"`).join(",");
};

test("parses Garmin durations and locale-formatted metrics", () => {
  assert.equal(parseDurationSeconds("7:43"), 463);
  assert.equal(parseDurationSeconds("02:42:50"), 9770);
  const activity = normalizeGarminActivity(Object.fromEntries(headers.map((header, index) => [header, parseCsv(`${headers.join(",")}\n${row()}\n`)[0][header]])));
  assert.equal(activity.distanceM, 21110);
  assert.equal(activity.calories, 1657);
  assert.equal(activity.steps, 24598);
  assert.equal(activity.occurredAt, "2026-08-02T05:28:42.000Z");
});

test("normalizes historical Log rows with Time, a one-digit hour, and derived pace", () => {
  const historicalHeaders = headers.filter((header) => !["Moving Time", "Elapsed Time", "Steps"].includes(header));
  const historicalCsv = `${historicalHeaders.join(",")}\n${row({
    Date: "2020-01-01 9:20:36",
    Distance: "0.2",
    Time: "0:12:48",
    "Avg Pace": "--",
  }).split(",").slice(0, historicalHeaders.length).join(",")}\n`;
  const activity = normalizeGarminActivity(parseCsv(historicalCsv)[0]);

  assert.equal(activity.occurredAt, "2020-01-01T07:20:36.000Z");
  assert.equal(activity.localOccurredAt, "2020-01-01 09:20:36");
  assert.equal(activity.elapsedTimeS, 768);
  assert.equal(activity.avgPaceSecPerKm, 3840);
});

test("captures raw CSV and normalizes idempotently", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-garmin-"));
  const sourcePath = path.join(directory, "Activities.csv");
  const vaultPath = path.join(directory, "vault");
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const csv = `${headers.join(",")}\n${row()}\n${row()}\n${row({
    Date: "2026-07-30 06:00:00",
    Distance: "",
  })}\n`;
  await writeFile(sourcePath, csv, "utf8");

  const first = await importGarminCsv({ sourcePath, vaultPath, databasePath });
  assert.equal(first.reused, false);
  assert.equal(first.rowCount, 3);
  assert.equal(first.import.stagedCount, 2);
  assert.equal(first.import.normalizedCount, 1);
  assert.equal(first.import.duplicateCount, 1);
  assert.equal(first.import.rejectedCount, 1);
  assert.equal(first.totalNormalizedActivities, 1);

  const rawBuffer = await readFile(first.raw.storagePath);
  assert.equal(createHash("sha256").update(rawBuffer).digest("hex"), first.checksumSha256);
  assert.equal((await stat(first.raw.manifestPath)).isFile(), true);

  const second = await importGarminCsv({ sourcePath, vaultPath, databasePath });
  assert.equal(second.reused, true);
  assert.equal(second.totalNormalizedActivities, 1);
  assert.equal(second.import.normalizedCount, 1);
  assert.equal(second.import.duplicateCount, 1);

  const database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM imports").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM raw_files").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM staging_activities").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM activities").get().count, 1);
  database.close();
});
