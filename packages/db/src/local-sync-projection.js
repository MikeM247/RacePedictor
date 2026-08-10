import { DatabaseSync } from "node:sqlite";
import { activityDetailSchema } from "../../core/src/contracts/activity.ts";
import { syncChangeSchema } from "../../core/src/contracts/sync.ts";
import { createLocalSchema } from "./local-garmin-pipeline.js";
import { openLocalDatabase } from "./local-database.js";

export class LocalSyncProjectionRepository {
  #databasePath;
  #now;

  constructor({ databasePath, now = () => new Date() }) {
    if (typeof databasePath !== "string" || !databasePath) throw new Error("databasePath is required");
    this.#databasePath = databasePath;
    this.#now = now;
    const database = openLocalDatabase({ databasePath });
    try {
      createLocalSchema(database);
    } finally {
      database.close();
    }
  }

  getCursor(athleteId) {
    return this.#read((database) => database.prepare(
      "SELECT cursor FROM local_sync_state WHERE athlete_id = ?",
    ).get(athleteId)?.cursor ?? null);
  }

  getSecondBrainRevision(athleteId) {
    return this.#read((database) => database.prepare(
      "SELECT second_brain_revision AS revision FROM local_sync_state WHERE athlete_id = ?",
    ).get(athleteId)?.revision ?? 0);
  }

  applyChanges(athleteId, rawChanges) {
    const changes = rawChanges.map((change) => syncChangeSchema.parse(change));
    if (changes.some((change) => change.athleteId !== athleteId)) throw new Error("Cloud sync batch crosses athlete scope");
    const database = new DatabaseSync(this.#databasePath);
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;");
    try {
      for (const change of changes) this.#applyChange(database, athleteId, change);
      database.exec("COMMIT");
      return changes.at(-1)?.cursor ?? this.getCursor(athleteId);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    } finally {
      database.close();
    }
  }

  commitCursor(athleteId, cursor) {
    if (typeof cursor !== "string" || !/^[1-9]\d*$/u.test(cursor)) throw new Error("Local sync cursor is invalid");
    const current = this.getCursor(athleteId);
    if (current && BigInt(cursor) < BigInt(current)) throw new Error("Local sync cursor cannot move backwards");
    const now = this.#now().toISOString();
    this.#write((database) => database.prepare(`
      INSERT INTO local_sync_state (athlete_id, cursor, last_successful_at, last_error_code, updated_at)
      VALUES (?, ?, ?, NULL, ?)
      ON CONFLICT (athlete_id) DO UPDATE SET
        cursor = excluded.cursor,
        last_successful_at = excluded.last_successful_at,
        last_error_code = NULL,
        updated_at = excluded.updated_at
    `).run(athleteId, cursor, now, now));
  }

  recordFailure(athleteId, diagnosticCode) {
    const code = typeof diagnosticCode === "string" ? diagnosticCode.slice(0, 80) : "LOCAL_SYNC_FAILED";
    const now = this.#now().toISOString();
    this.#write((database) => database.prepare(`
      INSERT INTO local_sync_state (athlete_id, last_error_code, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT (athlete_id) DO UPDATE SET last_error_code = excluded.last_error_code, updated_at = excluded.updated_at
    `).run(athleteId, code, now));
  }

  recordSecondBrainPublication(athleteId, snapshot, logicalSourceRefs) {
    if (!Array.isArray(logicalSourceRefs) || logicalSourceRefs.some((item) => typeof item !== "string" || !item || /[\\/]/u.test(item))) {
      throw new Error("Second Brain logical source references must not contain paths");
    }
    const database = new DatabaseSync(this.#databasePath);
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.prepare(`
        INSERT INTO local_second_brain_publications (
          athlete_id, revision, content_hash, selected_fields_json, logical_source_refs_json, published_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (athlete_id, revision) DO NOTHING
      `).run(
        athleteId,
        snapshot.revision,
        snapshot.contentHash,
        JSON.stringify(snapshot.selectedFields),
        JSON.stringify(logicalSourceRefs),
        snapshot.publishedAt,
      );
      const now = this.#now().toISOString();
      database.prepare(`
        INSERT INTO local_sync_state (athlete_id, second_brain_revision, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT (athlete_id) DO UPDATE SET
          second_brain_revision = MAX(second_brain_revision, excluded.second_brain_revision),
          updated_at = excluded.updated_at
      `).run(athleteId, snapshot.revision, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    } finally {
      database.close();
    }
  }

  listEntities(athleteId) {
    return this.#read((database) => database.prepare(`
      SELECT entity_type AS entityType, entity_id AS entityId, entity_revision AS entityRevision,
        operation, payload_json AS payloadJson, changed_at AS changedAt
      FROM cloud_sync_entities WHERE athlete_id = ?
      ORDER BY changed_at DESC, entity_type, entity_id
    `).all(athleteId).map((row) => ({
      ...row,
      payload: row.payloadJson === null ? null : JSON.parse(row.payloadJson),
      payloadJson: undefined,
    })));
  }

  #applyChange(database, athleteId, change) {
    const existing = database.prepare(`
      SELECT entity_revision AS revision FROM cloud_sync_entities
      WHERE athlete_id = ? AND entity_type = ? AND entity_id = ?
    `).get(athleteId, change.entityType, change.entityId);
    if (existing && existing.revision > change.entityRevision) return;
    if (change.entityType === "activity") this.#applyActivity(database, athleteId, change);
    database.prepare(`
      INSERT INTO cloud_sync_entities (
        athlete_id, entity_type, entity_id, entity_revision, operation, payload_json, changed_at, applied_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (athlete_id, entity_type, entity_id) DO UPDATE SET
        entity_revision = excluded.entity_revision,
        operation = excluded.operation,
        payload_json = excluded.payload_json,
        changed_at = excluded.changed_at,
        applied_at = excluded.applied_at
      WHERE excluded.entity_revision >= cloud_sync_entities.entity_revision
    `).run(
      athleteId,
      change.entityType,
      change.entityId,
      change.entityRevision,
      change.operation,
      change.payload === null ? null : JSON.stringify(change.payload),
      change.changedAt,
      this.#now().toISOString(),
    );
  }

  #applyActivity(database, athleteId, change) {
    const mapped = database.prepare(`
      SELECT local_activity_id AS localId FROM cloud_activity_mappings
      WHERE athlete_id = ? AND cloud_activity_id = ?
    `).get(athleteId, change.entityId);
    if (change.operation === "delete") {
      database.prepare("DELETE FROM activities WHERE athlete_id = ? AND id = ?")
        .run(athleteId, mapped?.localId ?? change.entityId);
      return;
    }
    const activity = activityDetailSchema.parse(change.payload);
    if (activity.athleteId !== athleteId || activity.id !== change.entityId) throw new Error("Activity projection crosses athlete scope");
    const duplicate = database.prepare("SELECT id FROM activities WHERE athlete_id = ? AND dedupe_hash = ?")
      .get(athleteId, activity.dedupeHash);
    const localId = mapped?.localId ?? duplicate?.id ?? activity.id;
    database.prepare(`
      INSERT INTO activities (
        id, athlete_id, source_type, source_file_id, source_activity_id, occurred_at, local_occurred_at,
        ended_at, elapsed_time_s, moving_time_s, sport, title, favorite, distance_m,
        avg_pace_sec_per_km, elevation_gain_m, elevation_loss_m, min_elevation_m, max_elevation_m,
        avg_hr_bpm, max_hr_bpm, avg_cadence_spm, max_cadence_spm, calories,
        aerobic_training_effect, avg_stride_length_m, avg_vertical_ratio_pct, avg_vertical_oscillation_cm,
        avg_ground_contact_time_ms, normalized_power_w, training_stress_score, avg_power_w, max_power_w,
        steps, body_battery_drain, lap_count, dedupe_hash, source_payload_json, created_at
      ) VALUES (
        ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      ) ON CONFLICT (id) DO UPDATE SET
        source_type = excluded.source_type, source_activity_id = excluded.source_activity_id,
        occurred_at = excluded.occurred_at, local_occurred_at = excluded.local_occurred_at,
        ended_at = excluded.ended_at, elapsed_time_s = excluded.elapsed_time_s,
        moving_time_s = excluded.moving_time_s, sport = excluded.sport, title = excluded.title,
        distance_m = excluded.distance_m, avg_pace_sec_per_km = excluded.avg_pace_sec_per_km,
        elevation_gain_m = excluded.elevation_gain_m, elevation_loss_m = excluded.elevation_loss_m,
        min_elevation_m = excluded.min_elevation_m, max_elevation_m = excluded.max_elevation_m,
        avg_hr_bpm = excluded.avg_hr_bpm, max_hr_bpm = excluded.max_hr_bpm,
        avg_cadence_spm = excluded.avg_cadence_spm, max_cadence_spm = excluded.max_cadence_spm,
        calories = excluded.calories, aerobic_training_effect = excluded.aerobic_training_effect,
        avg_stride_length_m = excluded.avg_stride_length_m, avg_vertical_ratio_pct = excluded.avg_vertical_ratio_pct,
        avg_vertical_oscillation_cm = excluded.avg_vertical_oscillation_cm,
        avg_ground_contact_time_ms = excluded.avg_ground_contact_time_ms,
        normalized_power_w = excluded.normalized_power_w, training_stress_score = excluded.training_stress_score,
        avg_power_w = excluded.avg_power_w, max_power_w = excluded.max_power_w, steps = excluded.steps,
        body_battery_drain = excluded.body_battery_drain, lap_count = excluded.lap_count,
        dedupe_hash = excluded.dedupe_hash, source_payload_json = excluded.source_payload_json
    `).run(
      localId, athleteId, activity.sourceType, activity.sourceActivityId ?? null,
      activity.occurredAt, activity.localOccurredAt ?? activity.occurredAt, activity.endedAt,
      activity.elapsedTimeS, activity.movingTimeS ?? null, activity.sport, activity.title ?? null,
      activity.distanceM, activity.avgPaceSecPerKm, activity.elevationGainM, activity.elevationLossM,
      activity.minElevationM ?? null, activity.maxElevationM ?? null, activity.avgHrBpm ?? null,
      activity.maxHrBpm ?? null, activity.avgCadenceSpm ?? null, activity.maxCadenceSpm ?? null,
      activity.calories ?? null, activity.aerobicTrainingEffect ?? null, activity.avgStrideLengthM ?? null,
      activity.avgVerticalRatioPct ?? null, activity.avgVerticalOscillationCm ?? null,
      activity.avgGroundContactTimeMs ?? null, activity.normalizedPowerW ?? null,
      activity.trainingStressScore ?? null, activity.avgPowerW ?? null, activity.maxPowerW ?? null,
      activity.steps ?? null, activity.bodyBatteryDrain ?? null, activity.lapCount ?? null,
      activity.dedupeHash, JSON.stringify(activity), activity.createdAt,
    );
    database.prepare(`
      INSERT INTO cloud_activity_mappings (athlete_id, cloud_activity_id, local_activity_id, dedupe_hash, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (athlete_id, cloud_activity_id) DO UPDATE SET
        local_activity_id = excluded.local_activity_id, dedupe_hash = excluded.dedupe_hash, updated_at = excluded.updated_at
    `).run(athleteId, activity.id, localId, activity.dedupeHash, this.#now().toISOString());
  }

  #read(action) {
    const database = new DatabaseSync(this.#databasePath, { readOnly: true });
    try { return action(database); } finally { database.close(); }
  }

  #write(action) {
    const database = new DatabaseSync(this.#databasePath);
    try { return action(database); } finally { database.close(); }
  }
}
