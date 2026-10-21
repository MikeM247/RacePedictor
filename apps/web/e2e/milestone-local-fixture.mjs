import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import prepareHome from "./home-local-fixture.ts";
import { e2eDatabasePath } from "./fixture-paths.ts";
import { createLocalSchema } from "../../../packages/db/src/local-garmin-pipeline.js";

export default async function prepareMilestones() {
  await prepareHome(); await mkdir(path.dirname(e2eDatabasePath), { recursive: true });
  const db = new DatabaseSync(e2eDatabasePath);
  try {
    createLocalSchema(db);
    for (const [id, date, title, elapsed] of [["milestone-race-a", "2026-10-04", "Spring 10 km", 3522], ["milestone-race-b", "2026-09-06", "Winter 10 km", 3800]]) {
      db.prepare("INSERT OR IGNORE INTO activities (id, athlete_id, source_type, occurred_at, local_occurred_at, ended_at, elapsed_time_s, sport, title, distance_m, avg_pace_sec_per_km, dedupe_hash, source_payload_json, created_at) VALUES (?, ?, 'gpx', ?, ?, ?, ?, 'run', ?, 10000, ?, ?, '{}', ?)").run(id, "e2e_athlete", `${date}T06:00:00Z`, `${date}T08:00:00+02:00`, `${date}T07:00:00Z`, elapsed, title, elapsed / 10, id, `${date}T08:00:00Z`);
    }
  } finally { db.close(); }
}
