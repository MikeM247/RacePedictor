import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationsUrl = new URL("../prisma/migrations/", import.meta.url);

test("all migrations apply to PostgreSQL and enforce tenant-safe cloud persistence", async () => {
  const database = await PGlite.create({ dataDir: "memory://" });
  try {
    const migrationDirectories = (await readdir(migrationsUrl, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const cloudMigrationIndex = migrationDirectories.findIndex((directory) => {
      return /cloud_athlete_scoped_sync$/u.test(directory);
    });
    assert.notEqual(cloudMigrationIndex, -1, "cloud athlete migration is required");

    for (const directory of migrationDirectories.slice(0, cloudMigrationIndex)) {
      await database.exec(await readFile(new URL(`${directory}/migration.sql`, migrationsUrl), "utf8"));
    }

    await database.exec(`
      INSERT INTO "imports" ("id", "athleteId", "updatedAt")
      VALUES ('legacy_import', 'athlete_legacy', CURRENT_TIMESTAMP);
    `);

    for (const directory of migrationDirectories.slice(cloudMigrationIndex)) {
      await database.exec(await readFile(new URL(`${directory}/migration.sql`, migrationsUrl), "utf8"));
    }

    const legacyAthlete = await database.query(
      `SELECT "id" FROM "athletes" WHERE "id" = $1`,
      ["athlete_legacy"],
    );
    assert.deepEqual(legacyAthlete.rows, [{ id: "athlete_legacy" }]);
    const legacyImport = await database.query(
      `SELECT "athleteId" FROM "imports" WHERE "id" = $1`,
      ["legacy_import"],
    );
    assert.deepEqual(legacyImport.rows, [{ athleteId: "athlete_legacy" }]);

    await database.exec(`
      INSERT INTO "athletes" ("id", "updatedAt") VALUES
        ('athlete_other', CURRENT_TIMESTAMP);
      INSERT INTO "app_users" ("id", "email", "updatedAt") VALUES
        ('user_owner', 'owner@example.invalid', CURRENT_TIMESTAMP);
      INSERT INTO "athlete_access" ("id", "userId", "athleteId", "role") VALUES
        ('access_owner', 'user_owner', 'athlete_legacy', 'owner');
      INSERT INTO "provider_oauth_attempts" (
        "id", "athleteId", "userId", "provider", "stateHash", "redirectUri", "returnTo", "expiresAt"
      ) VALUES (
        'oauth_attempt_1', 'athlete_legacy', 'user_owner', 'strava', '${"b".repeat(64)}',
        'https://race.example/api/v1/providers/strava/callback', '/dashboard/settings',
        CURRENT_TIMESTAMP + INTERVAL '10 minutes'
      );
      INSERT INTO "paired_devices" (
        "id", "athleteId", "pairedByUserId", "name", "deviceKeyHash", "enrollmentKeyHash"
      ) VALUES (
        'device_legacy', 'athlete_legacy', 'user_owner', 'Synthetic local agent',
        'hash_device_legacy', '${"c".repeat(64)}'
      );
      INSERT INTO "second_brain_snapshots" (
        "id", "athleteId", "pairedDeviceId", "schemaVersion", "sourceRevision",
        "contentHash", "selectedFields", "context", "publishedAt"
      ) VALUES (
        'snapshot_1', 'athlete_legacy', 'device_legacy', 'second-brain-context.v1', 1,
        '${"a".repeat(64)}', '["availability"]'::jsonb,
        '{"availability":{"weeklyMinutesBudget":300}}'::jsonb, CURRENT_TIMESTAMP
      );
      INSERT INTO "sync_changes" (
        "id", "cursor", "athleteId", "entityType", "entityId", "operation", "entityVersion"
      ) VALUES
        ('change_legacy_1', 1, 'athlete_legacy', 'activity', 'activity_legacy', 'upsert', 1),
        ('change_other_1', 1, 'athlete_other', 'activity', 'activity_other', 'upsert', 1);
      INSERT INTO "Activity" (
        "id", "athleteId", "sourceType", "occurredAt", "endedAt", "elapsedTimeS",
        "sport", "distanceM", "avgPaceSecPerKm", "elevationGainM", "elevationLossM",
        "dedupeHash"
      ) VALUES (
        'activity_legacy', 'athlete_legacy', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        1800, 'run', 5000, 360, 20, 20, 'dedupe_activity_legacy'
      );
    `);

    const snapshot = await database.query(`
      SELECT "selectedFields", "context" FROM "second_brain_snapshots"
      WHERE "id" = 'snapshot_1'
    `);
    assert.deepEqual(snapshot.rows, [{
      selectedFields: ["availability"],
      context: { availability: { weeklyMinutesBudget: 300 } },
    }]);

    const oauthAttempt = await database.query(`
      SELECT "athleteId", "userId", "stateHash", "consumedAt"
      FROM "provider_oauth_attempts" WHERE "id" = 'oauth_attempt_1'
    `);
    assert.deepEqual(oauthAttempt.rows, [{
      athleteId: "athlete_legacy",
      userId: "user_owner",
      stateHash: "b".repeat(64),
      consumedAt: null,
    }]);
    await assert.rejects(
      database.exec(`
        INSERT INTO "provider_oauth_attempts" (
          "id", "athleteId", "userId", "provider", "stateHash", "redirectUri", "returnTo", "expiresAt"
        ) VALUES (
          'oauth_attempt_duplicate', 'athlete_legacy', 'user_owner', 'strava', '${"b".repeat(64)}',
          'https://race.example/api/v1/providers/strava/callback', '/dashboard/settings', CURRENT_TIMESTAMP
        );
      `),
      /unique constraint/iu,
    );

    await assert.rejects(
      database.exec(`
        INSERT INTO "activity_source_references" (
          "id", "athleteId", "activityId", "sourceType", "sourceObjectId"
        ) VALUES ('foreign_source', 'athlete_other', 'activity_legacy', 'manual', 'foreign');
      `),
      /foreign key constraint/i,
    );

    await assert.rejects(
      database.exec(`
        INSERT INTO "sync_changes" (
          "id", "cursor", "athleteId", "entityType", "entityId", "operation", "entityVersion"
        ) VALUES ('change_legacy_duplicate_cursor', 1, 'athlete_legacy', 'activity', 'another', 'upsert', 1);
      `),
      /unique constraint/i,
    );

    await assert.rejects(
      database.transaction(async (transaction) => {
        await transaction.exec(`
          INSERT INTO "sync_changes" (
            "id", "cursor", "athleteId", "entityType", "entityId", "operation", "entityVersion"
          ) VALUES (
            'change_legacy_rolled_back', 2, 'athlete_legacy', 'activity',
            'activity_rolled_back', 'upsert', 1
          );
        `);
        await transaction.exec(`
          INSERT INTO "activity_source_references" (
            "id", "athleteId", "activityId", "sourceType", "sourceObjectId"
          ) VALUES (
            'foreign_source_in_transaction', 'athlete_other', 'activity_legacy',
            'manual', 'foreign-in-transaction'
          );
        `);
      }),
      /foreign key constraint/i,
    );

    const rolledBackChange = await database.query(`
      SELECT "id" FROM "sync_changes"
      WHERE "id" = 'change_legacy_rolled_back'
    `);
    assert.deepEqual(rolledBackChange.rows, []);

    const prescribedSession = {
      id: "run_concurrent",
      kind: "run",
      scheduledDate: "2026-08-20",
      title: "Easy run",
      purpose: "Aerobic base",
      prescription: "Run easily for 30 minutes.",
      cautions: [],
      durationMinutes: 30,
    };
    await database.query(`
      INSERT INTO "training_plan_projections" (
        "id", "athleteId", "planId", "planVersion", "planStatus", "active",
        "contentHash", "plan", "publishedAt", "updatedAt"
      ) VALUES (
        'projection_concurrent', 'athlete_legacy', 'plan_concurrent', 1, 'active', true,
        $1, $2::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `, [
      "d".repeat(64),
      JSON.stringify({ id: "plan_concurrent", revision: 2, workouts: [prescribedSession] }),
    ]);
    await database.query(`
      INSERT INTO "calendar_session_projections" (
        "id", "athleteId", "planId", "sessionId", "prescribedSession",
        "effectiveSession", "status", "revision"
      ) VALUES (
        'session_concurrent', 'athlete_legacy', 'plan_concurrent', 'run_concurrent',
        $1::jsonb, $1::jsonb, 'upcoming', 2
      )
    `, [
      JSON.stringify(prescribedSession),
    ]);

    const attemptConcurrentAmendment = (id, title, reason) => database.query(`
      WITH updated AS (
        UPDATE "calendar_session_projections"
        SET "effectiveSession" = jsonb_set("effectiveSession", '{title}', to_jsonb($2::text), true),
            "revision" = "revision" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "athleteId" = 'athlete_legacy'
          AND "planId" = 'plan_concurrent'
          AND "sessionId" = 'run_concurrent'
          AND "revision" = 2
        RETURNING "athleteId", "planId", "sessionId", "revision", "effectiveSession"
      )
      INSERT INTO "calendar_session_amendments" (
        "id", "athleteId", "planId", "sessionId", "revision", "operation", "reason",
        "changedFields", "beforeValues", "afterValues", "actorUserId", "actorKind",
        "requestedAt", "idempotencyKey", "requestHash"
      )
      SELECT
        $1, updated."athleteId", updated."planId", updated."sessionId", updated."revision",
        'amend', $3, '["title"]'::jsonb,
        jsonb_build_object('session', $4::jsonb, 'status', 'upcoming'),
        jsonb_build_object('session', updated."effectiveSession", 'status', 'upcoming'),
        'user_owner', 'user', CURRENT_TIMESTAMP, $1, repeat('e', 64)
      FROM updated
      RETURNING "id", "revision", "reason"
    `, [id, title, reason, JSON.stringify(prescribedSession)]);

    const competingResults = await Promise.all([
      attemptConcurrentAmendment("amendment_concurrent_a", "Short recovery run", "Travel fatigue"),
      attemptConcurrentAmendment("amendment_concurrent_b", "Steady aerobic run", "Schedule opened up"),
    ]);
    assert.equal(
      competingResults.flatMap((result) => result.rows).length,
      1,
      "only one caller can consume the expected revision",
    );
    const concurrentProjection = await database.query(`
      SELECT "revision", "effectiveSession"->>'title' AS "title"
      FROM "calendar_session_projections"
      WHERE "id" = 'session_concurrent'
    `);
    assert.equal(concurrentProjection.rows[0].revision, 3);
    const concurrentHistory = await database.query(`
      SELECT "revision", "reason" FROM "calendar_session_amendments"
      WHERE "sessionId" = 'run_concurrent'
    `);
    assert.equal(concurrentHistory.rows.length, 1);
    assert.equal(concurrentHistory.rows[0].revision, 3);
    const winner = competingResults.flatMap((result) => result.rows)[0];
    assert.equal(concurrentProjection.rows[0].title, winner.reason === "Travel fatigue" ? "Short recovery run" : "Steady aerobic run");

    const prohibitedColumns = await database.query(`
      SELECT "column_name" AS "columnName"
      FROM information_schema.columns
      WHERE table_name IN ('provider_connections', 'raw_objects', 'second_brain_snapshots')
        AND lower("column_name") IN ('accesstoken', 'refreshtoken', 'rawbody', 'payloadjson', 'vaultpath', 'markdown')
    `);
    assert.deepEqual(prohibitedColumns.rows, []);
  } finally {
    await database.close();
  }
});
