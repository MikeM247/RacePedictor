import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import { raceHistorySchema, raceHistoryRecordSchema, saveRaceHistorySchema, type RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/prisma-client.js";
import { ApiHttpError } from "./api-response.ts";
import type { GoalContextRouteData } from "../../../../packages/core/src/contracts/coaching.ts";
import { buildRaceJourney } from "../../../../packages/core/src/services/race-journey.ts";
import type { SensitiveRouteContext } from "./route-security.ts";

type Stored = { record: unknown; revision: number };
const conflict = () => new ApiHttpError(409, "CONFLICT", "This achievement changed. Reload the history before saving again.");
const parseRows = (rows: Stored[]) => raceHistorySchema.parse(rows.map((row) => ({ ...raceHistoryRecordSchema.parse(row.record), revision: row.revision })));

export function captureApprovedRaceTarget(record: RaceHistoryRecord, context: GoalContextRouteData | null, existing: RaceHistoryRecord[]): RaceHistoryRecord {
  // Snapshot only trusted server-side approved targets. Preserve the original
  // criteria after a new plan replaces it; never accept a client-supplied copy.
  const { targetSnapshot: _untrustedSnapshot, ...value } = record;
  if (!value.targetId) return value;
  const saved = existing.find((item) => item.id === value.id && item.targetId === value.targetId)?.targetSnapshot;
  if (saved) return { ...value, targetSnapshot: saved };
  const target = buildRaceJourney(context, [], "0000-01-01").ahead.find((candidate) => candidate.id === value.targetId || candidate.aliases?.includes(value.targetId!));
  if (!target) throw new ApiHttpError(400, "VALIDATION_ERROR", "Choose a verified approved target, or save this as a historical achievement");
  return { ...value, targetSnapshot: { id: value.targetId, title: target.title, date: target.date, distanceMeters: target.distanceMeters,
    ...(target.targetTimeSeconds ? { targetTimeSeconds: target.targetTimeSeconds } : {}) } };
}

export function raceHistoryActor(security: SensitiveRouteContext, write = false) {
  if (security.mode !== "authenticated") throw new ApiHttpError(401, "UNAUTHENTICATED", "An athlete session is required");
  if (write && security.actor.credentialKind !== "session") throw new ApiHttpError(403, "FORBIDDEN", "A signed-in owner session is required");
  return athleteScopeFor(security.actor, security.actor.activeAthleteId).athleteId;
}

export async function readCloudRaceHistory(athleteId: string, prisma = getCloudPrismaClient()) {
  const rows = await prisma.$queryRawUnsafe<Stored[]>(
    'SELECT "record", "revision" FROM "race_achievements" WHERE "athleteId" = $1 ORDER BY "createdAt", "id"', athleteId,
  );
  return parseRows(rows);
}

export async function saveCloudRaceHistory(athleteId: string, raw: unknown, prisma = getCloudPrismaClient()) {
  const input = saveRaceHistorySchema.parse(raw);
  const { revision: _revision, ...record } = input.record;
  if (record.activityId && !await prisma.activity.findFirst({ where: { id: record.activityId, athleteId, deletedAt: null }, select: { id: true } })) {
    throw new ApiHttpError(404, "NOT_FOUND", "The selected activity could not be found in your history");
  }
  const rows = input.expectedRevision === 0
    ? await prisma.$queryRawUnsafe<Stored[]>(
      'INSERT INTO "race_achievements" ("id", "athleteId", "record", "revision", "updatedAt") VALUES ($1, $2, CAST($3 AS jsonb), 1, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING RETURNING "record", "revision"',
      record.id, athleteId, JSON.stringify(record),
    )
    : await prisma.$queryRawUnsafe<Stored[]>(
      'UPDATE "race_achievements" SET "record" = CAST($3 AS jsonb), "revision" = "revision" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "athleteId" = $2 AND "revision" = $4 RETURNING "record", "revision"',
      record.id, athleteId, JSON.stringify(record), input.expectedRevision,
    );
  if (!rows.length) throw conflict();
  return parseRows(rows)[0];
}

export async function deleteCloudRaceHistory(athleteId: string, id: string, revision: number, prisma = getCloudPrismaClient()) {
  const count = await prisma.$executeRawUnsafe('DELETE FROM "race_achievements" WHERE "id" = $1 AND "athleteId" = $2 AND "revision" = $3', id, athleteId, revision);
  if (!count) throw conflict();
}

function openLocal(databasePath: string, write: boolean) {
  if (write) mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath, { readOnly: !write });
  if (write) db.exec('CREATE TABLE IF NOT EXISTS race_achievements (id TEXT NOT NULL, athlete_id TEXT NOT NULL, record_json TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY (athlete_id, id))');
  return db;
}

export function readLocalRaceHistory(databasePath: string, athleteId: string): RaceHistoryRecord[] {
  if (!existsSync(databasePath)) return [];
  const db = openLocal(databasePath, false);
  try {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'race_achievements'").get()) return [];
    const rows = db.prepare('SELECT record_json, revision FROM race_achievements WHERE athlete_id = ? ORDER BY rowid').all(athleteId);
    return parseRows(rows.map((row) => ({ record: JSON.parse(String(row.record_json)), revision: Number(row.revision) })));
  } finally { db.close(); }
}

export function saveLocalRaceHistory(databasePath: string, athleteId: string, raw: unknown) {
  const input = saveRaceHistorySchema.parse(raw);
  const { revision: _revision, ...record } = input.record;
  const db = openLocal(databasePath, true);
  try {
    if (record.activityId && !db.prepare('SELECT id FROM activities WHERE id = ? AND athlete_id = ?').get(record.activityId, athleteId)) {
      throw new ApiHttpError(404, "NOT_FOUND", "The selected activity could not be found in your history");
    }
    const result = input.expectedRevision === 0
      ? db.prepare('INSERT OR IGNORE INTO race_achievements (id, athlete_id, record_json, revision) VALUES (?, ?, ?, 1)').run(record.id, athleteId, JSON.stringify(record))
      : db.prepare('UPDATE race_achievements SET record_json = ?, revision = revision + 1 WHERE id = ? AND athlete_id = ? AND revision = ?').run(JSON.stringify(record), record.id, athleteId, input.expectedRevision);
    if (!result.changes) throw conflict();
    return raceHistoryRecordSchema.parse({ ...record, revision: input.expectedRevision + 1 });
  } finally { db.close(); }
}

export function deleteLocalRaceHistory(databasePath: string, athleteId: string, id: string, revision: number) {
  if (!existsSync(databasePath)) throw conflict();
  const db = openLocal(databasePath, true);
  try {
    if (!db.prepare('DELETE FROM race_achievements WHERE athlete_id = ? AND id = ? AND revision = ?').run(athleteId, id, revision).changes) throw conflict();
  } finally { db.close(); }
}
