import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const LOCAL_PARSER_VERSION = "garmin-activities-csv-v2";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
};

const parseNumber = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/^'/, "").replaceAll(",", "");
  if (!normalized || normalized === "--") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value) => {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.round(parsed);
};

export const parseDurationSeconds = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized === "--") return null;
  const parts = normalized.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return null;
};

const normalizeSport = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized.includes("treadmill")) return "treadmill_run";
  if (normalized.includes("trail")) return "trail_run";
  if (normalized.includes("run")) return "run";
  return "other";
};

const parseOccurredAt = (value, utcOffset) => {
  const normalized = String(value ?? "").trim();
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) return null;
  const localOccurredAt = `${match[1]} ${match[2].padStart(2, "0")}:${match[3]}:${match[4]}`;
  const occurredAt = new Date(`${localOccurredAt.replace(" ", "T")}${utcOffset}`);
  return Number.isNaN(occurredAt.getTime()) ? null : { occurredAt, localOccurredAt };
};

export const computeDedupeHash = ({ athleteId, occurredAt, elapsedTimeS, distanceM, elevationGainM, sport }) => {
  const occurredBucket = new Date(Math.floor(occurredAt.getTime() / 60000) * 60000).toISOString();
  return sha256(
    [
      athleteId,
      sport,
      occurredBucket,
      String(Math.round(elapsedTimeS)),
      String(Math.round(distanceM)),
      String(Math.round(elevationGainM ?? 0)),
    ].join("|"),
  );
};

export const normalizeGarminActivity = (row, { athleteId = "athlete_001", utcOffset = "+02:00" } = {}) => {
  const occurrence = parseOccurredAt(row.Date, utcOffset);
  const elapsedTimeS = parseDurationSeconds(row["Elapsed Time"] || row.Time);
  const movingTimeS = parseDurationSeconds(row["Moving Time"]);
  const distanceKm = parseNumber(row.Distance);
  const sport = normalizeSport(row["Activity Type"]);
  const elevationGainM = parseNumber(row["Total Ascent"]) ?? 0;
  const elevationLossM = parseNumber(row["Total Descent"]) ?? 0;

  if (!occurrence) throw new Error("Date must use Garmin's YYYY-MM-DD H:mm:ss or YYYY-MM-DD HH:mm:ss format");
  if (elapsedTimeS === null || elapsedTimeS <= 0) throw new Error("Elapsed Time must be greater than zero");
  if (distanceKm === null || distanceKm <= 0) throw new Error("Distance must be greater than zero");
  if (sport === "other") throw new Error(`Unsupported activity type: ${row["Activity Type"] || "blank"}`);

  const { occurredAt, localOccurredAt } = occurrence;
  const avgPaceSecPerKm = parseDurationSeconds(row["Avg Pace"]) ?? Math.round(elapsedTimeS / distanceKm);
  const distanceM = Math.round(distanceKm * 1000);
  const endedAt = new Date(occurredAt.getTime() + elapsedTimeS * 1000);
  const normalized = {
    athleteId,
    sourceType: "csv",
    sourceActivityId: null,
    occurredAt: occurredAt.toISOString(),
    localOccurredAt,
    endedAt: endedAt.toISOString(),
    elapsedTimeS,
    movingTimeS,
    sport,
    title: String(row.Title ?? "").trim() || null,
    favorite: String(row.Favorite ?? "").toLowerCase() === "true",
    distanceM,
    avgPaceSecPerKm,
    bestPaceSecPerKm: parseDurationSeconds(row["Best Pace"]),
    avgGapSecPerKm: parseDurationSeconds(row["Avg GAP"]),
    elevationGainM,
    elevationLossM,
    minElevationM: parseNumber(row["Min Elevation"]),
    maxElevationM: parseNumber(row["Max Elevation"]),
    avgHrBpm: parseInteger(row["Avg HR"]),
    maxHrBpm: parseInteger(row["Max HR"]),
    avgCadenceSpm: parseNumber(row["Avg Run Cadence"]),
    maxCadenceSpm: parseNumber(row["Max Run Cadence"]),
    calories: parseInteger(row.Calories),
    aerobicTrainingEffect: parseNumber(row["Aerobic TE"]),
    avgStrideLengthM: parseNumber(row["Avg Stride Length"]),
    avgVerticalRatioPct: parseNumber(row["Avg Vertical Ratio"]),
    avgVerticalOscillationCm: parseNumber(row["Avg Vertical Oscillation"]),
    avgGroundContactTimeMs: parseNumber(row["Avg Ground Contact Time"]),
    normalizedPowerW: parseNumber(row["Normalized Power® (NP®)"]),
    trainingStressScore: parseNumber(row["Training Stress Score®"]),
    avgPowerW: parseNumber(row["Avg Power"]),
    maxPowerW: parseNumber(row["Max Power"]),
    steps: parseInteger(row.Steps),
    bodyBatteryDrain: parseInteger(row["Body Battery Drain"]),
    decompression: String(row.Decompression ?? "").trim() || null,
    bestLapTimeS: parseDurationSeconds(row["Best Lap Time"]),
    lapCount: parseInteger(row["Number of Laps"]),
  };

  return {
    ...normalized,
    dedupeHash: computeDedupeHash({
      athleteId,
      occurredAt,
      elapsedTimeS,
      distanceM,
      elevationGainM,
      sport,
    }),
  };
};

