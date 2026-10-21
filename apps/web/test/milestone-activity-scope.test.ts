import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { getActivities, getActivity } from "../lib/local-activities-data-source.ts";
const { createLocalSchema } = createRequire(import.meta.url)("../../../packages/db/src/local-garmin-pipeline.js") as { createLocalSchema: (database: DatabaseSync) => void };

test("local race search and detail use the configured athlete shared by milestone writes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "milestone-activity-scope-"));
  const databasePath = path.join(root, "history.sqlite");
  const previousPath = process.env.RACEPREDICTOR_DATABASE_PATH, previousAthlete = process.env.RACEPREDICTOR_ATHLETE_ID;
  const db = new DatabaseSync(databasePath);
  try {
    createLocalSchema(db);
    for (const athlete of ["athlete_001", "selected-athlete"]) db.prepare("INSERT INTO activities (id, athlete_id, source_type, occurred_at, local_occurred_at, ended_at, elapsed_time_s, sport, title, distance_m, avg_pace_sec_per_km, dedupe_hash, source_payload_json, created_at) VALUES (?, ?, 'gpx', '2026-10-04T06:00:00Z', '2026-10-04T08:00:00+02:00', '2026-10-04T07:00:00Z', 3500, 'run', 'Race', 10000, 350, ?, '{}', '2026-10-04T08:00:00Z')").run(`race-${athlete}`, athlete, `hash-${athlete}`);
    process.env.RACEPREDICTOR_DATABASE_PATH = databasePath; process.env.RACEPREDICTOR_ATHLETE_ID = "selected-athlete";
    assert.deepEqual(getActivities({ search: "Race" }).items.map((item) => item.id), ["race-selected-athlete"]);
    assert.equal(getActivity("race-athlete_001"), null);
    assert.equal(getActivity("race-selected-athlete")?.id, "race-selected-athlete");
  } finally {
    db.close();
    if (previousPath === undefined) delete process.env.RACEPREDICTOR_DATABASE_PATH; else process.env.RACEPREDICTOR_DATABASE_PATH = previousPath;
    if (previousAthlete === undefined) delete process.env.RACEPREDICTOR_ATHLETE_ID; else process.env.RACEPREDICTOR_ATHLETE_ID = previousAthlete;
    rmSync(root, { recursive: true, force: true });
  }
});
