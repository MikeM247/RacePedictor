import { createHash, randomUUID } from "node:crypto";
import { openLocalDatabase } from "./local-database.js";

const DEFAULT_TIMEZONE = "Africa/Johannesburg";
const DEFAULT_REMINDER_TIME = "06:30";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class CoachingRepositoryError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "CoachingRepositoryError";
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details) => {
  throw new CoachingRepositoryError(code, message, details);
};

const requireString = (value, fieldName) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("VALIDATION_ERROR", `${fieldName} is required`);
  }
  return value.trim();
};

const optionalString = (value, fieldName) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") fail("VALIDATION_ERROR", `${fieldName} must be a string`);
  return value.trim() || null;
};

const requireRecord = (value, fieldName) => {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("VALIDATION_ERROR", `${fieldName} must be an object`);
  }
  return value;
};

const requireDate = (value, fieldName) => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    fail("VALIDATION_ERROR", `${fieldName} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail("VALIDATION_ERROR", `${fieldName} must be a valid calendar date`);
  }
  return value;
};

const optionalDate = (value, fieldName) => {
  if (value === null || value === undefined || value === "") return null;
  return requireDate(value, fieldName);
};

const requireNonnegativeNumber = (value, fieldName, { integer = false, nullable = true } = {}) => {
  if (value === null || value === undefined) {
    if (nullable) return null;
    fail("VALIDATION_ERROR", `${fieldName} is required`);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    fail("VALIDATION_ERROR", `${fieldName} must be a non-negative${integer ? " integer" : " number"}`);
  }
  return value;
};

const parseJson = (value, fallback) => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toBoolean = (value) => value === 1;

const mapProfile = (row) => row ? ({
  athleteId: row.athleteId,
  displayName: row.displayName,
  timezone: row.timezone,
  preferredUnits: row.preferredUnits,
  motivation: row.motivation,
  constraints: parseJson(row.constraintsJson, {}),
  preferences: parseJson(row.preferencesJson, {}),
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
}) : null;

const mapGoal = (row) => row ? ({
  id: row.id,
  athleteId: row.athleteId,
  version: row.version,
  lifecycle: row.lifecycle,
  isPrimary: toBoolean(row.isPrimary),
  goalType: row.goalType,
  title: row.title,
  targetDate: row.targetDate,
  details: parseJson(row.detailsJson, {}),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  settledAt: row.settledAt,
  supersededAt: row.supersededAt,
}) : null;

const mapRoutineDay = (row) => ({
  dayOfWeek: row.dayOfWeek,
  available: toBoolean(row.available),
  maxDurationMinutes: row.maxDurationMinutes,
  preferredTime: row.preferredTime,
  notes: row.notes,
});

const mapContextSnapshot = (row) => row ? ({
  id: row.id,
  athleteId: row.athleteId,
  inputChecksum: row.inputChecksum,
  historyCoverage: {
    athleteId: row.athleteId,
    activityCount: row.historyActivityCount,
    earliestOccurredAt: row.historyEarliestAt,
    latestOccurredAt: row.historyLatestAt,
    totalDistanceM: row.historyDistanceM,
    sourceTypes: parseJson(row.activitySourcesJson, []),
  },
  metadata: parseJson(row.metadataJson, {}),
  createdAt: row.createdAt,
}) : null;

const mapWorkout = (row) => row ? ({
  id: row.id,
  planId: row.planId,
  athleteId: row.athleteId,
  localDate: row.localDate,
  position: row.position,
  title: row.title,
  workoutType: row.workoutType,
  durationMinutes: row.durationMinutes,
  distanceM: row.distanceM,
  intensity: row.intensity,
  details: parseJson(row.detailsJson, {}),
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
}) : null;

const mapDailyBrief = (row) => row ? ({
  id: row.id,
  athleteId: row.athleteId,
  localDate: row.localDate,
  planId: row.planId,
  workoutId: row.workoutId,
  message: row.message,
  payload: parseJson(row.payloadJson, {}),
  source: row.source,
  generatedAt: row.generatedAt,
  updatedAt: row.updatedAt,
}) : null;

const mapReminderPreferences = (row) => row ? ({
  athleteId: row.athleteId,
  enabled: toBoolean(row.enabled),
  localTime: row.localTime,
  timezone: row.timezone,
  deliveryChannel: row.deliveryChannel,
  externalStatus: row.externalStatus,
  externalReference: row.externalReference,
  preferences: parseJson(row.preferencesJson, {}),
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
}) : null;

const profileSelect = `
  SELECT athlete_id AS athleteId, display_name AS displayName, timezone,
    preferred_units AS preferredUnits, motivation, constraints_json AS constraintsJson,
    preferences_json AS preferencesJson, revision, created_at AS createdAt, updated_at AS updatedAt
  FROM coaching_profiles WHERE athlete_id = ?
`;

const goalSelect = `
  SELECT id, athlete_id AS athleteId, version, lifecycle, is_primary AS isPrimary,
    goal_type AS goalType, title, target_date AS targetDate, details_json AS detailsJson,
    created_at AS createdAt, updated_at AS updatedAt, settled_at AS settledAt,
    superseded_at AS supersededAt
  FROM coaching_goals
`;

const workoutSelect = `
  SELECT id, plan_id AS planId, athlete_id AS athleteId, local_date AS localDate,
    position, title, workout_type AS workoutType, duration_minutes AS durationMinutes,
    distance_m AS distanceM, intensity, details_json AS detailsJson, revision,
    created_at AS createdAt, updated_at AS updatedAt
  FROM coaching_planned_workouts
`;

const contextSelect = `
  SELECT id, athlete_id AS athleteId, input_checksum AS inputChecksum,
    history_activity_count AS historyActivityCount, history_earliest_at AS historyEarliestAt,
    history_latest_at AS historyLatestAt, history_distance_m AS historyDistanceM,
    activity_sources_json AS activitySourcesJson, metadata_json AS metadataJson,
    created_at AS createdAt
  FROM coaching_context_snapshots
`;

const briefSelect = `
  SELECT id, athlete_id AS athleteId, local_date AS localDate, plan_id AS planId,
    workout_id AS workoutId, message, payload_json AS payloadJson, source,
    generated_at AS generatedAt, updated_at AS updatedAt
  FROM coaching_daily_briefs
`;

const reminderSelect = `
  SELECT athlete_id AS athleteId, enabled, local_time AS localTime, timezone,
    delivery_channel AS deliveryChannel, external_status AS externalStatus,
    external_reference AS externalReference, preferences_json AS preferencesJson,
    revision, created_at AS createdAt, updated_at AS updatedAt
  FROM coaching_reminder_preferences WHERE athlete_id = ?
`;

export const createLocalCoachingRepository = ({
  databasePath,
  athleteId = "athlete_001",
  clock = () => new Date(),
  idFactory = randomUUID,
} = {}) => {
  const normalizedAthleteId = requireString(athleteId, "athleteId");
  const database = openLocalDatabase({ databasePath });
  let closed = false;

  const ensureOpen = () => {
    if (closed) fail("REPOSITORY_CLOSED", "The coaching repository is closed");
  };

  const now = () => {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) fail("INVALID_CLOCK", "clock returned an invalid date");
    return date.toISOString();
  };

  const newId = (prefix) => `${prefix}_${idFactory()}`;

  const listWorkoutCalendarEvents = (workoutId) => database.prepare(`
    SELECT event_type AS eventType, event_json AS eventJson, created_at AS createdAt
    FROM coaching_plan_audit_events
    WHERE athlete_id = ? AND workout_id = ?
      AND event_type IN ('calendar_adjusted', 'workout_moved')
    ORDER BY created_at, id
  `).all(normalizedAthleteId, workoutId).map((row) => ({
    eventType: row.eventType,
    event: parseJson(row.eventJson, {}),
    createdAt: row.createdAt,
  }));

  const deriveEffectiveWorkout = (workout) => {
    if (!workout) return null;
    const events = listWorkoutCalendarEvents(workout.id);
    const legacyMoves = events
      .filter(({ eventType }) => eventType === "workout_moved")
      .sort((left, right) => Number(left.event.previousRevision) - Number(right.event.previousRevision));
    const firstLegacyMove = legacyMoves[0]?.event;
    const prescribedLocalDate = typeof firstLegacyMove?.fromDate === "string"
      ? firstLegacyMove.fromDate
      : workout.localDate;
    let effectiveLocalDate = workout.localDate;
    let calendarStatus = "upcoming";
    let effectiveRevision = workout.revision;
    let effectiveUpdatedAt = workout.updatedAt;

    for (const { eventType, event, createdAt } of events) {
      if (eventType === "workout_moved") {
        const revision = Number(event.revision);
        if (Number.isInteger(revision) && revision >= effectiveRevision && typeof event.toDate === "string") {
          effectiveLocalDate = event.toDate;
          effectiveRevision = revision;
          effectiveUpdatedAt = createdAt;
        }
        continue;
      }
      const result = event.result && typeof event.result === "object" && !Array.isArray(event.result)
        ? event.result
        : {};
      const revision = Number(result.revision);
      if (!Number.isInteger(revision) || revision <= effectiveRevision) continue;
      if (typeof result.effectiveDate === "string") effectiveLocalDate = result.effectiveDate;
      if (result.status === "upcoming" || result.status === "skipped") calendarStatus = result.status;
      effectiveRevision = revision;
      effectiveUpdatedAt = createdAt;
    }

    return {
      ...workout,
      localDate: effectiveLocalDate,
      prescribedLocalDate,
      effectiveLocalDate,
      calendarStatus,
      revision: effectiveRevision,
      updatedAt: effectiveUpdatedAt,
    };
  };

  const transaction = (operation) => {
    ensureOpen();
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };

  const getGoal = (goalId) => mapGoal(database.prepare(`${goalSelect} WHERE athlete_id = ? AND id = ?`).get(
    normalizedAthleteId,
    goalId,
  ));

  const getRawWorkout = (workoutId) => mapWorkout(database.prepare(`${workoutSelect} WHERE athlete_id = ? AND id = ?`).get(
    normalizedAthleteId,
    workoutId,
  ));

  const getWorkout = (workoutId) => deriveEffectiveWorkout(getRawWorkout(workoutId));

  const getPlan = (planId) => {
    const row = database.prepare(`
      SELECT id, athlete_id AS athleteId, version, goal_id AS goalId,
        context_snapshot_id AS contextSnapshotId, lifecycle, title,
        start_date AS startDate, end_date AS endDate, summary_json AS summaryJson,
        revision, created_at AS createdAt, updated_at AS updatedAt,
        activated_at AS activatedAt, superseded_at AS supersededAt
      FROM coaching_plans WHERE athlete_id = ? AND id = ?
    `).get(normalizedAthleteId, planId);
    if (!row) return null;
    return {
      id: row.id,
      athleteId: row.athleteId,
      version: row.version,
      goalId: row.goalId,
      contextSnapshotId: row.contextSnapshotId,
      lifecycle: row.lifecycle,
      title: row.title,
      startDate: row.startDate,
      endDate: row.endDate,
      summary: parseJson(row.summaryJson, {}),
      revision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      activatedAt: row.activatedAt,
      supersededAt: row.supersededAt,
      workouts: database.prepare(`
        ${workoutSelect}
        WHERE athlete_id = ? AND plan_id = ?
        ORDER BY local_date, position, id
      `).all(normalizedAthleteId, planId).map(mapWorkout).map(deriveEffectiveWorkout),
    };
  };

  const insertAuditEvent = ({ planId, workoutId = null, eventType, event = {}, createdAt }) => {
    database.prepare(`
      INSERT INTO coaching_plan_audit_events (
        id, athlete_id, plan_id, workout_id, event_type, event_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId("audit"),
      normalizedAthleteId,
      planId,
      workoutId,
      eventType,
      JSON.stringify(event),
      createdAt,
    );
  };

  const loadProfile = () => {
    ensureOpen();
    return mapProfile(database.prepare(profileSelect).get(normalizedAthleteId));
  };

  const saveProfile = (input = {}) => transaction(() => {
    const existing = loadProfile();
    const timestamp = now();
    const displayName = input.displayName === undefined
      ? existing?.displayName ?? null
      : optionalString(input.displayName, "displayName");
    const timezone = input.timezone === undefined
      ? existing?.timezone ?? DEFAULT_TIMEZONE
      : requireString(input.timezone, "timezone");
    const preferredUnits = input.preferredUnits === undefined
      ? existing?.preferredUnits ?? "metric"
      : input.preferredUnits;
    if (preferredUnits !== "metric" && preferredUnits !== "imperial") {
      fail("VALIDATION_ERROR", "preferredUnits must be metric or imperial");
    }
    const motivation = input.motivation === undefined
      ? existing?.motivation ?? null
      : optionalString(input.motivation, "motivation");
    const constraints = input.constraints === undefined
      ? existing?.constraints ?? {}
      : requireRecord(input.constraints, "constraints");
    const preferences = input.preferences === undefined
      ? existing?.preferences ?? {}
      : requireRecord(input.preferences, "preferences");

    database.prepare(`
      INSERT INTO coaching_profiles (
        athlete_id, display_name, timezone, preferred_units, motivation,
        constraints_json, preferences_json, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(athlete_id) DO UPDATE SET
        display_name = excluded.display_name,
        timezone = excluded.timezone,
        preferred_units = excluded.preferred_units,
        motivation = excluded.motivation,
        constraints_json = excluded.constraints_json,
        preferences_json = excluded.preferences_json,
        revision = coaching_profiles.revision + 1,
        updated_at = excluded.updated_at
    `).run(
      normalizedAthleteId,
      displayName,
      timezone,
      preferredUnits,
      motivation,
      JSON.stringify(constraints),
      JSON.stringify(preferences),
      timestamp,
      timestamp,
    );
    return loadProfile();
  });

  const loadRoutine = () => {
    ensureOpen();
    const row = database.prepare(`
      SELECT athlete_id AS athleteId, sessions_per_week AS sessionsPerWeek,
        long_run_day AS longRunDay, timezone, preferences_json AS preferencesJson,
        revision, created_at AS createdAt, updated_at AS updatedAt
      FROM coaching_routines WHERE athlete_id = ?
    `).get(normalizedAthleteId);
    if (!row) return null;
    return {
      athleteId: row.athleteId,
      sessionsPerWeek: row.sessionsPerWeek,
      longRunDay: row.longRunDay,
      timezone: row.timezone,
      preferences: parseJson(row.preferencesJson, {}),
      revision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      days: database.prepare(`
        SELECT day_of_week AS dayOfWeek, available,
          max_duration_minutes AS maxDurationMinutes, preferred_time AS preferredTime, notes
        FROM coaching_routine_days WHERE athlete_id = ? ORDER BY day_of_week
      `).all(normalizedAthleteId).map(mapRoutineDay),
    };
  };

  const saveRoutine = (input = {}) => {
    if (!Array.isArray(input.days) || input.days.length === 0) {
      fail("VALIDATION_ERROR", "days must contain at least one routine day");
    }
    const seenDays = new Set();
    const days = input.days.map((day, index) => {
      const record = requireRecord(day, `days[${index}]`);
      if (!Number.isInteger(record.dayOfWeek) || record.dayOfWeek < 0 || record.dayOfWeek > 6) {
        fail("VALIDATION_ERROR", `days[${index}].dayOfWeek must be an integer from 0 to 6`);
      }
      if (seenDays.has(record.dayOfWeek)) fail("VALIDATION_ERROR", "routine days must be unique");
      seenDays.add(record.dayOfWeek);
      if (record.available !== undefined && typeof record.available !== "boolean") {
        fail("VALIDATION_ERROR", `days[${index}].available must be boolean`);
      }
      const preferredTime = optionalString(record.preferredTime, `days[${index}].preferredTime`);
      if (preferredTime && !TIME_PATTERN.test(preferredTime)) {
        fail("VALIDATION_ERROR", `days[${index}].preferredTime must use HH:mm`);
      }
      const maxDurationMinutes = requireNonnegativeNumber(
        record.maxDurationMinutes,
        `days[${index}].maxDurationMinutes`,
        { integer: true },
      );
      if (maxDurationMinutes === 0) {
        fail("VALIDATION_ERROR", `days[${index}].maxDurationMinutes must be greater than zero`);
      }
      return {
        dayOfWeek: record.dayOfWeek,
        available: record.available ?? false,
        maxDurationMinutes,
        preferredTime,
        notes: optionalString(record.notes, `days[${index}].notes`),
      };
    });

    const sessionsPerWeek = requireNonnegativeNumber(input.sessionsPerWeek, "sessionsPerWeek", { integer: true });
    if (sessionsPerWeek !== null && sessionsPerWeek > 14) {
      fail("VALIDATION_ERROR", "sessionsPerWeek must not exceed 14");
    }
    const longRunDay = input.longRunDay === null || input.longRunDay === undefined
      ? null
      : input.longRunDay;
    if (longRunDay !== null && (!Number.isInteger(longRunDay) || longRunDay < 0 || longRunDay > 6)) {
      fail("VALIDATION_ERROR", "longRunDay must be an integer from 0 to 6");
    }
    const timezone = input.timezone === undefined
      ? DEFAULT_TIMEZONE
      : requireString(input.timezone, "timezone");
    const preferences = requireRecord(input.preferences, "preferences");

    return transaction(() => {
      const timestamp = now();
      database.prepare(`
        INSERT INTO coaching_routines (
          athlete_id, sessions_per_week, long_run_day, timezone,
          preferences_json, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(athlete_id) DO UPDATE SET
          sessions_per_week = excluded.sessions_per_week,
          long_run_day = excluded.long_run_day,
          timezone = excluded.timezone,
          preferences_json = excluded.preferences_json,
          revision = coaching_routines.revision + 1,
          updated_at = excluded.updated_at
      `).run(
        normalizedAthleteId,
        sessionsPerWeek,
        longRunDay,
        timezone,
        JSON.stringify(preferences),
        timestamp,
        timestamp,
      );
      database.prepare("DELETE FROM coaching_routine_days WHERE athlete_id = ?").run(normalizedAthleteId);
      const insertDay = database.prepare(`
        INSERT INTO coaching_routine_days (
          athlete_id, day_of_week, available, max_duration_minutes,
          preferred_time, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const day of days) {
        insertDay.run(
          normalizedAthleteId,
          day.dayOfWeek,
          day.available ? 1 : 0,
          day.maxDurationMinutes,
          day.preferredTime,
          day.notes,
          timestamp,
          timestamp,
        );
      }
      return loadRoutine();
    });
  };

  const createGoal = (input = {}) => transaction(() => {
    const goalType = requireString(input.goalType, "goalType");
    const title = requireString(input.title, "title");
    const targetDate = optionalDate(input.targetDate, "targetDate");
    const details = requireRecord(input.details, "details");
    const isPrimary = input.isPrimary ?? true;
    if (typeof isPrimary !== "boolean") fail("VALIDATION_ERROR", "isPrimary must be boolean");
    const version = database.prepare(`
      SELECT COALESCE(MAX(version), 0) + 1 AS version
      FROM coaching_goals WHERE athlete_id = ?
    `).get(normalizedAthleteId).version;
    const timestamp = now();
    const goalId = newId("goal");
    database.prepare(`
      INSERT INTO coaching_goals (
        id, athlete_id, version, lifecycle, is_primary, goal_type,
        title, target_date, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      goalId,
      normalizedAthleteId,
      version,
      isPrimary ? 1 : 0,
      goalType,
      title,
      targetDate,
      JSON.stringify(details),
      timestamp,
      timestamp,
    );
    return getGoal(goalId);
  });

  const settleGoal = (goalId) => transaction(() => {
    const normalizedGoalId = requireString(goalId, "goalId");
    const goal = getGoal(normalizedGoalId);
    if (!goal) fail("NOT_FOUND", "Goal was not found");
    if (goal.lifecycle === "settled") return goal;
    if (goal.lifecycle !== "draft") {
      fail("INVALID_STATE", "Only a draft goal can be settled", { lifecycle: goal.lifecycle });
    }
    const timestamp = now();
    if (goal.isPrimary) {
      database.prepare(`
        UPDATE coaching_goals
        SET lifecycle = 'superseded', superseded_at = ?, updated_at = ?
        WHERE athlete_id = ? AND lifecycle = 'settled' AND is_primary = 1 AND id <> ?
      `).run(timestamp, timestamp, normalizedAthleteId, normalizedGoalId);
    }
    const result = database.prepare(`
      UPDATE coaching_goals
      SET lifecycle = 'settled', settled_at = ?, updated_at = ?
      WHERE athlete_id = ? AND id = ? AND lifecycle = 'draft'
    `).run(timestamp, timestamp, normalizedAthleteId, normalizedGoalId);
    if (result.changes !== 1) fail("CONFLICT", "Goal lifecycle changed before it could be settled");
    return getGoal(normalizedGoalId);
  });

  const loadSettledGoal = () => {
    ensureOpen();
    return mapGoal(database.prepare(`
      ${goalSelect}
      WHERE athlete_id = ? AND lifecycle = 'settled' AND is_primary = 1
    `).get(normalizedAthleteId));
  };

  const listGoals = () => {
    ensureOpen();
    return database.prepare(`${goalSelect} WHERE athlete_id = ? ORDER BY version DESC`)
      .all(normalizedAthleteId)
      .map(mapGoal);
  };

  const getHistoryCoverage = () => {
    ensureOpen();
    const table = database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activities'
    `).get();
    if (!table) {
      return {
        athleteId: normalizedAthleteId,
        activityCount: 0,
        earliestOccurredAt: null,
        latestOccurredAt: null,
        totalDistanceM: 0,
        sourceTypes: [],
      };
    }
    const coverage = database.prepare(`
      SELECT COUNT(*) AS activityCount, MIN(occurred_at) AS earliestOccurredAt,
        MAX(occurred_at) AS latestOccurredAt, COALESCE(SUM(distance_m), 0) AS totalDistanceM
      FROM activities WHERE athlete_id = ?
    `).get(normalizedAthleteId);
    const sourceTypes = database.prepare(`
      SELECT DISTINCT source_type AS sourceType
      FROM activities WHERE athlete_id = ? ORDER BY source_type
    `).all(normalizedAthleteId).map((row) => row.sourceType);
    return {
      athleteId: normalizedAthleteId,
      activityCount: coverage.activityCount,
      earliestOccurredAt: coverage.earliestOccurredAt,
      latestOccurredAt: coverage.latestOccurredAt,
      totalDistanceM: coverage.totalDistanceM,
      sourceTypes,
    };
  };

  const saveContextSnapshot = (input = {}) => transaction(() => {
    const metadata = requireRecord(input.metadata, "metadata");
    const historyCoverage = getHistoryCoverage();
    const inputChecksum = input.inputChecksum
      ? requireString(input.inputChecksum, "inputChecksum")
      : createHash("sha256")
        .update(JSON.stringify({ historyCoverage, metadata }))
        .digest("hex");
    const existing = mapContextSnapshot(database.prepare(`
      ${contextSelect} WHERE athlete_id = ? AND input_checksum = ?
    `).get(normalizedAthleteId, inputChecksum));
    if (existing) return existing;
    const snapshotId = newId("context");
    database.prepare(`
      INSERT INTO coaching_context_snapshots (
        id, athlete_id, input_checksum, history_activity_count,
        history_earliest_at, history_latest_at, history_distance_m,
        activity_sources_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshotId,
      normalizedAthleteId,
      inputChecksum,
      historyCoverage.activityCount,
      historyCoverage.earliestOccurredAt,
      historyCoverage.latestOccurredAt,
      historyCoverage.totalDistanceM,
      JSON.stringify(historyCoverage.sourceTypes),
      JSON.stringify(metadata),
      now(),
    );
    return mapContextSnapshot(database.prepare(`${contextSelect} WHERE id = ?`).get(snapshotId));
  });

  const getLatestContextSnapshot = () => {
    ensureOpen();
    return mapContextSnapshot(database.prepare(`
      ${contextSelect} WHERE athlete_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(normalizedAthleteId));
  };

  const normalizePlan = (input) => {
    const record = requireRecord(input, "plan");
    const goalId = requireString(record.goalId, "goalId");
    const contextSnapshotId = optionalString(record.contextSnapshotId, "contextSnapshotId");
    const title = requireString(record.title, "title");
    const startDate = requireDate(record.startDate, "startDate");
    const endDate = requireDate(record.endDate, "endDate");
    if (startDate > endDate) fail("VALIDATION_ERROR", "startDate must be on or before endDate");
    const summary = requireRecord(record.summary, "summary");
    if (!Array.isArray(record.workouts) || record.workouts.length === 0) {
      fail("VALIDATION_ERROR", "workouts must contain at least one planned workout");
    }
    const ids = new Set();
    const workouts = record.workouts.map((candidate, index) => {
      const workout = requireRecord(candidate, `workouts[${index}]`);
      const id = workout.id ? requireString(workout.id, `workouts[${index}].id`) : newId("workout");
      if (ids.has(id)) fail("VALIDATION_ERROR", "planned workout ids must be unique");
      ids.add(id);
      const localDate = requireDate(workout.localDate, `workouts[${index}].localDate`);
      if (localDate < startDate || localDate > endDate) {
        fail("VALIDATION_ERROR", `workouts[${index}].localDate must fall within the plan range`);
      }
      return {
        id,
        localDate,
        position: workout.position === undefined
          ? index
          : requireNonnegativeNumber(workout.position, `workouts[${index}].position`, { integer: true, nullable: false }),
        title: requireString(workout.title, `workouts[${index}].title`),
        workoutType: requireString(workout.workoutType, `workouts[${index}].workoutType`),
        durationMinutes: requireNonnegativeNumber(
          workout.durationMinutes,
          `workouts[${index}].durationMinutes`,
          { integer: true },
        ),
        distanceM: requireNonnegativeNumber(workout.distanceM, `workouts[${index}].distanceM`),
        intensity: optionalString(workout.intensity, `workouts[${index}].intensity`),
        details: requireRecord(workout.details, `workouts[${index}].details`),
      };
    });
    return { goalId, contextSnapshotId, title, startDate, endDate, summary, workouts };
  };

  const saveValidatedPlan = (input) => {
    const plan = normalizePlan(input);
    return transaction(() => {
      const goal = getGoal(plan.goalId);
      if (!goal) fail("NOT_FOUND", "Plan goal was not found");
      if (goal.lifecycle !== "draft" && goal.lifecycle !== "settled") {
        fail("INVALID_STATE", "A plan can only be saved for a draft or settled goal");
      }
      if (plan.contextSnapshotId) {
        const context = database.prepare(`
          SELECT id FROM coaching_context_snapshots WHERE athlete_id = ? AND id = ?
        `).get(normalizedAthleteId, plan.contextSnapshotId);
        if (!context) fail("NOT_FOUND", "Plan context snapshot was not found");
      }
      const contentHash = typeof plan.summary.contentHash === "string"
        ? requireString(plan.summary.contentHash, "summary.contentHash")
        : null;
      const sourceProposal = requireRecord(plan.summary.sourceProposal, "summary.sourceProposal");
      const sourceProposalId = typeof sourceProposal.id === "string"
        ? requireString(sourceProposal.id, "summary.sourceProposal.id")
        : null;
      if (contentHash || sourceProposalId) {
        const existingPlans = database.prepare(`
          SELECT id, summary_json AS summaryJson
          FROM coaching_plans
          WHERE athlete_id = ?
          ORDER BY version
        `).all(normalizedAthleteId);
        for (const existing of existingPlans) {
          const existingSummary = parseJson(existing.summaryJson, {});
          const existingSource = existingSummary.sourceProposal && typeof existingSummary.sourceProposal === "object"
            && !Array.isArray(existingSummary.sourceProposal)
            ? existingSummary.sourceProposal
            : {};
          if (sourceProposalId && existingSource.id === sourceProposalId && existingSummary.contentHash !== contentHash) {
            fail("ARTIFACT_ID_CONFLICT", "Proposal artifact id is already associated with different content", {
              proposalId: sourceProposalId,
            });
          }
          if (contentHash && existingSummary.contentHash === contentHash) {
            const importedReview = plan.summary.review;
            if (importedReview && JSON.stringify(existingSummary.review) !== JSON.stringify(importedReview)) {
              const refreshedSource = { ...existingSource, review: importedReview };
              const refreshedSummary = {
                ...existingSummary,
                review: importedReview,
                sourceProposal: refreshedSource,
              };
              database.prepare(`
                UPDATE coaching_plans
                SET summary_json = ?, updated_at = ?
                WHERE athlete_id = ? AND id = ?
              `).run(JSON.stringify(refreshedSummary), now(), normalizedAthleteId, existing.id);
            }
            return getPlan(existing.id);
          }
        }
      }
      const version = database.prepare(`
        SELECT COALESCE(MAX(version), 0) + 1 AS version
        FROM coaching_plans WHERE athlete_id = ?
      `).get(normalizedAthleteId).version;
      const timestamp = now();
      const planId = newId("plan");
      database.prepare(`
        INSERT INTO coaching_plans (
          id, athlete_id, version, goal_id, context_snapshot_id, lifecycle,
          title, start_date, end_date, summary_json, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'proposal', ?, ?, ?, ?, 1, ?, ?)
      `).run(
        planId,
        normalizedAthleteId,
        version,
        plan.goalId,
        plan.contextSnapshotId,
        plan.title,
        plan.startDate,
        plan.endDate,
        JSON.stringify(plan.summary),
        timestamp,
        timestamp,
      );
      const insertWorkout = database.prepare(`
        INSERT INTO coaching_planned_workouts (
          id, plan_id, athlete_id, local_date, position, title, workout_type,
          duration_minutes, distance_m, intensity, details_json, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
      for (const workout of plan.workouts) {
        insertWorkout.run(
          workout.id,
          planId,
          normalizedAthleteId,
          workout.localDate,
          workout.position,
          workout.title,
          workout.workoutType,
          workout.durationMinutes,
          workout.distanceM,
          workout.intensity,
          JSON.stringify(workout.details),
          timestamp,
          timestamp,
        );
      }
      insertAuditEvent({
        planId,
        eventType: "plan_proposed",
        event: { version, workoutCount: plan.workouts.length },
        createdAt: timestamp,
      });
      return getPlan(planId);
    });
  };

  const withdrawPlan = ({ planId, expectedRevision, actor = "user", reason = "Rejected by user" } = {}) => transaction(() => {
    const normalizedPlanId = requireString(planId, "planId");
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      fail("VALIDATION_ERROR", "expectedRevision must be a positive integer");
    }
    const plan = getPlan(normalizedPlanId);
    if (!plan) fail("NOT_FOUND", "Plan was not found");
    if (plan.lifecycle !== "proposal") {
      fail("INVALID_STATE", "Only a proposed plan can be withdrawn", { lifecycle: plan.lifecycle });
    }
    if (plan.summary.proposalStatus === "withdrawn") return plan;
    if (plan.revision !== expectedRevision) {
      fail("REVISION_CONFLICT", "Plan proposal has changed", {
        expectedRevision,
        currentRevision: plan.revision,
      });
    }
    const timestamp = now();
    const normalizedActor = requireString(actor, "actor");
    const normalizedReason = requireString(reason, "reason");
    const summary = {
      ...plan.summary,
      proposalStatus: "withdrawn",
      rejection: { actor: normalizedActor, reason: normalizedReason, rejectedAt: timestamp },
    };
    const result = database.prepare(`
      UPDATE coaching_plans
      SET summary_json = ?, revision = revision + 1, updated_at = ?
      WHERE athlete_id = ? AND id = ? AND lifecycle = 'proposal' AND revision = ?
    `).run(JSON.stringify(summary), timestamp, normalizedAthleteId, normalizedPlanId, expectedRevision);
    if (result.changes !== 1) fail("CONFLICT", "Plan proposal changed before it could be withdrawn");
    insertAuditEvent({
      planId: normalizedPlanId,
      eventType: "plan_withdrawn",
      event: { actor: normalizedActor, reason: normalizedReason },
      createdAt: timestamp,
    });
    return getPlan(normalizedPlanId);
  });

  const activatePlan = (planId, options = {}) => transaction(() => {
    const normalizedPlanId = requireString(planId, "planId");
    const activation = requireRecord(options, "options");
    const plan = getPlan(normalizedPlanId);
    if (!plan) fail("NOT_FOUND", "Plan was not found");
    if (plan.lifecycle === "active") return plan;
    if (plan.lifecycle !== "proposal") {
      fail("INVALID_STATE", "Only a proposed plan can be activated", { lifecycle: plan.lifecycle });
    }
    if (plan.summary.proposalStatus === "withdrawn") {
      fail("INVALID_STATE", "A withdrawn plan proposal cannot be activated");
    }
    if (activation.expectedRevision !== undefined) {
      if (!Number.isInteger(activation.expectedRevision) || activation.expectedRevision < 1) {
        fail("VALIDATION_ERROR", "options.expectedRevision must be a positive integer");
      }
      if (plan.revision !== activation.expectedRevision) {
        fail("REVISION_CONFLICT", "Plan proposal has changed", {
          expectedRevision: activation.expectedRevision,
          currentRevision: plan.revision,
        });
      }
    }
    const acknowledgedHistoryFingerprint = activation.acknowledgedHistoryFingerprint === undefined
      ? null
      : requireString(activation.acknowledgedHistoryFingerprint, "options.acknowledgedHistoryFingerprint");
    const sourceHistoryFingerprint = activation.sourceHistoryFingerprint === undefined
      ? null
      : requireString(activation.sourceHistoryFingerprint, "options.sourceHistoryFingerprint");
    const planGoal = getGoal(plan.goalId);
    if (!planGoal) fail("NOT_FOUND", "Plan goal was not found");
    if (planGoal.lifecycle !== "draft" && planGoal.lifecycle !== "settled") {
      fail("INVALID_STATE", "Plan goal is no longer eligible for approval", { lifecycle: planGoal.lifecycle });
    }
    const timestamp = now();
    const priorGoal = database.prepare(`
      SELECT id FROM coaching_goals
      WHERE athlete_id = ? AND lifecycle = 'settled' AND is_primary = 1 AND id <> ?
    `).get(normalizedAthleteId, planGoal.id);
    if (planGoal.lifecycle === "draft") {
      if (priorGoal) {
        database.prepare(`
          UPDATE coaching_goals
          SET lifecycle = 'superseded', superseded_at = ?, updated_at = ?
          WHERE athlete_id = ? AND id = ? AND lifecycle = 'settled'
        `).run(timestamp, timestamp, normalizedAthleteId, priorGoal.id);
      }
      const settled = database.prepare(`
        UPDATE coaching_goals
        SET lifecycle = 'settled', settled_at = ?, updated_at = ?
        WHERE athlete_id = ? AND id = ? AND lifecycle = 'draft'
      `).run(timestamp, timestamp, normalizedAthleteId, planGoal.id);
      if (settled.changes !== 1) fail("CONFLICT", "Plan goal changed before it could be approved");
    }
    const activePlan = database.prepare(`
      SELECT id FROM coaching_plans
      WHERE athlete_id = ? AND lifecycle = 'active' AND id <> ?
    `).get(normalizedAthleteId, normalizedPlanId);
    if (activePlan) {
      database.prepare(`
        UPDATE coaching_plans
        SET lifecycle = 'superseded', revision = revision + 1,
          superseded_at = ?, updated_at = ?
        WHERE athlete_id = ? AND id = ? AND lifecycle = 'active'
      `).run(timestamp, timestamp, normalizedAthleteId, activePlan.id);
      insertAuditEvent({
        planId: activePlan.id,
        eventType: "plan_superseded",
        event: { replacementPlanId: normalizedPlanId },
        createdAt: timestamp,
      });
    }
    const summary = acknowledgedHistoryFingerprint
      ? {
          ...plan.summary,
          staleHistoryAcknowledgement: {
            sourceHistoryFingerprint,
            acknowledgedHistoryFingerprint,
            acknowledgedAt: timestamp,
          },
        }
      : plan.summary;
    const result = database.prepare(`
      UPDATE coaching_plans
      SET lifecycle = 'active', revision = revision + 1,
        activated_at = ?, updated_at = ?, summary_json = ?
      WHERE athlete_id = ? AND id = ? AND lifecycle = 'proposal'
    `).run(timestamp, timestamp, JSON.stringify(summary), normalizedAthleteId, normalizedPlanId);
    if (result.changes !== 1) fail("CONFLICT", "Plan lifecycle changed before activation");
    if (acknowledgedHistoryFingerprint) {
      insertAuditEvent({
        planId: normalizedPlanId,
        eventType: "stale_history_acknowledged",
        event: { sourceHistoryFingerprint, acknowledgedHistoryFingerprint },
        createdAt: timestamp,
      });
    }
    insertAuditEvent({
      planId: normalizedPlanId,
      eventType: "plan_activated",
      event: {
        activatedGoalId: planGoal.id,
        supersededGoalId: priorGoal?.id ?? null,
        supersededPlanId: activePlan?.id ?? null,
      },
      createdAt: timestamp,
    });
    return getPlan(normalizedPlanId);
  });

  const loadPlan = (planId) => {
    ensureOpen();
    return getPlan(requireString(planId, "planId"));
  };

  const listPlans = () => {
    ensureOpen();
    return database.prepare(`
      SELECT id FROM coaching_plans
      WHERE athlete_id = ?
      ORDER BY version DESC, created_at DESC, id DESC
    `).all(normalizedAthleteId).map((row) => getPlan(row.id));
  };

  const loadActivePlan = () => {
    ensureOpen();
    const row = database.prepare(`
      SELECT id FROM coaching_plans WHERE athlete_id = ? AND lifecycle = 'active'
    `).get(normalizedAthleteId);
    return row ? getPlan(row.id) : null;
  };

  const adjustWorkout = ({
    workoutId,
    operation,
    toDate = null,
    expectedRevision,
    actor = "user",
    reason = null,
    requestedAt = null,
  } = {}) => transaction(() => {
    const normalizedWorkoutId = requireString(workoutId, "workoutId");
    const normalizedOperation = requireString(operation, "operation");
    if (!new Set(["reschedule", "skip", "restore"]).has(normalizedOperation)) {
      fail("VALIDATION_ERROR", "operation must be reschedule, skip, or restore");
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      fail("VALIDATION_ERROR", "expectedRevision must be a positive integer");
    }
    const rawWorkout = getRawWorkout(normalizedWorkoutId);
    if (!rawWorkout) fail("NOT_FOUND", "Planned workout was not found");
    const workout = deriveEffectiveWorkout(rawWorkout);
    const plan = getPlan(rawWorkout.planId);
    if (plan.lifecycle !== "active") {
      fail("INVALID_STATE", "Calendar adjustments require an active plan");
    }
    const normalizedDate = normalizedOperation === "reschedule" ? requireDate(toDate, "toDate") : null;
    if (normalizedDate && (normalizedDate < plan.startDate || normalizedDate > plan.endDate)) {
      fail("VALIDATION_ERROR", "toDate must fall within the plan range");
    }
    if (workout.revision !== expectedRevision) {
      fail("REVISION_CONFLICT", "Planned workout has changed", {
        expectedRevision,
        currentRevision: workout.revision,
      });
    }
    if (normalizedOperation === "skip" && workout.calendarStatus === "skipped") {
      fail("INVALID_STATE", "Workout is already skipped");
    }
    if (normalizedOperation === "restore" && workout.calendarStatus !== "skipped") {
      fail("INVALID_STATE", "Only a skipped workout can be restored");
    }
    const normalizedActor = requireString(actor, "actor");
    const normalizedReason = optionalString(reason, "reason");
    const normalizedRequestedAt = optionalString(requestedAt, "requestedAt");
    if (normalizedRequestedAt && Number.isNaN(new Date(normalizedRequestedAt).getTime())) {
      fail("VALIDATION_ERROR", "requestedAt must be a valid ISO date-time");
    }
    const timestamp = now();
    const result = {
      effectiveDate: normalizedDate ?? workout.effectiveLocalDate,
      status: normalizedOperation === "skip"
        ? "skipped"
        : normalizedOperation === "restore" ? "upcoming" : workout.calendarStatus,
      revision: expectedRevision + 1,
    };
    insertAuditEvent({
      planId: rawWorkout.planId,
      workoutId: normalizedWorkoutId,
      eventType: "calendar_adjusted",
      event: {
        operation: normalizedOperation,
        actor: normalizedActor,
        reason: normalizedReason,
        requestedAt: normalizedRequestedAt,
        prescribedDate: workout.prescribedLocalDate,
        prior: {
          effectiveDate: workout.effectiveLocalDate,
          status: workout.calendarStatus,
          revision: expectedRevision,
        },
        result,
      },
      createdAt: timestamp,
    });
    return getWorkout(normalizedWorkoutId);
  });

  const moveWorkout = ({ workoutId, toDate, expectedRevision, reason = null } = {}) => adjustWorkout({
    workoutId,
    operation: "reschedule",
    toDate,
    expectedRevision,
    reason,
  });

  const storeDailyBrief = (input = {}) => transaction(() => {
    const localDate = requireDate(input.localDate, "localDate");
    const message = requireString(input.message, "message");
    const payload = requireRecord(input.payload, "payload");
    const planId = optionalString(input.planId, "planId");
    const workoutId = optionalString(input.workoutId, "workoutId");
    if (planId && !getPlan(planId)) fail("NOT_FOUND", "Daily brief plan was not found");
    if (workoutId && !getWorkout(workoutId)) fail("NOT_FOUND", "Daily brief workout was not found");
    const source = input.source === undefined ? "codex" : requireString(input.source, "source");
    const generatedAt = input.generatedAt === undefined ? now() : requireString(input.generatedAt, "generatedAt");
    if (Number.isNaN(new Date(generatedAt).getTime())) {
      fail("VALIDATION_ERROR", "generatedAt must be a valid ISO date-time");
    }
    const timestamp = now();
    const existing = database.prepare(`
      SELECT id FROM coaching_daily_briefs WHERE athlete_id = ? AND local_date = ?
    `).get(normalizedAthleteId, localDate);
    const briefId = existing?.id ?? newId("brief");
    database.prepare(`
      INSERT INTO coaching_daily_briefs (
        id, athlete_id, local_date, plan_id, workout_id, message,
        payload_json, source, generated_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(athlete_id, local_date) DO UPDATE SET
        plan_id = excluded.plan_id,
        workout_id = excluded.workout_id,
        message = excluded.message,
        payload_json = excluded.payload_json,
        source = excluded.source,
        generated_at = excluded.generated_at,
        updated_at = excluded.updated_at
    `).run(
      briefId,
      normalizedAthleteId,
      localDate,
      planId,
      workoutId,
      message,
      JSON.stringify(payload),
      source,
      generatedAt,
      timestamp,
    );
    return mapDailyBrief(database.prepare(`
      ${briefSelect} WHERE athlete_id = ? AND local_date = ?
    `).get(normalizedAthleteId, localDate));
  });

  const getDailyBrief = (localDate) => {
    ensureOpen();
    const normalizedDate = requireDate(localDate, "localDate");
    return mapDailyBrief(database.prepare(`
      ${briefSelect} WHERE athlete_id = ? AND local_date = ?
    `).get(normalizedAthleteId, normalizedDate));
  };

  const loadReminderPreferences = () => {
    ensureOpen();
    return mapReminderPreferences(database.prepare(reminderSelect).get(normalizedAthleteId));
  };

  const saveReminderPreferences = (input = {}) => transaction(() => {
    const existing = loadReminderPreferences();
    const enabled = input.enabled === undefined ? existing?.enabled ?? true : input.enabled;
    if (typeof enabled !== "boolean") fail("VALIDATION_ERROR", "enabled must be boolean");
    const localTime = input.localTime === undefined
      ? existing?.localTime ?? DEFAULT_REMINDER_TIME
      : requireString(input.localTime, "localTime");
    if (!TIME_PATTERN.test(localTime)) fail("VALIDATION_ERROR", "localTime must use HH:mm");
    const timezone = input.timezone === undefined
      ? existing?.timezone ?? DEFAULT_TIMEZONE
      : requireString(input.timezone, "timezone");
    const deliveryChannel = input.deliveryChannel === undefined
      ? existing?.deliveryChannel ?? "codex"
      : requireString(input.deliveryChannel, "deliveryChannel");
    const externalStatus = enabled
      ? input.externalStatus ?? existing?.externalStatus ?? "not_configured"
      : "disabled";
    const statuses = new Set(["not_configured", "prepared", "scheduled", "attention", "disabled"]);
    if (!statuses.has(externalStatus)) fail("VALIDATION_ERROR", "externalStatus is not supported");
    const externalReference = input.externalReference === undefined
      ? existing?.externalReference ?? null
      : optionalString(input.externalReference, "externalReference");
    const preferences = input.preferences === undefined
      ? existing?.preferences ?? {}
      : requireRecord(input.preferences, "preferences");
    const timestamp = now();
    database.prepare(`
      INSERT INTO coaching_reminder_preferences (
        athlete_id, enabled, local_time, timezone, delivery_channel,
        external_status, external_reference, preferences_json,
        revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(athlete_id) DO UPDATE SET
        enabled = excluded.enabled,
        local_time = excluded.local_time,
        timezone = excluded.timezone,
        delivery_channel = excluded.delivery_channel,
        external_status = excluded.external_status,
        external_reference = excluded.external_reference,
        preferences_json = excluded.preferences_json,
        revision = coaching_reminder_preferences.revision + 1,
        updated_at = excluded.updated_at
    `).run(
      normalizedAthleteId,
      enabled ? 1 : 0,
      localTime,
      timezone,
      deliveryChannel,
      externalStatus,
      externalReference,
      JSON.stringify(preferences),
      timestamp,
      timestamp,
    );
    return loadReminderPreferences();
  });

  const listPlanAuditEvents = ({ planId, limit = 100 } = {}) => {
    ensureOpen();
    const normalizedPlanId = requireString(planId, "planId");
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      fail("VALIDATION_ERROR", "limit must be an integer from 1 to 500");
    }
    return database.prepare(`
      SELECT id, athlete_id AS athleteId, plan_id AS planId, workout_id AS workoutId,
        event_type AS eventType, event_json AS eventJson, created_at AS createdAt
      FROM coaching_plan_audit_events
      WHERE athlete_id = ? AND plan_id = ?
      ORDER BY created_at, id LIMIT ?
    `).all(normalizedAthleteId, normalizedPlanId, limit).map((row) => ({
      id: row.id,
      athleteId: row.athleteId,
      planId: row.planId,
      workoutId: row.workoutId,
      eventType: row.eventType,
      event: parseJson(row.eventJson, {}),
      createdAt: row.createdAt,
    }));
  };

  return {
    athleteId: normalizedAthleteId,
    close() {
      if (!closed) {
        database.close();
        closed = true;
      }
    },
    saveProfile,
    loadProfile,
    saveRoutine,
    loadRoutine,
    createGoal,
    settleGoal,
    loadGoal: (goalId) => {
      ensureOpen();
      return getGoal(requireString(goalId, "goalId"));
    },
    loadSettledGoal,
    listGoals,
    saveContextSnapshot,
    getLatestContextSnapshot,
    saveValidatedPlan,
    withdrawPlan,
    activatePlan,
    loadPlan,
    listPlans,
    loadActivePlan,
    adjustWorkout,
    moveWorkout,
    storeDailyBrief,
    getDailyBrief,
    saveReminderPreferences,
    loadReminderPreferences,
    getHistoryCoverage,
    listPlanAuditEvents,
  };
};
