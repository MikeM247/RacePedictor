import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/prisma-client.js";
import { ApiHttpError } from "./api-response.ts";

export const DEFAULT_HERO_IMAGE = "/road-to-comrades.webp";
const MAX_UPLOAD = 4 * 1024 * 1024;
type Appearance = { heroImage: Uint8Array; version: string };

export async function prepareHeroImage(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD) throw new ApiHttpError(413, "VALIDATION_ERROR", "Choose an image smaller than 4 MB");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiHttpError(400, "VALIDATION_ERROR", "Choose a JPEG, PNG or WebP image");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.length;
    if (length > MAX_UPLOAD) { await reader.cancel(); throw new ApiHttpError(413, "VALIDATION_ERROR", "Choose an image smaller than 4 MB"); }
    chunks.push(next.value);
  }
  try {
    const image = sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000, animated: false });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || !meta.width || !meta.height) throw new Error("Invalid image");
    const heroImage = await image.rotate().resize({ width: 1920, height: 1080, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (heroImage.byteLength > 1024 * 1024) throw new Error("Image too complex");
    return { heroImage, version: createHash("sha256").update(heroImage).digest("hex").slice(0, 24) };
  } catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "Choose a valid JPEG, PNG or WebP image smaller than 4 MB"); }
}

export function appearanceImageUrl(appearance: Pick<Appearance, "version"> | null) {
  return appearance ? `/api/v1/dashboard/appearance/image?v=${appearance.version}` : DEFAULT_HERO_IMAGE;
}

export async function readCloudAppearance(athleteId: string): Promise<Appearance | null> {
  const rows = await getCloudPrismaClient().$queryRawUnsafe<Appearance[]>('SELECT "heroImage", "version" FROM "dashboard_appearance" WHERE "athleteId" = $1', athleteId);
  return rows[0] ?? null;
}
export async function saveCloudAppearance(athleteId: string, appearance: Appearance | null) {
  const prisma = getCloudPrismaClient();
  if (!appearance) { await prisma.$executeRawUnsafe('DELETE FROM "dashboard_appearance" WHERE "athleteId" = $1', athleteId); return; }
  await prisma.$executeRawUnsafe('INSERT INTO "dashboard_appearance" ("athleteId", "heroImage", "version", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT ("athleteId") DO UPDATE SET "heroImage" = EXCLUDED."heroImage", "version" = EXCLUDED."version", "updatedAt" = CURRENT_TIMESTAMP', athleteId, Buffer.from(appearance.heroImage), appearance.version);
}

export function readLocalAppearance(databasePath: string, athleteId: string): Appearance | null {
  if (!existsSync(databasePath)) return null;
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dashboard_appearance'").get()) return null;
    const row = db.prepare('SELECT hero_image, version FROM dashboard_appearance WHERE athlete_id = ?').get(athleteId);
    return row ? { heroImage: row.hero_image as Uint8Array, version: String(row.version) } : null;
  } finally { db.close(); }
}
export function saveLocalAppearance(databasePath: string, athleteId: string, appearance: Appearance | null) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS dashboard_appearance (athlete_id TEXT PRIMARY KEY, hero_image BLOB NOT NULL, version TEXT NOT NULL)');
    if (!appearance) db.prepare('DELETE FROM dashboard_appearance WHERE athlete_id = ?').run(athleteId);
    else db.prepare('INSERT INTO dashboard_appearance (athlete_id, hero_image, version) VALUES (?, ?, ?) ON CONFLICT (athlete_id) DO UPDATE SET hero_image = excluded.hero_image, version = excluded.version').run(athleteId, appearance.heroImage, appearance.version);
  } finally { db.close(); }
}