const setReadOnly = async (filePath) => {
  try {
    await chmod(filePath, 0o444);
  } catch {
    // Checksum validation still enforces immutability where chmod is not supported.
  }
};

export const captureRawExport = async ({
  sourcePath,
  vaultPath,
  checksum,
  sourceBuffer,
  parserVersion = LOCAL_PARSER_VERSION,
  rawSourceFolder = "Garmin",
}) => {
  const sourceStats = await stat(sourcePath);
  const captureDate = sourceStats.mtime.toISOString().slice(0, 10);
  const [year, month] = captureDate.split("-");
  const safeFilename = path.basename(sourcePath).replace(/[^A-Za-z0-9._-]/g, "-");
  const rawDirectory = path.join(vaultPath, "Raw", rawSourceFolder, year, month);
  const storedFilename = `${checksum.slice(0, 12)}-${safeFilename}`;
  const storagePath = path.join(rawDirectory, storedFilename);
  const manifestPath = `${storagePath}.manifest.json`;

  await mkdir(rawDirectory, { recursive: true });
  let reused = false;
  try {
    const existing = await readFile(storagePath);
    if (sha256(existing) !== checksum) throw new Error(`Immutable raw file checksum mismatch: ${storagePath}`);
    reused = true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await copyFile(sourcePath, storagePath, 1);
      await setReadOnly(storagePath);
    } else {
      throw error;
    }
  }

  try {
    const existingManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (existingManifest.checksumSha256 !== checksum) {
      throw new Error(`Immutable raw manifest checksum mismatch: ${manifestPath}`);
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      const manifest = {
        schemaVersion: 1,
        originalFilename: path.basename(sourcePath),
        checksumSha256: checksum,
        byteSize: sourceBuffer.byteLength,
        sourceLastModifiedAt: sourceStats.mtime.toISOString(),
        capturedAt: new Date().toISOString(),
        parserVersion,
      };
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await setReadOnly(manifestPath);
    } else {
      throw error;
    }
  }

  return { storagePath, manifestPath, reused };
};

