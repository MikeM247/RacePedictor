import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  ActivityImportError,
  importLocalActivityFile,
  parseGpxActivity,
} from "../src/local-activity-file-importer.js";

const gpx = ({ version = "1.1", tracks = 1, includeSensors = true } = {}) => {
  const namespace = version === "1.0"
    ? "http://www.topografix.com/GPX/1/0"
    : "http://www.topografix.com/GPX/1/1";
  const points = [
    ["-29.8000", "31.0000", "10", "2026-08-02T05:28:42Z", "140", "160"],
    ["-29.7900", "31.0000", "20", "2026-08-02T05:33:42Z", "150", "164"],
    ["-29.7800", "31.0000", "15", "2026-08-02T05:38:42Z", "155", "166"],
  ].map(([lat, lon, elevation, time, heartRate, cadence]) => `
      <trkpt lat="${lat}" lon="${lon}">
        <ele>${elevation}</ele><time>${time}</time>
        ${includeSensors ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${heartRate}</gpxtpx:hr><gpxtpx:cad>${cadence}</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>` : ""}
      </trkpt>`).join("");
  const track = (index) => `<trk><name>Morning Run ${index}</name><trkseg>${points}</trkseg></trk>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
  <gpx version="${version}" creator="tests" xmlns="${namespace}"
    xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
    ${Array.from({ length: tracks }, (_, index) => track(index + 1)).join("")}
  </gpx>`;
};

const csvHeaders = ["Activity Type", "Date", "Distance", "Elapsed Time", "Avg Pace", "Total Ascent", "Total Descent"];

test("parses namespaced GPX 1.0/1.1 and exposes route and sensor coverage", () => {
  for (const version of ["1.0", "1.1"]) {
    const parsed = parseGpxActivity(Buffer.from(gpx({ version })));
    assert.equal(parsed.activity.sourceType, "gpx");
    assert.equal(parsed.activity.elapsedTimeS, 600);
    assert.ok(parsed.activity.distanceM > 2200);
    assert.equal(parsed.activity.elevationGainM, 10);
    assert.equal(parsed.activity.elevationLossM, 5);
    assert.equal(parsed.coverage.pointCount, 3);
    assert.equal(parsed.coverage.heartRatePointCount, 3);
    assert.equal(parsed.routeSummary.pointCount, 3);
  }
});

test("accepts GPX without optional heart-rate or cadence sensors", () => {
  const parsed = parseGpxActivity(Buffer.from(gpx({ includeSensors: false })));
  assert.equal(parsed.activity.avgHrBpm, null);
  assert.equal(parsed.activity.avgCadenceSpm, null);
  assert.equal(parsed.coverage.heartRatePointCount, 0);
  assert.equal(parsed.coverage.cadencePointCount, 0);
});

test("rejects unsafe, malformed, empty-track, and multi-activity GPX", () => {
  const namespace = "http://www.topografix.com/GPX/1/1";
  assert.throws(
    () => parseGpxActivity(Buffer.from(`<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///secret">]><gpx version="1.1" xmlns="${namespace}"><trk><name>&x;</name></trk></gpx>`)),
    /DTD and entity declarations/,
  );
  assert.throws(
    () => parseGpxActivity(Buffer.from(`<gpx version="1.1" xmlns="${namespace}"><trk></gpx>`)),
    /Malformed GPX XML/,
  );
  assert.throws(
    () => parseGpxActivity(Buffer.from(`<gpx version="1.1" xmlns="${namespace}"></gpx>`)),
    /one track activity/,
  );
  assert.throws(() => parseGpxActivity(Buffer.from(gpx({ tracks: 2 }))), /multiple track activities/);
});

test("dispatches bounded files and persists GPX idempotently without trackpoint rows", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-activity-import-"));
  const sourcePath = path.join(directory, "activity.gpx");
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const vaultPath = path.join(directory, "vault");
  await writeFile(sourcePath, gpx(), "utf8");

  await assert.rejects(
    importLocalActivityFile({ sourcePath, contentType: "application/gpx+xml", databasePath, vaultPath, maxBytes: 10 }),
    (error) => error instanceof ActivityImportError && error.httpStatus === 413,
  );
  const first = await importLocalActivityFile({ sourcePath, contentType: "application/gpx+xml", databasePath, vaultPath });
  assert.equal(first.sourceType, "gpx");
  assert.equal(first.import.normalizedCount, 1);
  assert.equal(first.import.duplicateCount, 0);
  assert.equal(first.coverage.routeAvailable, true);
  const second = await importLocalActivityFile({ sourcePath, contentType: "application/gpx+xml", databasePath, vaultPath });
  assert.equal(second.reused, true);
  assert.equal(second.totalNormalizedActivities, 1);

  const database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM activities").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM route_signatures").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE '%trackpoint%'").get().count, 0);
  database.close();
});

test("dispatches Garmin CSV then deduplicates and enriches the same activity from GPX", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-cross-format-"));
  const gpxPath = path.join(directory, "activity.gpx");
  const csvPath = path.join(directory, "Activities.csv");
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const vaultPath = path.join(directory, "vault");
  const source = gpx();
  const parsed = parseGpxActivity(Buffer.from(source));
  await writeFile(gpxPath, source, "utf8");
  const csvValues = [
    "Running",
    "2026-08-02 07:28:42",
    (parsed.activity.distanceM / 1000).toFixed(6),
    "00:10:00",
    "4:30",
    String(parsed.activity.elevationGainM),
    String(parsed.activity.elevationLossM),
  ];
  await writeFile(csvPath, `${csvHeaders.join(",")}\n${csvValues.join(",")}\n`, "utf8");
  const csvResult = await importLocalActivityFile({ sourcePath: csvPath, contentType: "text/csv", databasePath, vaultPath });
  assert.equal(csvResult.sourceType, "csv");
  assert.equal(csvResult.import.normalizedCount, 1);

  const gpxResult = await importLocalActivityFile({ sourcePath: gpxPath, contentType: "application/gpx+xml", databasePath, vaultPath });
  assert.equal(gpxResult.import.normalizedCount, 0);
  assert.equal(gpxResult.import.duplicateCount, 1);
  assert.equal(gpxResult.totalNormalizedActivities, 1);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM route_signatures").get().count, 1);
  database.close();
});
