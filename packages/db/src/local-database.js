import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const LOCAL_DATABASE_SCHEMA_VERSION = 2;

const migrations = [
  {
    version: 1,
    name: "coaching_foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS coaching_profiles (
        athlete_id TEXT PRIMARY KEY,
        display_name TEXT,
        timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
        preferred_units TEXT NOT NULL DEFAULT 'metric'
          CHECK (preferred_units IN ('metric', 'imperial')),
        motivation TEXT,
        constraints_json TEXT NOT NULL DEFAULT '{}',
        preferences_json TEXT NOT NULL DEFAULT '{}',
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS coaching_goals (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        lifecycle TEXT NOT NULL DEFAULT 'draft'
          CHECK (lifecycle IN ('draft', 'settled', 'superseded')),
        is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1)),
        goal_type TEXT NOT NULL,
        title TEXT NOT NULL,
        target_date TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        settled_at TEXT,
        superseded_at TEXT,
        UNIQUE (athlete_id, version)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS coaching_goals_one_settled_primary_idx
        ON coaching_goals (athlete_id)
        WHERE lifecycle = 'settled' AND is_primary = 1;
      CREATE INDEX IF NOT EXISTS coaching_goals_athlete_version_idx
        ON coaching_goals (athlete_id, version DESC);

      CREATE TABLE IF NOT EXISTS coaching_routines (
        athlete_id TEXT PRIMARY KEY,
        sessions_per_week INTEGER CHECK (sessions_per_week BETWEEN 0 AND 14),
        long_run_day INTEGER CHECK (long_run_day BETWEEN 0 AND 6),
        timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
        preferences_json TEXT NOT NULL DEFAULT '{}',
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS coaching_routine_days (
        athlete_id TEXT NOT NULL REFERENCES coaching_routines(athlete_id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0, 1)),
        max_duration_minutes INTEGER CHECK (max_duration_minutes > 0),
        preferred_time TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (athlete_id, day_of_week)
      );

      CREATE TABLE IF NOT EXISTS coaching_context_snapshots (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL,
        input_checksum TEXT NOT NULL,
        history_activity_count INTEGER NOT NULL DEFAULT 0 CHECK (history_activity_count >= 0),
        history_earliest_at TEXT,
        history_latest_at TEXT,
        history_distance_m REAL NOT NULL DEFAULT 0 CHECK (history_distance_m >= 0),
        activity_sources_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        UNIQUE (athlete_id, input_checksum)
      );
      CREATE INDEX IF NOT EXISTS coaching_context_snapshots_athlete_created_idx
        ON coaching_context_snapshots (athlete_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS coaching_plans (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        goal_id TEXT NOT NULL REFERENCES coaching_goals(id),
        context_snapshot_id TEXT REFERENCES coaching_context_snapshots(id) ON DELETE SET NULL,
        lifecycle TEXT NOT NULL DEFAULT 'proposal'
          CHECK (lifecycle IN ('proposal', 'active', 'superseded')),
        title TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        summary_json TEXT NOT NULL DEFAULT '{}',
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        activated_at TEXT,
        superseded_at TEXT,
        CHECK (start_date <= end_date),
        UNIQUE (athlete_id, version)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS coaching_plans_one_active_idx
        ON coaching_plans (athlete_id)
        WHERE lifecycle = 'active';
      CREATE INDEX IF NOT EXISTS coaching_plans_athlete_version_idx
        ON coaching_plans (athlete_id, version DESC);

      CREATE TABLE IF NOT EXISTS coaching_planned_workouts (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES coaching_plans(id) ON DELETE CASCADE,
        athlete_id TEXT NOT NULL,
        local_date TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
        title TEXT NOT NULL,
        workout_type TEXT NOT NULL,
        duration_minutes INTEGER CHECK (duration_minutes >= 0),
        distance_m REAL CHECK (distance_m >= 0),
        intensity TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS coaching_workouts_plan_date_idx
        ON coaching_planned_workouts (plan_id, local_date, position);
      CREATE INDEX IF NOT EXISTS coaching_workouts_athlete_date_idx
        ON coaching_planned_workouts (athlete_id, local_date);

      CREATE TABLE IF NOT EXISTS coaching_daily_briefs (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL,
        local_date TEXT NOT NULL,
        plan_id TEXT REFERENCES coaching_plans(id) ON DELETE SET NULL,
        workout_id TEXT REFERENCES coaching_planned_workouts(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        source TEXT NOT NULL DEFAULT 'codex',
        generated_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (athlete_id, local_date)
      );

      CREATE TABLE IF NOT EXISTS coaching_reminder_preferences (
        athlete_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        local_time TEXT NOT NULL DEFAULT '06:30',
        timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
        delivery_channel TEXT NOT NULL DEFAULT 'codex',
        external_status TEXT NOT NULL DEFAULT 'not_configured'
          CHECK (external_status IN ('not_configured', 'prepared', 'scheduled', 'attention', 'disabled')),
        external_reference TEXT,
        preferences_json TEXT NOT NULL DEFAULT '{}',
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS coaching_plan_audit_events (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL,
        plan_id TEXT NOT NULL REFERENCES coaching_plans(id) ON DELETE CASCADE,
        workout_id TEXT REFERENCES coaching_planned_workouts(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        event_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS coaching_plan_audit_plan_created_idx
        ON coaching_plan_audit_events (plan_id, created_at, id);
    `,
  },
  {
    version: 2,
    name: "cloud_sync_projection",
    sql: `
      CREATE TABLE IF NOT EXISTS local_sync_state (
        athlete_id TEXT PRIMARY KEY,
        cursor TEXT,
        last_successful_at TEXT,
        last_error_code TEXT,
        second_brain_revision INTEGER NOT NULL DEFAULT 0 CHECK (second_brain_revision >= 0),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cloud_sync_entities (
        athlete_id TEXT NOT NULL,
        entity_type TEXT NOT NULL
          CHECK (entity_type IN ('activity', 'activity_revision', 'plan', 'calendar_session')),
        entity_id TEXT NOT NULL,
        entity_revision INTEGER NOT NULL CHECK (entity_revision > 0),
        operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
        payload_json TEXT,
        changed_at TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        PRIMARY KEY (athlete_id, entity_type, entity_id),
        CHECK ((operation = 'delete' AND payload_json IS NULL) OR (operation = 'upsert' AND payload_json IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS cloud_sync_entities_athlete_changed_idx
        ON cloud_sync_entities (athlete_id, changed_at DESC, entity_type, entity_id);

      CREATE TABLE IF NOT EXISTS cloud_activity_mappings (
        athlete_id TEXT NOT NULL,
        cloud_activity_id TEXT NOT NULL,
        local_activity_id TEXT NOT NULL,
        dedupe_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (athlete_id, cloud_activity_id),
        UNIQUE (athlete_id, local_activity_id)
      );

      CREATE TABLE IF NOT EXISTS local_second_brain_publications (
        athlete_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        content_hash TEXT NOT NULL,
        selected_fields_json TEXT NOT NULL,
        logical_source_refs_json TEXT NOT NULL,
        published_at TEXT NOT NULL,
        PRIMARY KEY (athlete_id, revision),
        UNIQUE (athlete_id, content_hash)
      );
    `,
  },
];

const applyLocalMigrations = (database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS local_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);

  for (const migration of migrations) {
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database
        .prepare("SELECT version FROM local_schema_migrations WHERE version = ?")
        .get(migration.version);
      if (!existing) {
        database.exec(migration.sql);
        database.prepare(`
          INSERT INTO local_schema_migrations (version, name, applied_at)
          VALUES (?, ?, ?)
        `).run(migration.version, migration.name, new Date().toISOString());
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
};

export const openLocalDatabase = ({ databasePath, readOnly = false } = {}) => {
  if (!databasePath || typeof databasePath !== "string") {
    throw new Error("databasePath is required");
  }
  if (!readOnly) mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });

  const database = new DatabaseSync(databasePath, { readOnly });
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (!readOnly) {
    database.exec("PRAGMA journal_mode = WAL;");
    applyLocalMigrations(database);
  }
  return database;
};