export const createLocalSchema = (database) => {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      staged_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      normalized_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS raw_files (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      athlete_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      filename TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (athlete_id, checksum)
    );
    CREATE TABLE IF NOT EXISTS staging_activities (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      raw_file_id TEXT NOT NULL REFERENCES raw_files(id) ON DELETE CASCADE,
      athlete_id TEXT NOT NULL,
      raw_row_number INTEGER NOT NULL,
      dedupe_hash TEXT,
      occurred_at TEXT,
      ended_at TEXT,
      elapsed_time_s INTEGER,
      distance_m REAL,
      sport TEXT,
      status TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (import_id, raw_row_number)
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_file_id TEXT REFERENCES raw_files(id) ON DELETE SET NULL,
      source_activity_id TEXT,
      occurred_at TEXT NOT NULL,
      local_occurred_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      elapsed_time_s INTEGER NOT NULL CHECK (elapsed_time_s > 0),
      moving_time_s INTEGER,
      sport TEXT NOT NULL,
      title TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      distance_m REAL NOT NULL CHECK (distance_m > 0),
      avg_pace_sec_per_km REAL NOT NULL CHECK (avg_pace_sec_per_km > 0),
      best_pace_sec_per_km REAL,
      avg_gap_sec_per_km REAL,
      elevation_gain_m REAL NOT NULL DEFAULT 0,
      elevation_loss_m REAL NOT NULL DEFAULT 0,
      min_elevation_m REAL,
      max_elevation_m REAL,
      avg_hr_bpm INTEGER,
      max_hr_bpm INTEGER,
      avg_cadence_spm REAL,
      max_cadence_spm REAL,
      calories INTEGER,
      aerobic_training_effect REAL,
      avg_stride_length_m REAL,
      avg_vertical_ratio_pct REAL,
      avg_vertical_oscillation_cm REAL,
      avg_ground_contact_time_ms REAL,
      normalized_power_w REAL,
      training_stress_score REAL,
      avg_power_w REAL,
      max_power_w REAL,
      steps INTEGER,
      body_battery_drain INTEGER,
      decompression TEXT,
      best_lap_time_s INTEGER,
      lap_count INTEGER,
      dedupe_hash TEXT NOT NULL,
      source_payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (athlete_id, dedupe_hash)
    );
    CREATE INDEX IF NOT EXISTS activities_athlete_occurred_at_idx
      ON activities (athlete_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS staging_import_status_idx
      ON staging_activities (import_id, status, raw_row_number);
    CREATE TABLE IF NOT EXISTS route_signatures (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
      athlete_id TEXT NOT NULL,
      start_lat REAL NOT NULL,
      start_lon REAL NOT NULL,
      end_lat REAL NOT NULL,
      end_lon REAL NOT NULL,
      bbox_min_lat REAL NOT NULL,
      bbox_min_lon REAL NOT NULL,
      bbox_max_lat REAL NOT NULL,
      bbox_max_lon REAL NOT NULL,
      polyline TEXT,
      elev_profile_json TEXT,
      route_hash TEXT NOT NULL,
      point_count INTEGER NOT NULL CHECK (point_count > 0),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS route_signatures_athlete_hash_idx
      ON route_signatures (athlete_id, route_hash);
  `);
};

export const currentImportSummary = (database, importId) =>
  database.prepare(`
    SELECT id AS importId, status, staged_count AS stagedCount,
      normalized_count AS normalizedCount, duplicate_count AS duplicateCount,
      rejected_count AS rejectedCount, error_count AS errorCount,
      created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
    FROM imports WHERE id = ?
  `).get(importId);

export const importGarminCsv = async ({
  sourcePath,
  vaultPath,
  databasePath,
  athleteId = "athlete_001",
  utcOffset = "+02:00",
}) => {
  if (!sourcePath) throw new Error("sourcePath is required");
  if (!vaultPath) throw new Error("vaultPath is required");
  if (!databasePath) throw new Error("databasePath is required");
  if (!/^[+-]\d{2}:\d{2}$/.test(utcOffset)) throw new Error("utcOffset must use +HH:mm or -HH:mm");

  const sourceBuffer = await readFile(sourcePath);
  const checksum = sha256(sourceBuffer);
  const rows = parseCsv(sourceBuffer.toString("utf8"));
  if (rows.length === 0) throw new Error("Garmin CSV has no activity rows");
  const requiredHeaders = ["Activity Type", "Date", "Distance", "Avg Pace"];
  for (const header of requiredHeaders) {
    if (!(header in rows[0])) throw new Error(`Garmin CSV is missing required header: ${header}`);
  }
  if (!("Elapsed Time" in rows[0]) && !("Time" in rows[0])) {
    throw new Error("Garmin CSV is missing required header: Elapsed Time or Time");
  }

  const raw = await captureRawExport({ sourcePath, vaultPath, checksum, sourceBuffer });
  await mkdir(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  createLocalSchema(database);

  const importId = `import_${checksum.slice(0, 24)}`;
  const rawFileId = `raw_${checksum.slice(0, 24)}`;
  const idempotencyKey = `${athleteId}:${checksum}:${LOCAL_PARSER_VERSION}`;
  const existingImport = database.prepare("SELECT id FROM imports WHERE idempotency_key = ?").get(idempotencyKey);
  if (existingImport) {
    const result = {
      reused: true,
      checksumSha256: checksum,
      rowCount: rows.length,
      raw,
      databasePath,
      import: currentImportSummary(database, existingImport.id),
      totalNormalizedActivities: database
        .prepare("SELECT COUNT(*) AS count FROM activities WHERE athlete_id = ?")
        .get(athleteId).count,
    };
    database.close();
    return result;
  }

  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO imports (id, athlete_id, idempotency_key, status, created_at, updated_at)
      VALUES (?, ?, ?, 'uploaded', ?, ?)
    `).run(importId, athleteId, idempotencyKey, now, now);
    database.prepare(`
      INSERT INTO raw_files (
        id, import_id, athlete_id, source_type, filename, byte_size, checksum,
        storage_path, parser_version, created_at
      ) VALUES (?, ?, ?, 'csv', ?, ?, ?, ?, ?, ?)
    `).run(
      rawFileId,
      importId,
      athleteId,
      path.basename(sourcePath),
      sourceBuffer.byteLength,
      checksum,
      raw.storagePath,
      LOCAL_PARSER_VERSION,
      now,
    );

    const insertStaging = database.prepare(`
      INSERT INTO staging_activities (
        id, import_id, raw_file_id, athlete_id, raw_row_number, dedupe_hash,
        occurred_at, ended_at, elapsed_time_s, distance_m, sport, status,
        error_code, error_message, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let stagedCount = 0;
    let rejectedCount = 0;
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const stagingId = `stage_${sha256(`${importId}:${rowNumber}`).slice(0, 24)}`;
      try {
        const activity = normalizeGarminActivity(row, { athleteId, utcOffset });
        insertStaging.run(
          stagingId,
          importId,
          rawFileId,
          athleteId,
          rowNumber,
          activity.dedupeHash,
          activity.occurredAt,
          activity.endedAt,
          activity.elapsedTimeS,
          activity.distanceM,
          activity.sport,
          "staged",
          null,
          null,
          JSON.stringify({ normalized: activity, source: row }),
          now,
          now,
        );
        stagedCount += 1;
      } catch (error) {
        insertStaging.run(
          stagingId,
          importId,
          rawFileId,
          athleteId,
          rowNumber,
          null,
          null,
          null,
          null,
          null,
          null,
          "rejected",
          "GARMIN_ROW_INVALID",
          (error instanceof Error ? error.message : "Invalid Garmin row").slice(0, 2000),
          JSON.stringify({ source: row }),
          now,
          now,
        );
        rejectedCount += 1;
      }
    });

    database.prepare(`
      UPDATE imports SET status = 'normalizing', staged_count = ?, rejected_count = ?, updated_at = ?
      WHERE id = ?
    `).run(stagedCount, rejectedCount, now, importId);

    const stagedRows = database.prepare(`
      SELECT id, dedupe_hash AS dedupeHash, payload_json AS payloadJson
      FROM staging_activities WHERE import_id = ? AND status = 'staged'
      ORDER BY raw_row_number
    `).all(importId);
    const existingActivity = database.prepare(
      "SELECT id FROM activities WHERE athlete_id = ? AND dedupe_hash = ?",
    );
    const insertActivity = database.prepare(`
      INSERT INTO activities (
        id, athlete_id, source_type, source_file_id, source_activity_id,
        occurred_at, local_occurred_at, ended_at, elapsed_time_s, moving_time_s,
        sport, title, favorite, distance_m, avg_pace_sec_per_km,
        best_pace_sec_per_km, avg_gap_sec_per_km, elevation_gain_m, elevation_loss_m,
        min_elevation_m, max_elevation_m, avg_hr_bpm, max_hr_bpm,
        avg_cadence_spm, max_cadence_spm, calories, aerobic_training_effect,
        avg_stride_length_m, avg_vertical_ratio_pct, avg_vertical_oscillation_cm,
        avg_ground_contact_time_ms, normalized_power_w, training_stress_score,
        avg_power_w, max_power_w, steps, body_battery_drain, decompression,
        best_lap_time_s, lap_count, dedupe_hash, source_payload_json, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    const updateStaging = database.prepare(`
      UPDATE staging_activities SET status = ?, error_code = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `);
    let normalizedCount = 0;
    let duplicateCount = 0;

    for (const stagedRow of stagedRows) {
      if (existingActivity.get(athleteId, stagedRow.dedupeHash)) {
        updateStaging.run("duplicate", now, stagedRow.id);
        duplicateCount += 1;
        continue;
      }
      const payload = JSON.parse(stagedRow.payloadJson);
      const activity = payload.normalized;
      const activityId = `activity_${activity.dedupeHash.slice(0, 24)}`;
      insertActivity.run(
        activityId,
        athleteId,
        activity.sourceType,
        rawFileId,
        activity.sourceActivityId,
        activity.occurredAt,
        activity.localOccurredAt,
        activity.endedAt,
        activity.elapsedTimeS,
        activity.movingTimeS,
        activity.sport,
        activity.title,
        activity.favorite ? 1 : 0,
        activity.distanceM,
        activity.avgPaceSecPerKm,
        activity.bestPaceSecPerKm,
        activity.avgGapSecPerKm,
        activity.elevationGainM,
        activity.elevationLossM,
        activity.minElevationM,
        activity.maxElevationM,
        activity.avgHrBpm,
        activity.maxHrBpm,
        activity.avgCadenceSpm,
        activity.maxCadenceSpm,
        activity.calories,
        activity.aerobicTrainingEffect,
        activity.avgStrideLengthM,
        activity.avgVerticalRatioPct,
        activity.avgVerticalOscillationCm,
        activity.avgGroundContactTimeMs,
        activity.normalizedPowerW,
        activity.trainingStressScore,
        activity.avgPowerW,
        activity.maxPowerW,
        activity.steps,
        activity.bodyBatteryDrain,
        activity.decompression,
        activity.bestLapTimeS,
        activity.lapCount,
        activity.dedupeHash,
        JSON.stringify(payload.source),
        now,
      );
      updateStaging.run("normalized", now, stagedRow.id);
      normalizedCount += 1;
    }

    const completedAt = new Date().toISOString();
    database.prepare(`
      UPDATE imports SET status = 'completed', normalized_count = ?, duplicate_count = ?,
        updated_at = ?, completed_at = ? WHERE id = ?
    `).run(normalizedCount, duplicateCount, completedAt, completedAt, importId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    database.close();
    throw error;
  }

  const result = {
    reused: false,
    checksumSha256: checksum,
    rowCount: rows.length,
    raw,
    databasePath,
    import: currentImportSummary(database, importId),
    totalNormalizedActivities: database
      .prepare("SELECT COUNT(*) AS count FROM activities WHERE athlete_id = ?")
      .get(athleteId).count,
  };
  database.close();
  return result;
};
