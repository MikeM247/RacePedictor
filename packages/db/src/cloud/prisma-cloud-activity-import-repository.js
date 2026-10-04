import { randomUUID } from "node:crypto";
import { parseGpxActivity } from "../local-activity-file-importer.js";
import { computeDedupeHash, normalizeGarminActivity, parseCsv, sha256 } from "../local-garmin-pipeline.js";
import { assertAthleteScope } from "./athlete-scope.js";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_CSV_ROWS_PER_BATCH = 100;
const CSV_PARSER_VERSION = "garmin-activities-csv-v2";
const GPX_PARSER_VERSION = "standard-gpx-1.0-1.1-v1";

export class CloudActivityImportError extends Error {
  constructor(message, code = "VALIDATION_ERROR", status = 400) {
    super(message);
    this.name = "CloudActivityImportError";
    this.code = code;
    this.httpStatus = status;
  }
}

export class PrismaCloudActivityImportRepository {
  #prisma;
  #objects;

  constructor({ prisma, objects }) {
    if (!prisma?.import || !prisma?.rawFile || !prisma?.activity || !prisma?.$transaction) throw new Error("A Prisma activity import client is required");
    if (!objects?.createPresignedPut || !objects?.head || !objects?.readImmutableForReplay) throw new Error("An upload object store is required");
    this.#prisma = prisma;
    this.#objects = objects;
  }

