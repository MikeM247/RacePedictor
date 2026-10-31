import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  emptyImageState,
  imageStateSchema,
  type ImageState,
} from "../../core/src/contracts/milestone-images.ts";
export type ImageRecord = {
  revision: number;
  state: ImageState;
  cloudRevision: number | null;
  pending: boolean;
  remoteState: ImageState | null;
};
export type ImageAsset = {
  id: string;
  bytes: Uint8Array;
  width: number;
  height: number;
};
export type ImageSql = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};
export class ImageRevisionConflict extends Error {
  constructor() {
    super("Milestone images changed. Reload and review before saving again.");
  }
}
export const absentImages = (): ImageRecord => ({
  revision: 0,
  state: emptyImageState(),
  cloudRevision: null,
  pending: false,
  remoteState: null,
});
export const localImageSchema = `
CREATE TABLE IF NOT EXISTS milestone_image_state (athlete_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state_json TEXT NOT NULL, cloud_revision INTEGER, pending INTEGER NOT NULL DEFAULT 0, remote_json TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS milestone_image_assets (athlete_id TEXT NOT NULL, id TEXT NOT NULL, bytes BLOB NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(athlete_id,id));`;
export function withLocalImages<T>(
  databasePath: string,
  callback: (db: DatabaseSync) => T,
) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
    db.exec(localImageSchema);
    const result = callback(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    db.close();
  }
}
export function readLocalImages(
  databasePath: string,
  athleteId: string,
  connection?: DatabaseSync,
): ImageRecord {
  if (!connection && !existsSync(databasePath)) return absentImages();
  const db = connection ?? new DatabaseSync(databasePath, { readOnly: true });
  try {
    if (
      !db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='milestone_image_state'",
        )
        .get()
    )
      return absentImages();
    const row = db
      .prepare("SELECT * FROM milestone_image_state WHERE athlete_id=?")
      .get(athleteId);
    return row
      ? {
          revision: Number(row.revision),
          state: imageStateSchema.parse(JSON.parse(String(row.state_json))),
          cloudRevision:
            row.cloud_revision === null ? null : Number(row.cloud_revision),
          pending: Boolean(row.pending),
          remoteState: row.remote_json
            ? imageStateSchema.parse(JSON.parse(String(row.remote_json)))
            : null,
        }
      : absentImages();
  } finally {
    if (!connection) db.close();
  }
}
export function writeLocalImages(
  db: DatabaseSync,
  athleteId: string,
  expected: number,
  state: ImageState,
  sync?: {
    cloudRevision: number | null;
    pending: boolean;
    remoteState?: ImageState | null;
  },
) {
  const current = readLocalImages("", athleteId, db);
  if (current.revision !== expected) throw new ImageRevisionConflict();
  const next = {
    revision: expected + 1,
    state: imageStateSchema.parse(state),
    cloudRevision: sync?.cloudRevision ?? current.cloudRevision,
    pending: sync?.pending ?? current.pending,
    remoteState: sync?.remoteState ?? null,
  };
  db.prepare(
    "INSERT INTO milestone_image_state (athlete_id,revision,state_json,cloud_revision,pending,remote_json,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(athlete_id) DO UPDATE SET revision=excluded.revision,state_json=excluded.state_json,cloud_revision=excluded.cloud_revision,pending=excluded.pending,remote_json=excluded.remote_json,updated_at=excluded.updated_at",
  ).run(
    athleteId,
    next.revision,
    JSON.stringify(next.state),
    next.cloudRevision,
    next.pending ? 1 : 0,
    next.remoteState ? JSON.stringify(next.remoteState) : null,
    new Date().toISOString(),
  );
  return next;
}
export async function readCloudImages(
  athleteId: string,
  sql: ImageSql,
): Promise<ImageRecord> {
  const rows = await sql.$queryRawUnsafe<
    {
      revision: number;
      state: unknown;
    }[]
  >(
    'SELECT revision,state FROM milestone_image_state WHERE "athleteId"=$1',
    athleteId,
  );
  return rows[0]
    ? {
        revision: rows[0].revision,
        state: imageStateSchema.parse(rows[0].state),
        cloudRevision: rows[0].revision,
        pending: false,
        remoteState: null,
      }
    : { ...absentImages(), cloudRevision: 0 };
}
export async function writeCloudImages(
  athleteId: string,
  expected: number,
  state: ImageState,
  sql: ImageSql,
): Promise<ImageRecord> {
  const value = JSON.stringify(imageStateSchema.parse(state));
  const rows =
    expected === 0
      ? await sql.$queryRawUnsafe<
          {
            revision: number;
          }[]
        >(
          'INSERT INTO milestone_image_state ("athleteId",revision,state,"updatedAt") VALUES ($1,1,CAST($2 AS jsonb),CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING RETURNING revision',
          athleteId,
          value,
        )
      : await sql.$queryRawUnsafe<
          {
            revision: number;
          }[]
        >(
          'UPDATE milestone_image_state SET revision=revision+1,state=CAST($3 AS jsonb),"updatedAt"=CURRENT_TIMESTAMP WHERE "athleteId"=$1 AND revision=$2 RETURNING revision',
          athleteId,
          expected,
          value,
        );
  if (!rows[0]) throw new ImageRevisionConflict();
  return {
    revision: rows[0].revision,
    state,
    cloudRevision: rows[0].revision,
    pending: false,
    remoteState: null,
  };
}
export function putLocalImageAsset(
  db: DatabaseSync,
  athleteId: string,
  asset: ImageAsset,
) {
  db.prepare(
    "INSERT OR IGNORE INTO milestone_image_assets(athlete_id,id,bytes,width,height,created_at) VALUES(?,?,?,?,?,?)",
  ).run(
    athleteId,
    asset.id,
    asset.bytes,
    asset.width,
    asset.height,
    new Date().toISOString(),
  );
}
export function readLocalImageAsset(
  databasePath: string,
  athleteId: string,
  id: string,
  connection?: DatabaseSync,
): ImageAsset | null {
  if (!connection && !existsSync(databasePath)) return null;
  const db = connection ?? new DatabaseSync(databasePath, { readOnly: true });
  try {
    if (
      !db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='milestone_image_assets'",
        )
        .get()
    )
      return null;
    const row = db
      .prepare(
        "SELECT id,bytes,width,height FROM milestone_image_assets WHERE athlete_id=? AND id=?",
      )
      .get(athleteId, id);
    return row
      ? {
          id: String(row.id),
          bytes: row.bytes as Uint8Array,
          width: Number(row.width),
          height: Number(row.height),
        }
      : null;
  } finally {
    if (!connection) db.close();
  }
}
export async function putCloudImageAsset(
  athleteId: string,
  asset: ImageAsset,
  sql: ImageSql,
) {
  await sql.$executeRawUnsafe(
    'INSERT INTO milestone_image_assets ("athleteId",id,bytes,width,height,"createdAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING',
    athleteId,
    asset.id,
    Buffer.from(asset.bytes),
    asset.width,
    asset.height,
  );
}
export async function readCloudImageAsset(
  athleteId: string,
  id: string,
  sql: ImageSql,
): Promise<ImageAsset | null> {
  const rows = await sql.$queryRawUnsafe<ImageAsset[]>(
    'SELECT id,bytes,width,height FROM milestone_image_assets WHERE "athleteId"=$1 AND id=$2',
    athleteId,
    id,
  );
  return rows[0] ?? null;
}
