import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  captureRawExport,
  computeDedupeHash,
  createLocalSchema,
  currentImportSummary,
  importGarminCsv,
  sha256,
} from "./local-garmin-pipeline.js";
import { openLocalDatabase } from "./local-database.js";

export const DEFAULT_ACTIVITY_IMPORT_MAX_BYTES = 15 * 1024 * 1024;
export const GPX_PARSER_VERSION = "standard-gpx-1.0-1.1-v1";

export class ActivityImportError extends Error {
  constructor(message, { code = "VALIDATION_ERROR", httpStatus = 400, details = [] } = {}) {
    super(message);
    this.name = "ActivityImportError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

const fail = (message, options) => {
  throw new ActivityImportError(message, options);
};

const localName = (qualifiedName) => qualifiedName.split(":").at(-1).toLowerCase();

const decodeXml = (value) => value.replace(
  /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
  (entity, token) => {
    const normalized = token.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "quot") return '"';
    if (normalized === "apos") return "'";
    const codePoint = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return String.fromCodePoint(codePoint);
  },
);

const validateXmlStructure = (source) => {
  if (/<!DOCTYPE\b/i.test(source) || /<!ENTITY\b/i.test(source)) {
    fail("GPX DTD and entity declarations are not allowed");
  }
  if (source.includes("\u0000")) fail("GPX contains invalid null bytes");
  const commentsRemoved = source.replace(/<!--[\s\S]*?-->/g, "");
  if (/<!--|-->/.test(commentsRemoved)) fail("GPX contains a malformed XML comment");
  if (/<!\[CDATA\[|<![^-]/i.test(commentsRemoved)) fail("Unsupported XML declaration in GPX");

  const stack = [];
  let root = null;
  const tagPattern = /<\s*(\/?)\s*([A-Za-z_][\w.:-]*)([^<>]*?)(\/?)\s*>/g;
  let match;
  while ((match = tagPattern.exec(commentsRemoved)) !== null) {
    const [, closing, qualifiedName, , selfClosing] = match;
    if (closing) {
      const opened = stack.pop();
      if (opened !== qualifiedName) fail(`Malformed GPX XML: expected </${opened ?? "none"}> before </${qualifiedName}>`);
    } else {
      if (!root) root = { qualifiedName, openingTag: match[0] };
      if (!selfClosing) stack.push(qualifiedName);
    }
  }
  if (!root || localName(root.qualifiedName) !== "gpx") fail("File root must be a GPX element");
  if (stack.length > 0) fail(`Malformed GPX XML: unclosed <${stack.at(-1)}>`);

  const version = /\bversion\s*=\s*["'](1\.[01])["']/i.exec(root.openingTag)?.[1];
  if (!version) fail("GPX version must be 1.0 or 1.1");
  const expectedNamespace = `http://www.topografix.com/GPX/1/${version.endsWith("0") ? "0" : "1"}`;
  const namespaces = [...root.openingTag.matchAll(/\bxmlns(?::[\w.-]+)?\s*=\s*["']([^"']+)["']/gi)]
    .map((namespaceMatch) => namespaceMatch[1]);
  if (!namespaces.includes(expectedNamespace)) fail(`GPX ${version} namespace is missing or invalid`);
};

const childText = (body, name) => {
  const expression = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${name}\\b[^>]*>\\s*([^<]+?)\\s*</(?:[A-Za-z_][\\w.-]*:)?${name}\\s*>`,
    "i",
  );
  const value = expression.exec(body)?.[1];
  return value === undefined ? null : decodeXml(value.trim());
};

const requiredCoordinate = (attributes, name, minimum, maximum) => {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes);
  const value = Number(match?.[1]);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`GPX track point has invalid ${name}`);
  }
  return value;
};

const optionalNumber = (value, label) => {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`GPX track point has invalid ${label}`);
  return parsed;
};

const radians = (degrees) => degrees * Math.PI / 180;
export const haversineDistanceM = (left, right) => {
  const earthRadiusM = 6371008.8;
  const latitudeDelta = radians(right.lat - left.lat);
  const longitudeDelta = radians(right.lon - left.lon);
  const latitude1 = radians(left.lat);
  const latitude2 = radians(right.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(haversine)));
};

const downsample = (points, maximum = 200) => {
  if (points.length <= maximum) return points;
  const selected = [];
  for (let index = 0; index < maximum; index += 1) {
    selected.push(points[Math.round(index * (points.length - 1) / (maximum - 1))]);
  }
  return selected;
};

const toLocalTimestamp = (date, utcOffset) => {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(utcOffset);
  if (!match) fail("utcOffset must use +HH:mm or -HH:mm");
  const direction = match[1] === "+" ? 1 : -1;
  const offsetMinutes = direction * (Number(match[2]) * 60 + Number(match[3]));
  return new Date(date.getTime() + offsetMinutes * 60000).toISOString().slice(0, 19).replace("T", " ");
};

export const parseGpxActivity = (sourceBuffer, { athleteId = "athlete_001", utcOffset = "+02:00" } = {}) => {
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(sourceBuffer);
  } catch {
    fail("GPX must be valid UTF-8");
  }
  validateXmlStructure(source);

  const trackExpression = /<(?:[A-Za-z_][\w.-]*:)?trk\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?trk\s*>/gi;
  const tracks = [...source.matchAll(trackExpression)];
  if (tracks.length === 0) fail("GPX must contain one track activity");
  if (tracks.length > 1) fail("GPX contains multiple track activities; upload one activity per file");
  const trackBody = tracks[0][1];
  const title = childText(trackBody, "name") || "GPX run";
  const segmentExpression = /<(?:[A-Za-z_][\w.-]*:)?trkseg\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?trkseg\s*>/gi;
  const segmentBodies = [...trackBody.matchAll(segmentExpression)].map((match) => match[1]);
  if (segmentBodies.length === 0) fail("GPX track must contain at least one track segment");

  const segments = [];
  for (const segmentBody of segmentBodies) {
    const pointExpression = /<(?:[A-Za-z_][\w.-]*:)?trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?trkpt\s*>)/gi;
    const points = [];
    for (const pointMatch of segmentBody.matchAll(pointExpression)) {
      const body = pointMatch[2] ?? "";
      const timeText = childText(body, "time");
      const timestamp = timeText === null ? null : new Date(timeText);
      if (timestamp && Number.isNaN(timestamp.getTime())) fail("GPX track point has an invalid timestamp");
      points.push({
        lat: requiredCoordinate(pointMatch[1], "lat", -90, 90),
        lon: requiredCoordinate(pointMatch[1], "lon", -180, 180),
        elevationM: optionalNumber(childText(body, "ele"), "elevation"),
        timestamp,
        heartRateBpm: optionalNumber(childText(body, "hr"), "heart rate"),
        cadenceSpm: optionalNumber(childText(body, "cad"), "cadence"),
      });
    }
    if (points.length > 0) segments.push(points);
  }
  const allPoints = segments.flat();
  if (allPoints.length < 2) fail("GPX track must contain at least two track points");
  const timedPoints = allPoints.filter((point) => point.timestamp !== null);
  if (timedPoints.length < 2) fail("GPX track must contain at least two timestamped points");
  for (let index = 1; index < timedPoints.length; index += 1) {
    if (timedPoints[index].timestamp < timedPoints[index - 1].timestamp) {
      fail("GPX track point timestamps must be chronological");
    }
  }

  let distanceM = 0;
  let movingTimeS = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  for (const segment of segments) {
    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1];
      const point = segment[index];
      const segmentDistanceM = haversineDistanceM(previous, point);
      distanceM += segmentDistanceM;
      if (previous.timestamp && point.timestamp) {
        const deltaS = (point.timestamp.getTime() - previous.timestamp.getTime()) / 1000;
        if (deltaS > 0 && deltaS <= 300 && segmentDistanceM >= 1) movingTimeS += deltaS;
      }
      if (previous.elevationM !== null && point.elevationM !== null) {
        const elevationDeltaM = point.elevationM - previous.elevationM;
        if (elevationDeltaM > 0) elevationGainM += elevationDeltaM;
        else elevationLossM += Math.abs(elevationDeltaM);
      }
    }
  }
  if (distanceM <= 0) fail("GPX track distance must be greater than zero");
  const occurredAt = timedPoints[0].timestamp;
  const endedAt = timedPoints.at(-1).timestamp;
  const elapsedTimeS = Math.round((endedAt.getTime() - occurredAt.getTime()) / 1000);
  if (elapsedTimeS <= 0) fail("GPX elapsed time must be greater than zero");

  const elevations = allPoints.map((point) => point.elevationM).filter((value) => value !== null);
  const heartRates = allPoints.map((point) => point.heartRateBpm).filter((value) => value !== null);
  const cadences = allPoints.map((point) => point.cadenceSpm).filter((value) => value !== null);
  const average = (values) => values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
  const compactPoints = downsample(allPoints);
  const routeCoordinates = compactPoints.map((point) => [
    Number(point.lat.toFixed(6)),
    Number(point.lon.toFixed(6)),
  ]);
  const elevationProfile = compactPoints
    .filter((point) => point.elevationM !== null)
    .map((point) => Number(point.elevationM.toFixed(1)));
  const routeSummary = {
    startLat: allPoints[0].lat,
    startLon: allPoints[0].lon,
    endLat: allPoints.at(-1).lat,
    endLon: allPoints.at(-1).lon,
    bboxMinLat: Math.min(...allPoints.map((point) => point.lat)),
    bboxMinLon: Math.min(...allPoints.map((point) => point.lon)),
    bboxMaxLat: Math.max(...allPoints.map((point) => point.lat)),
    bboxMaxLon: Math.max(...allPoints.map((point) => point.lon)),
    polyline: JSON.stringify(routeCoordinates),
    elevProfile: elevationProfile.length > 0 ? elevationProfile : null,
    routeHash: sha256(JSON.stringify(routeCoordinates)),
    pointCount: allPoints.length,
  };
  const roundedDistanceM = Math.round(distanceM);
  const roundedElevationGainM = Math.round(elevationGainM);
  const normalized = {
    athleteId,
    sourceType: "gpx",
    sourceActivityId: null,
    occurredAt: occurredAt.toISOString(),
    localOccurredAt: toLocalTimestamp(occurredAt, utcOffset),
    endedAt: endedAt.toISOString(),
    elapsedTimeS,
    movingTimeS: movingTimeS > 0 ? Math.round(movingTimeS) : null,
    sport: "run",
    title,
    favorite: false,
    distanceM: roundedDistanceM,
    avgPaceSecPerKm: (movingTimeS > 0 ? movingTimeS : elapsedTimeS) / (roundedDistanceM / 1000),
    bestPaceSecPerKm: null,
    avgGapSecPerKm: null,
    elevationGainM: roundedElevationGainM,
    elevationLossM: Math.round(elevationLossM),
    minElevationM: elevations.length > 0 ? Math.min(...elevations) : null,
    maxElevationM: elevations.length > 0 ? Math.max(...elevations) : null,
    avgHrBpm: heartRates.length > 0 ? Math.round(average(heartRates)) : null,
    maxHrBpm: heartRates.length > 0 ? Math.round(Math.max(...heartRates)) : null,
    avgCadenceSpm: average(cadences),
    maxCadenceSpm: cadences.length > 0 ? Math.max(...cadences) : null,
    calories: null,
    aerobicTrainingEffect: null,
    avgStrideLengthM: null,
    avgVerticalRatioPct: null,
    avgVerticalOscillationCm: null,
    avgGroundContactTimeMs: null,
    normalizedPowerW: null,
    trainingStressScore: null,
    avgPowerW: null,
    maxPowerW: null,
    steps: null,
    bodyBatteryDrain: null,
    decompression: null,
    bestLapTimeS: null,
    lapCount: segments.length,
  };
  normalized.dedupeHash = computeDedupeHash({
    athleteId,
    occurredAt,
    elapsedTimeS,
    distanceM: roundedDistanceM,
    elevationGainM: roundedElevationGainM,
    sport: normalized.sport,
  });
  return {
    activity: normalized,
    routeSummary,
    coverage: {
      pointCount: allPoints.length,
      timestampPointCount: timedPoints.length,
      elevationPointCount: elevations.length,
      heartRatePointCount: heartRates.length,
      cadencePointCount: cadences.length,
      routeAvailable: true,
    },
  };
};

const insertActivity = (database, { activityId, rawFileId, activity, sourcePayload, now }) => {
  database.prepare(`
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
  `).run(
    activityId, activity.athleteId, activity.sourceType, rawFileId, activity.sourceActivityId,
    activity.occurredAt, activity.localOccurredAt, activity.endedAt, activity.elapsedTimeS, activity.movingTimeS,
    activity.sport, activity.title, activity.favorite ? 1 : 0, activity.distanceM, activity.avgPaceSecPerKm,
    activity.bestPaceSecPerKm, activity.avgGapSecPerKm, activity.elevationGainM, activity.elevationLossM,
    activity.minElevationM, activity.maxElevationM, activity.avgHrBpm, activity.maxHrBpm,
    activity.avgCadenceSpm, activity.maxCadenceSpm, activity.calories, activity.aerobicTrainingEffect,
    activity.avgStrideLengthM, activity.avgVerticalRatioPct, activity.avgVerticalOscillationCm,
    activity.avgGroundContactTimeMs, activity.normalizedPowerW, activity.trainingStressScore,
    activity.avgPowerW, activity.maxPowerW, activity.steps, activity.bodyBatteryDrain, activity.decompression,
    activity.bestLapTimeS, activity.lapCount, activity.dedupeHash, JSON.stringify(sourcePayload), now,
  );
};

const insertRouteSignature = (database, { activityId, athleteId, route, now }) => {
  database.prepare(`
    INSERT OR IGNORE INTO route_signatures (
      id, activity_id, athlete_id, start_lat, start_lon, end_lat, end_lon,
      bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon, polyline,
      elev_profile_json, route_hash, point_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `route_${sha256(`${activityId}:${route.routeHash}`).slice(0, 24)}`,
    activityId,
    athleteId,
    route.startLat,
    route.startLon,
    route.endLat,
    route.endLon,
    route.bboxMinLat,
    route.bboxMinLon,
    route.bboxMaxLat,
    route.bboxMaxLon,
    route.polyline,
    route.elevProfile ? JSON.stringify(route.elevProfile) : null,
    route.routeHash,
    route.pointCount,
    now,
  );
};

export const importGpxActivity = async ({
  sourcePath,
  vaultPath,
  databasePath,
  athleteId = "athlete_001",
  utcOffset = "+02:00",
}) => {
  const sourceBuffer = await readFile(sourcePath);
  const parsed = parseGpxActivity(sourceBuffer, { athleteId, utcOffset });
  const checksum = sha256(sourceBuffer);
  const raw = await captureRawExport({
    sourcePath,
    vaultPath,
    checksum,
    sourceBuffer,
    parserVersion: GPX_PARSER_VERSION,
    rawSourceFolder: "GPX",
  });
  const database = openLocalDatabase({ databasePath });
  createLocalSchema(database);
  const importId = `import_${checksum.slice(0, 24)}`;
  const rawFileId = `raw_${checksum.slice(0, 24)}`;
  const idempotencyKey = `${athleteId}:${checksum}:${GPX_PARSER_VERSION}`;
  const existingImport = database.prepare("SELECT id FROM imports WHERE idempotency_key = ?").get(idempotencyKey);
  if (existingImport) {
    const result = {
      sourceType: "gpx",
      reused: true,
      checksumSha256: checksum,
      rowCount: 1,
      raw,
      databasePath,
      import: currentImportSummary(database, existingImport.id),
      totalNormalizedActivities: database.prepare("SELECT COUNT(*) AS count FROM activities WHERE athlete_id = ?").get(athleteId).count,
      coverage: parsed.coverage,
      parseWarnings: [],
    };
    database.close();
    return result;
  }

  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO imports (id, athlete_id, idempotency_key, status, staged_count, created_at, updated_at)
      VALUES (?, ?, ?, 'normalizing', 1, ?, ?)
    `).run(importId, athleteId, idempotencyKey, now, now);
    database.prepare(`
      INSERT INTO raw_files (
        id, import_id, athlete_id, source_type, filename, byte_size, checksum,
        storage_path, parser_version, created_at
      ) VALUES (?, ?, ?, 'gpx', ?, ?, ?, ?, ?, ?)
    `).run(rawFileId, importId, athleteId, path.basename(sourcePath), sourceBuffer.byteLength, checksum, raw.storagePath, GPX_PARSER_VERSION, now);

    const activity = parsed.activity;
    const stagingId = `stage_${sha256(`${importId}:1`).slice(0, 24)}`;
    const duplicate = database.prepare("SELECT id FROM activities WHERE athlete_id = ? AND dedupe_hash = ?")
      .get(athleteId, activity.dedupeHash);
    const status = duplicate ? "duplicate" : "normalized";
    database.prepare(`
      INSERT INTO staging_activities (
        id, import_id, raw_file_id, athlete_id, raw_row_number, dedupe_hash,
        occurred_at, ended_at, elapsed_time_s, distance_m, sport, status,
        payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stagingId, importId, rawFileId, athleteId, activity.dedupeHash,
      activity.occurredAt, activity.endedAt, activity.elapsedTimeS, activity.distanceM,
      activity.sport, status, JSON.stringify({ normalized: activity, coverage: parsed.coverage }), now, now,
    );

    let normalizedCount = 0;
    let duplicateCount = 0;
    if (duplicate) {
      duplicateCount = 1;
      insertRouteSignature(database, {
        activityId: duplicate.id,
        athleteId,
        route: parsed.routeSummary,
        now,
      });
    } else {
      const activityId = `activity_${activity.dedupeHash.slice(0, 24)}`;
      insertActivity(database, {
        activityId,
        rawFileId,
        activity,
        sourcePayload: { parserVersion: GPX_PARSER_VERSION, coverage: parsed.coverage },
        now,
      });
      insertRouteSignature(database, { activityId, athleteId, route: parsed.routeSummary, now });
      normalizedCount = 1;
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
    sourceType: "gpx",
    reused: false,
    checksumSha256: checksum,
    rowCount: 1,
    raw,
    databasePath,
    import: currentImportSummary(database, importId),
    totalNormalizedActivities: database.prepare("SELECT COUNT(*) AS count FROM activities WHERE athlete_id = ?").get(athleteId).count,
    coverage: parsed.coverage,
    parseWarnings: [],
  };
  database.close();
  return result;
};

const supportedContentTypes = {
  ".csv": new Set(["text/csv", "application/csv", "application/vnd.ms-excel", "application/octet-stream"]),
  ".gpx": new Set(["application/gpx+xml", "application/xml", "text/xml", "application/octet-stream"]),
};

const csvCoverage = (result) => {
  const database = new DatabaseSync(result.databasePath, { readOnly: true });
  try {
    const rawFileId = `raw_${result.checksumSha256.slice(0, 24)}`;
    const coverage = database.prepare(`
      SELECT COUNT(*) AS normalizedActivityCount,
        SUM(CASE WHEN avg_hr_bpm IS NOT NULL OR max_hr_bpm IS NOT NULL THEN 1 ELSE 0 END) AS activitiesWithHeartRate,
        SUM(CASE WHEN avg_cadence_spm IS NOT NULL OR max_cadence_spm IS NOT NULL THEN 1 ELSE 0 END) AS activitiesWithCadence
      FROM activities WHERE source_file_id = ?
    `).get(rawFileId);
    return {
      activityRowCount: result.rowCount,
      normalizedActivityCount: coverage.normalizedActivityCount,
      activitiesWithTimestamps: coverage.normalizedActivityCount,
      activitiesWithHeartRate: coverage.activitiesWithHeartRate ?? 0,
      activitiesWithCadence: coverage.activitiesWithCadence ?? 0,
      activitiesWithRoutes: 0,
    };
  } finally {
    database.close();
  }
};

export const importLocalActivityFile = async ({
  sourcePath,
  contentType = "",
  vaultPath,
  databasePath,
  athleteId = "athlete_001",
  utcOffset = "+02:00",
  maxBytes = DEFAULT_ACTIVITY_IMPORT_MAX_BYTES,
}) => {
  if (!sourcePath || !vaultPath || !databasePath) fail("sourcePath, vaultPath, and databasePath are required");
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) fail("maxBytes must be a positive integer");
  const fileStats = await stat(sourcePath);
  if (!fileStats.isFile()) fail("Activity import source must be a file");
  if (fileStats.size === 0) fail("Activity import file is empty");
  if (fileStats.size > maxBytes) {
    fail(`Activity import exceeds the ${maxBytes} byte limit`, { code: "VALIDATION_ERROR", httpStatus: 413 });
  }
  const extension = path.extname(sourcePath).toLowerCase();
  const allowedTypes = supportedContentTypes[extension];
  if (!allowedTypes) fail("Only .csv and .gpx activity files are supported", { httpStatus: 415 });
  const normalizedContentType = String(contentType).split(";", 1)[0].trim().toLowerCase();
  if (normalizedContentType && !allowedTypes.has(normalizedContentType)) {
    fail(`Content type ${normalizedContentType} does not match ${extension}`, { httpStatus: 415 });
  }

  if (extension === ".csv") {
    const result = await importGarminCsv({ sourcePath, vaultPath, databasePath, athleteId, utcOffset });
    return { ...result, sourceType: "csv", coverage: csvCoverage(result), parseWarnings: [] };
  }
  return importGpxActivity({ sourcePath, vaultPath, databasePath, athleteId, utcOffset });
};