  async initiate(scope, { filename, contentType, sizeBytes, checksumSha256, idempotencyKey = null }) {
    const athleteId = assertAthleteScope(scope);
    validateUploadMetadata(filename, contentType, sizeBytes, checksumSha256);
    const existing = idempotencyKey
      ? await this.#prisma.import.findUnique({ where: { athleteId_idempotencyKey: { athleteId, idempotencyKey } }, include: { rawFiles: true } })
      : null;
    const key = existing?.rawFiles?.[0]?.storagePath ?? `athletes/${athleteId}/providers/uploads/${randomUUID()}`;
    const record = existing ?? await this.#prisma.import.create({
      data: { id: `import_${randomUUID().replaceAll("-", "")}`, athleteId, idempotencyKey, status: "uploaded" },
    });
    if (!existing) {
      await this.#prisma.rawFile.create({
        data: { id: `raw_${randomUUID().replaceAll("-", "")}`, importId: record.id, athleteId, sourceType: sourceTypeFor(filename), filename, mimeType: contentType, byteSize: sizeBytes, checksum: checksumSha256, storagePath: key },
      });
    }
    const upload = await this.#objects.createPresignedPut(scope, { key, contentType, contentLength: sizeBytes, checksumSha256, expiresInSeconds: 600 });
    return { importId: record.id, uploadKey: key, expiresInSeconds: 600, ...upload };
  }

  async complete(scope, { importId, filename, contentType, sizeBytes, checksumSha256, utcOffset = "+02:00" }) {
    const athleteId = assertAthleteScope(scope);
    validateUploadMetadata(filename, contentType, sizeBytes, checksumSha256);
    const imported = await this.#prisma.import.findFirst({ where: { id: importId, athleteId }, include: { rawFiles: true } });
    if (!imported) throw new CloudActivityImportError("Activity import was not found", "NOT_FOUND", 404);
    if (imported.status === "completed") return summary(imported, { reused: true, sourceType: sourceTypeFor(filename), parseWarnings: [] });
    const rawFile = imported.rawFiles[0];
    const key = rawFile?.storagePath;
    if (!key) throw new CloudActivityImportError("Upload has not been initiated", "VALIDATION_ERROR");
    const stored = await this.#objects.head(scope, key);
    if (!stored || stored.provider !== "uploads" || stored.checksumSha256 !== checksumSha256 || stored.sizeBytes !== sizeBytes) {
      throw new CloudActivityImportError("Uploaded content failed checksum or size verification", "INTEGRITY_ERROR", 409);
    }
    const body = await this.#objects.readImmutableForReplay(scope, key, "uploads");
    if (!body) throw new CloudActivityImportError("Uploaded content is unavailable", "UNAVAILABLE", 503);
    const sourceType = sourceTypeFor(filename);
    const normalized = normalizeUpload(body, sourceType, { athleteId, utcOffset });
    const parserVersion = sourceType === "gpx" ? GPX_PARSER_VERSION : CSV_PARSER_VERSION;
    const parseWarnings = normalized.warnings;
    const result = await this.#prisma.$transaction(async (transaction) => {
      const existingRaw = await transaction.rawFile.findUnique({ where: { athleteId_checksum: { athleteId, checksum: checksumSha256 } } });
      const persistedRaw = existingRaw ?? await transaction.rawFile.create({
        data: { id: rawFile?.id ?? `raw_${randomUUID().replaceAll("-", "")}`, importId, athleteId, sourceType, filename, mimeType: contentType, byteSize: sizeBytes, checksum: checksumSha256, storagePath: key, parserVersion, parseWarnings },
      });
      const counts = { staged: normalized.activities.length, normalized: 0, duplicate: 0, rejected: normalized.rejected };
      let rowNumber = 0;
      for (const item of normalized.activities) {
        rowNumber += 1;
        const activity = item.activity;
        const existing = await transaction.activity.findUnique({ where: { athleteId_dedupeHash: { athleteId, dedupeHash: activity.dedupeHash } }, select: { id: true } });
        const status = existing ? "duplicate" : "normalized";
        await transaction.stagingActivity.create({
          data: { id: `stage_${randomUUID().replaceAll("-", "")}`, importId, rawFileId: persistedRaw.id, athleteId, sourceType, sourceActivityId: activity.sourceActivityId, dedupeHash: activity.dedupeHash, occurredAt: new Date(activity.occurredAt), endedAt: new Date(activity.endedAt), elapsedTimeS: activity.elapsedTimeS, distanceM: activity.distanceM, sport: activity.sport, status, payloadJson: { normalized: activity, coverage: item.coverage ?? null } },
        });
        if (existing) {
          counts.duplicate += 1;
          continue;
        }
        const activityId = `activity_${activity.dedupeHash.slice(0, 24)}`;
        await transaction.activity.create({ data: toActivityData({ athleteId, activityId, rawFileId: persistedRaw.id, activity }) });
        const contentHash = sha256(JSON.stringify(activity));
        await transaction.activityRevision.create({ data: { athleteId, activityId, rawObjectId: null, revisionNumber: 1, contentHash, normalizerVersion: parserVersion, changeSummary: { source: "upload", filename, checksumSha256 }, recordedAt: new Date(activity.occurredAt) } });
        if (["run", "trail_run", "treadmill_run"].includes(activity.sport)) {
          await transaction.activityReviewRequest.create({ data: { id: `activity_review_request_${activityId}`, athleteId, activityId, activityRevision: 1, status: "queued", availableAt: new Date() } });
        }
        const latest = await transaction.syncChange.aggregate({ where: { athleteId }, _max: { cursor: true } });
        await transaction.syncChange.create({ data: { athleteId, cursor: (latest._max.cursor ?? 0n) + 1n, entityType: "activity", entityId: activityId, operation: "upsert", entityVersion: 1, selectedFields: { id: activityId, occurredAt: activity.occurredAt, sport: activity.sport, distanceM: activity.distanceM }, occurredAt: new Date(activity.occurredAt) } });
        await transaction.analyticsRecomputeMarker.upsert({ where: { athleteId_activityId: { athleteId, activityId } }, create: { athleteId, activityId, reason: "activity_upsert", activityOccurredAt: new Date(activity.occurredAt) }, update: { reason: "activity_upsert", activityOccurredAt: new Date(activity.occurredAt), requestedAt: new Date() } });
        counts.normalized += 1;
      }
      const completedAt = new Date();
      const updated = await transaction.import.update({ where: { id_athleteId: { id: importId, athleteId } }, data: { status: "completed", stagedCount: counts.staged, normalizedCount: counts.normalized, duplicateCount: counts.duplicate, rejectedCount: counts.rejected, parseWarnings, completedAt } });
      return { updated, counts };
    });
    return summary(result.updated, { reused: false, sourceType, parseWarnings, coverage: normalized.coverage });
  }

  async importMultipart(scope, { filename, contentType, body, utcOffset = "+02:00", idempotencyKey = null }) {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
    const checksumSha256 = sha256(bytes);
    const initiated = await this.initiate(scope, { filename, contentType, sizeBytes: bytes.byteLength, checksumSha256, idempotencyKey });
    const capturedAt = new Date().toISOString();
    await this.#objects.put(scope, { metadata: { athleteId: scope.athleteId, provider: "uploads", key: initiated.uploadKey, checksumSha256, contentType, sizeBytes: bytes.byteLength, capturedAt }, body: bytes });
    return this.complete(scope, { importId: initiated.importId, filename, contentType, sizeBytes: bytes.byteLength, checksumSha256, utcOffset });
  }
}

