import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { emptyMilestoneState, milestoneStateSchema, type MilestoneState } from "../../core/src/contracts/milestone-timeline.ts";

export type TimelineStateRecord = { revision: number; state: MilestoneState };
type SqlClient = {
  $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T>;
};
export class MilestoneRevisionConflict extends Error {}
const absent = (): TimelineStateRecord => ({ revision: 0, state: emptyMilestoneState() });

export async function readCloudMilestoneState(athleteId: string, sql: SqlClient): Promise<TimelineStateRecord> {
  const rows = await sql.$queryRawUnsafe<{ revision: number; state: unknown }[]>(
    'SELECT "revision", "state" FROM "milestone_timeline_state" WHERE "athleteId" = $1', athleteId);
  return rows.length ? { revision: rows[0].revision, state: milestoneStateSchema.parse(rows[0].state) } : absent();
}

export async function writeCloudMilestoneState(athleteId: string, expectedRevision: number, state: MilestoneState, sql: SqlClient) {
  const value = JSON.stringify(milestoneStateSchema.parse(state));
  const rows = expectedRevision === 0
    ? await sql.$queryRawUnsafe<{ revision: number }[]>(
      'INSERT INTO "milestone_timeline_state" ("athleteId", "revision", "state", "updatedAt") VALUES ($1, 1, CAST($2 AS jsonb), CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING RETURNING "revision"', athleteId, value)
    : await sql.$queryRawUnsafe<{ revision: number }[]>(
      'UPDATE "milestone_timeline_state" SET "revision" = "revision" + 1, "state" = CAST($3 AS jsonb), "updatedAt" = CURRENT_TIMESTAMP WHERE "athleteId" = $1 AND "revision" = $2 RETURNING "revision"', athleteId, expectedRevision, value);
  if (!rows.length) throw new MilestoneRevisionConflict("Milestones changed in another session. Reload before deciding again.");
  return { revision: rows[0].revision, state };
}

const localSchema = 'CREATE TABLE IF NOT EXISTS milestone_timeline_state (athlete_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision > 0), state_json TEXT NOT NULL, updated_at TEXT NOT NULL)';
export function readLocalMilestoneState(databasePath: string, athleteId: string, connection?: DatabaseSync): TimelineStateRecord {
  if (!connection && !existsSync(databasePath)) return absent();
  const db = connection ?? new DatabaseSync(databasePath, { readOnly: true });
  try {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='milestone_timeline_state'").get()) return absent();
    const row = db.prepare('SELECT revision, state_json FROM milestone_timeline_state WHERE athlete_id = ?').get(athleteId);
    return row ? { revision: Number(row.revision), state: milestoneStateSchema.parse(JSON.parse(String(row.state_json))) } : absent();
  } finally { if (!connection) db.close(); }
}

export function withLocalMilestoneTransaction<T>(databasePath: string, callback: (db: DatabaseSync) => T): T {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  let begun = false;
  try {
    db.exec("PRAGMA busy_timeout = 5000"); db.exec("BEGIN IMMEDIATE"); begun = true; db.exec(localSchema);
    const result = callback(db);
    db.exec("COMMIT"); begun = false; return result;
  } catch (error) { if (begun) db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
}

export function writeLocalMilestoneState(db: DatabaseSync, athleteId: string, expectedRevision: number, state: MilestoneState): TimelineStateRecord {
  const value = JSON.stringify(milestoneStateSchema.parse(state));
  const now = new Date().toISOString();
  const result = expectedRevision === 0
    ? db.prepare('INSERT OR IGNORE INTO milestone_timeline_state (athlete_id, revision, state_json, updated_at) VALUES (?, 1, ?, ?)').run(athleteId, value, now)
    : db.prepare('UPDATE milestone_timeline_state SET revision = revision + 1, state_json = ?, updated_at = ? WHERE athlete_id = ? AND revision = ?').run(value, now, athleteId, expectedRevision);
  if (!result.changes) throw new MilestoneRevisionConflict("Milestones changed in another session. Reload before deciding again.");
  return { revision: expectedRevision + 1, state };
}
