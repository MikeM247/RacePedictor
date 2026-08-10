import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

const workingDirectory = process.cwd();
const repositoryRoot = path.basename(workingDirectory) === "web" && path.basename(path.dirname(workingDirectory)) === "apps"
  ? path.resolve(workingDirectory, "../..")
  : workingDirectory;

export const defaultLocalDatabasePath = path.join(
  repositoryRoot,
  ".local",
  "racepredictor",
  "racepredictor.sqlite",
);

const clampLimit = (limit) => {
  const numeric = Number(limit ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(numeric) || numeric < 1) throw new Error("limit must be a positive integer");
  return Math.min(numeric, MAX_PAGE_SIZE);
};

const validateDate = (value, fieldName) => {
  if (value === null || value === undefined || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${fieldName} must use YYYY-MM-DD`);
  return value;
};

const toSummary = (row) => ({
  id: row.id,
  athleteId: row.athleteId,
  title: row.title,
  occurredAt: row.occurredAt,
  localOccurredAt: row.localOccurredAt,
  sport: row.sport,
  distanceM: row.distanceM,
  elapsedTimeS: row.elapsedTimeS,
  avgPaceSecPerKm: row.avgPaceSecPerKm,
  elevationGainM: row.elevationGainM,
  hrAvailable: row.avgHrBpm !== null || row.maxHrBpm !== null,
  cadenceAvailable: row.avgCadenceSpm !== null || row.maxCadenceSpm !== null,
});

export const listLocalActivities = ({
  databasePath = process.env.RACEPREDICTOR_DATABASE_PATH || defaultLocalDatabasePath,
  athleteId = "athlete_001",
  cursor = null,
  limit,
  sport = null,
  search = null,
  from = null,
  to = null,
} = {}) => {
  const pageSize = clampLimit(limit);
  const fromDate = validateDate(from, "from");
  const toDate = validateDate(to, "to");
  if (fromDate && toDate && fromDate > toDate) throw new Error("from must be on or before to");
  const normalizedSearch = typeof search === "string" ? search.trim().slice(0, 100) : "";
  const supportedSports = new Set(["run", "trail_run", "treadmill_run", "other"]);
  if (sport && !supportedSports.has(sport)) throw new Error(`Unsupported sport: ${sport}`);

  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    let cursorRow = null;
    if (cursor) {
      cursorRow = database.prepare(`
        SELECT occurred_at AS occurredAt, id
        FROM activities WHERE athlete_id = ? AND id = ?
      `).get(athleteId, cursor);
      if (!cursorRow) throw new Error("Invalid activity cursor");
    }

    const clauses = ["athlete_id = ?"];
    const parameters = [athleteId];
    if (sport) {
      clauses.push("sport = ?");
      parameters.push(sport);
    }
    if (normalizedSearch) {
      clauses.push("LOWER(COALESCE(title, '')) LIKE ?");
      parameters.push(`%${normalizedSearch.toLowerCase()}%`);
    }
    if (fromDate) {
      clauses.push("local_occurred_at >= ?");
      parameters.push(`${fromDate} 00:00:00`);
    }
    if (toDate) {
      clauses.push("local_occurred_at <= ?");
      parameters.push(`${toDate} 23:59:59`);
    }
    if (cursorRow) {
      clauses.push("(occurred_at < ? OR (occurred_at = ? AND id < ?))");
      parameters.push(cursorRow.occurredAt, cursorRow.occurredAt, cursorRow.id);
    }

    const rows = database.prepare(`
      SELECT
        id, athlete_id AS athleteId, title, occurred_at AS occurredAt,
        local_occurred_at AS localOccurredAt, sport, distance_m AS distanceM,
        elapsed_time_s AS elapsedTimeS, avg_pace_sec_per_km AS avgPaceSecPerKm,
        elevation_gain_m AS elevationGainM, avg_hr_bpm AS avgHrBpm,
        max_hr_bpm AS maxHrBpm, avg_cadence_spm AS avgCadenceSpm,
        max_cadence_spm AS maxCadenceSpm
      FROM activities
      WHERE ${clauses.join(" AND ")}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ?
    `).all(...parameters, pageSize + 1);
    const hasMore = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    return {
      items: pageRows.map(toSummary),
      nextCursor: hasMore ? pageRows[pageRows.length - 1].id : undefined,
    };
  } finally {
    database.close();
  }
};

export const getLocalActivity = ({
  activityId,
  databasePath = process.env.RACEPREDICTOR_DATABASE_PATH || defaultLocalDatabasePath,
  athleteId = "athlete_001",
}) => {
  if (!activityId) throw new Error("activityId is required");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database.prepare(`
      SELECT
        id, athlete_id AS athleteId, source_type AS sourceType,
        source_file_id AS sourceFileId, source_activity_id AS sourceActivityId,
        title, occurred_at AS occurredAt, local_occurred_at AS localOccurredAt,
        ended_at AS endedAt, elapsed_time_s AS elapsedTimeS, moving_time_s AS movingTimeS,
        sport, distance_m AS distanceM, avg_pace_sec_per_km AS avgPaceSecPerKm,
        elevation_gain_m AS elevationGainM, elevation_loss_m AS elevationLossM,
        min_elevation_m AS minElevationM, max_elevation_m AS maxElevationM,
        avg_hr_bpm AS avgHrBpm, max_hr_bpm AS maxHrBpm,
        avg_cadence_spm AS avgCadenceSpm, max_cadence_spm AS maxCadenceSpm,
        calories, aerobic_training_effect AS aerobicTrainingEffect,
        avg_stride_length_m AS avgStrideLengthM,
        avg_vertical_ratio_pct AS avgVerticalRatioPct,
        avg_vertical_oscillation_cm AS avgVerticalOscillationCm,
        avg_ground_contact_time_ms AS avgGroundContactTimeMs,
        normalized_power_w AS normalizedPowerW, training_stress_score AS trainingStressScore,
        avg_power_w AS avgPowerW, max_power_w AS maxPowerW, steps,
        body_battery_drain AS bodyBatteryDrain, lap_count AS lapCount,
        dedupe_hash AS dedupeHash, created_at AS createdAt
      FROM activities
      WHERE athlete_id = ? AND id = ?
    `).get(athleteId, activityId);
    if (!row) return null;
    let routeSignature = null;
    try {
      const route = database.prepare(`
        SELECT id, activity_id AS activityId, athlete_id AS athleteId,
          start_lat AS startLat, start_lon AS startLon, end_lat AS endLat, end_lon AS endLon,
          bbox_min_lat AS bboxMinLat, bbox_min_lon AS bboxMinLon,
          bbox_max_lat AS bboxMaxLat, bbox_max_lon AS bboxMaxLon,
          polyline, elev_profile_json AS elevProfileJson, route_hash AS routeHash,
          created_at AS createdAt
        FROM route_signatures WHERE activity_id = ?
      `).get(activityId);
      if (route) {
        const { elevProfileJson, ...routeFields } = route;
        routeSignature = {
          ...routeFields,
          elevProfile: elevProfileJson ? JSON.parse(elevProfileJson) : null,
        };
      }
    } catch (error) {
      if (!(error instanceof Error) || !/no such table: route_signatures/i.test(error.message)) throw error;
    }
    return {
      ...toSummary(row),
      sourceType: row.sourceType,
      sourceFileId: row.sourceFileId,
      sourceActivityId: row.sourceActivityId,
      endedAt: row.endedAt,
      movingTimeS: row.movingTimeS,
      elevationLossM: row.elevationLossM,
      minElevationM: row.minElevationM,
      maxElevationM: row.maxElevationM,
      avgHrBpm: row.avgHrBpm,
      maxHrBpm: row.maxHrBpm,
      avgCadenceSpm: row.avgCadenceSpm,
      maxCadenceSpm: row.maxCadenceSpm,
      calories: row.calories,
      aerobicTrainingEffect: row.aerobicTrainingEffect,
      avgStrideLengthM: row.avgStrideLengthM,
      avgVerticalRatioPct: row.avgVerticalRatioPct,
      avgVerticalOscillationCm: row.avgVerticalOscillationCm,
      avgGroundContactTimeMs: row.avgGroundContactTimeMs,
      normalizedPowerW: row.normalizedPowerW,
      trainingStressScore: row.trainingStressScore,
      avgPowerW: row.avgPowerW,
      maxPowerW: row.maxPowerW,
      steps: row.steps,
      bodyBatteryDrain: row.bodyBatteryDrain,
      lapCount: row.lapCount,
      dedupeHash: row.dedupeHash,
      createdAt: row.createdAt,
      splits: [],
      routeSignature,
    };
  } finally {
    database.close();
  }
};