function normalizeUpload(body, sourceType, options) {
  if (sourceType === "gpx") {
    const parsed = parseGpxActivity(body, options);
    return { activities: [{ activity: parsed.activity, coverage: parsed.coverage }], rejected: 0, warnings: [], coverage: parsed.coverage };
  }
  const rows = parseCsv(Buffer.from(body).toString("utf8"));
  if (rows.length === 0) throw new CloudActivityImportError("CSV has no activity rows");
  for (const header of ["Activity Type", "Date", "Distance"]) {
    if (!(header in rows[0])) throw new CloudActivityImportError(`CSV is missing required header: ${header}`);
  }
  if (!("Elapsed Time" in rows[0]) && !("Time" in rows[0])) throw new CloudActivityImportError("CSV is missing required header: Elapsed Time or Time");
  const warnings = [];
  const activities = [];
  let rejected = 0;
  for (let batchStart = 0; batchStart < rows.length; batchStart += MAX_CSV_ROWS_PER_BATCH) {
    const batch = rows.slice(batchStart, batchStart + MAX_CSV_ROWS_PER_BATCH);
    for (const [offset, row] of batch.entries()) {
      const index = batchStart + offset;
      try { activities.push({ activity: normalizeGarminActivity(row, options), coverage: { row: index + 1 } }); }
      catch (error) { rejected += 1; warnings.push(`CSV row ${index + 2}: ${error instanceof Error ? error.message : "invalid activity"}`); }
    }
  }
  return { activities, rejected, warnings, coverage: { rows: rows.length, normalizedRows: activities.length } };
}

function toActivityData({ athleteId, activityId, rawFileId, activity }) {
  return {
    id: activityId, athleteId, sourceType: activity.sourceType, sourceFileId: rawFileId, sourceActivityId: activity.sourceActivityId, title: activity.title ?? null,
    occurredAt: new Date(activity.occurredAt), localOccurredAt: activity.localOccurredAt ?? null, endedAt: new Date(activity.endedAt), elapsedTimeS: activity.elapsedTimeS, movingTimeS: activity.movingTimeS ?? null, sport: activity.sport,
    distanceM: activity.distanceM, avgPaceSecPerKm: activity.avgPaceSecPerKm, elevationGainM: activity.elevationGainM ?? 0, elevationLossM: activity.elevationLossM ?? 0,
    minElevationM: activity.minElevationM ?? null, maxElevationM: activity.maxElevationM ?? null, avgHrBpm: activity.avgHrBpm ?? null, maxHrBpm: activity.maxHrBpm ?? null, minHrBpm: null, hrAvailable: activity.avgHrBpm !== null && activity.avgHrBpm !== undefined,
    avgCadenceSpm: activity.avgCadenceSpm ?? null, maxCadenceSpm: activity.maxCadenceSpm ?? null, cadenceAvailable: activity.avgCadenceSpm !== null && activity.avgCadenceSpm !== undefined, calories: activity.calories ?? null, avgPowerW: activity.avgPowerW ?? null, maxPowerW: activity.maxPowerW ?? null,
    lapCount: activity.lapCount ?? null, paceVariability: null, hrDriftPct: null, hillDifficulty: null, dedupeHash: activity.dedupeHash, deletedAt: null,
  };
}

function validateUploadMetadata(filename, contentType, sizeBytes, checksumSha256) {
  if (typeof filename !== "string" || !/\.(csv|gpx)$/iu.test(filename)) throw new CloudActivityImportError("Only CSV and GPX uploads are supported");
  if (typeof contentType !== "string" || contentType.length > 200) throw new CloudActivityImportError("Upload content type is invalid");
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_UPLOAD_BYTES) throw new CloudActivityImportError("Upload exceeds the 15 MiB limit", "PAYLOAD_TOO_LARGE", 413);
  if (typeof checksumSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(checksumSha256)) throw new CloudActivityImportError("Upload checksum is invalid");
}

function sourceTypeFor(filename) { return /\.gpx$/iu.test(filename) ? "gpx" : "csv"; }

function summary(row, extras) {
  return { importId: row.id, status: row.status, reused: extras.reused, sourceType: extras.sourceType, stagedCount: row.stagedCount, normalizedCount: row.normalizedCount, duplicateCount: row.duplicateCount, rejectedCount: row.rejectedCount, parseWarnings: extras.parseWarnings ?? (Array.isArray(row.parseWarnings) ? row.parseWarnings : []), coverage: extras.coverage, totalNormalizedActivities: row.normalizedCount, analyticsRefreshed: false };
}
