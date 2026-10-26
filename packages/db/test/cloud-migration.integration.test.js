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

    await database.exec(`INSERT INTO "activity_pace_comparisons"
      ("id", "athleteId", "activityId", "revision", "artifactId", "artifactHash", "payload")
      VALUES ('pace-1', 'athlete_legacy', 'activity_legacy', 1, 'reviewed-1', '${"a".repeat(64)}', '{}'::jsonb)`);
    await assert.rejects(database.exec(`INSERT INTO "activity_pace_comparisons"
      ("id", "athleteId", "activityId", "revision", "artifactId", "artifactHash", "payload")
      VALUES ('pace-foreign', 'athlete_other', 'activity_legacy', 1, 'reviewed-foreign', '${"a".repeat(64)}', '{}'::jsonb)`), /foreign key/iu);
    await assert.rejects(database.exec(`INSERT INTO "activity_pace_comparisons"
      ("id", "athleteId", "activityId", "revision", "artifactId", "artifactHash", "payload")
      VALUES ('pace-duplicate', 'athlete_legacy', 'activity_legacy', 1, 'reviewed-2', '${"b".repeat(64)}', '{}'::jsonb)`), /unique constraint/iu);

    const snapshot = await database.query(`
      SELECT "selectedFields", "context" FROM "second_brain_snapshots"
      WHERE "id" = 'snapshot_1'
    `);
    assert.deepEqual(snapshot.rows, [{
      selectedFields: ["availability"],
      context: { availability: { weeklyMinutesBudget: 300 } },
    }]);

    await database.exec(`
      INSERT INTO "second_brain_snapshots" (
        "id", "athleteId", "pairedDeviceId", "schemaVersion", "sourceRevision",
        "contentHash", "selectedFields", "context", "publishedAt"
      ) VALUES (
        'snapshot_2', 'athlete_legacy', 'device_legacy', 'second-brain-context.v1', 2,
        '${"a".repeat(64)}', '["availability"]'::jsonb,
        '{"availability":{"weeklyMinutesBudget":300}}'::jsonb, CURRENT_TIMESTAMP
      );
    `);
    const restoredSnapshot = await database.query(`
      SELECT COUNT(*)::int AS "count" FROM "second_brain_snapshots"
      WHERE "athleteId" = 'athlete_legacy' AND "contentHash" = '${"a".repeat(64)}'
    `);
    assert.deepEqual(restoredSnapshot.rows, [{ count: 2 }]);

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

    await database.exec(`
      INSERT INTO "coach_conversations" ("id", "athleteId", "updatedAt")
      VALUES ('coach-conversation-1', 'athlete_legacy', CURRENT_TIMESTAMP);
      INSERT INTO "coach_turns" (
        "id", "athleteId", "conversationId", "generation", "clientTurnId", "requestHash",
        "topic", "contextFingerprint", "contextSnapshot", "state", "attemptCount", "updatedAt"
      ) VALUES (
        'coach-turn-1', 'athlete_legacy', 'coach-conversation-1', 1, 'client-turn-1', '${"f".repeat(64)}',
        'reflect', '${"e".repeat(64)}', '{"sources":{"activity":"available"}}'::jsonb, 'completed', 1, CURRENT_TIMESTAMP
      );
      INSERT INTO "coach_messages" (
        "id", "athleteId", "conversationId", "turnId", "generation", "sequence", "role", "text", "topic"
      ) VALUES
        ('coach-user-1', 'athlete_legacy', 'coach-conversation-1', 'coach-turn-1', 1, 1, 'user', 'How did that feel?', 'reflect'),
        ('coach-assistant-1', 'athlete_legacy', 'coach-conversation-1', 'coach-turn-1', 1, 2, 'assistant', 'Let us review the recorded effort.', 'reflect');
      INSERT INTO "coach_usage_buckets" (
        "id", "athleteId", "windowKind", "windowStart", "windowEnd", "attemptCount", "updatedAt"
      ) VALUES
        ('coach-usage-1', 'athlete_legacy', 'day', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day', 1, CURRENT_TIMESTAMP),
        ('coach-usage-2', 'athlete_other', 'day', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day', 2, CURRENT_TIMESTAMP);
    `);
    const coachRows = await database.query(`
      SELECT c."athleteId", c."generation", c."sequence", COUNT(m."id")::int AS "messageCount"
      FROM "coach_conversations" c LEFT JOIN "coach_messages" m ON m."conversationId" = c."id"
      WHERE c."id" = 'coach-conversation-1' GROUP BY c."athleteId", c."generation", c."sequence"
    `);
    assert.deepEqual(coachRows.rows, [{ athleteId: "athlete_legacy", generation: 1, sequence: 0, messageCount: 2 }]);
    await assert.rejects(database.exec(`
      INSERT INTO "coach_turns" (
        "id", "athleteId", "conversationId", "generation", "clientTurnId", "requestHash",
        "topic", "contextFingerprint", "contextSnapshot", "state", "attemptCount", "updatedAt"
      ) VALUES (
        'coach-turn-duplicate', 'athlete_legacy', 'coach-conversation-1', 1, 'client-turn-1', '${"1".repeat(64)}',
        'reflect', '${"e".repeat(64)}', '{}'::jsonb, 'processing', 1, CURRENT_TIMESTAMP
      )
    `), /unique constraint/iu);
    await assert.rejects(database.exec(`
      INSERT INTO "coach_messages" (
        "id", "athleteId", "conversationId", "turnId", "generation", "sequence", "role", "text", "topic"
      ) VALUES ('coach-user-duplicate-sequence', 'athlete_legacy', 'coach-conversation-1', 'coach-turn-1', 1, 1, 'user', 'Duplicate', 'reflect')
    `), /unique constraint/iu);
    await assert.rejects(database.exec(`
      INSERT INTO "coach_messages" (
        "id", "athleteId", "conversationId", "turnId", "generation", "sequence", "role", "text", "topic"
      ) VALUES ('coach-assistant-duplicate', 'athlete_legacy', 'coach-conversation-1', 'coach-turn-1', 1, 3, 'assistant', 'Duplicate reply', 'reflect')
    `), /unique constraint/iu);
    await assert.rejects(database.exec(`
      INSERT INTO "coach_messages" (
        "id", "athleteId", "conversationId", "turnId", "generation", "sequence", "role", "text", "topic"
      ) VALUES ('coach-foreign-message', 'athlete_other', 'coach-conversation-1', 'coach-turn-1', 1, 3, 'user', 'Foreign', 'reflect')
    `), /foreign key constraint/iu);
    await database.exec(`INSERT INTO "coach_conversation_archives" ("id", "athleteId", "conversationId", "generation", "requestId", "title", "startedAt", "finalSequence")
      VALUES ('archive_1', 'athlete_legacy', 'coach-conversation-1', 1, 'archive_request_1', 'A saved discussion', CURRENT_TIMESTAMP, 2)`);
    await assert.rejects(database.exec(`INSERT INTO "coach_conversation_archives" ("id", "athleteId", "conversationId", "generation", "requestId", "title", "startedAt", "finalSequence")
      VALUES ('archive_foreign', 'athlete_other', 'coach-conversation-1', 2, 'archive_foreign', 'Foreign', CURRENT_TIMESTAMP, 2)`), /foreign key constraint/iu);
    await assert.rejects(database.exec(`INSERT INTO "coach_conversation_archives" ("id", "athleteId", "conversationId", "generation", "requestId", "title", "startedAt", "finalSequence")
      VALUES ('archive_duplicate', 'athlete_legacy', 'coach-conversation-1', 1, 'archive_request_2', 'Duplicate', CURRENT_TIMESTAMP, 2)`), /unique constraint/iu);
    await database.exec(`UPDATE "coach_conversations" SET "generation" = 2, "sequence" = 0 WHERE "id" = 'coach-conversation-1'`);
    assert.equal((await database.query(`SELECT COUNT(*)::int AS count FROM "coach_messages" WHERE "generation" = 1`)).rows[0].count, 2);
    const usageIsolation = await database.query(`SELECT "athleteId", "attemptCount" FROM "coach_usage_buckets" ORDER BY "athleteId"`);
    assert.deepEqual(usageIsolation.rows, [{ athleteId: "athlete_legacy", attemptCount: 1 }, { athleteId: "athlete_other", attemptCount: 2 }]);
  } finally {
    await database.close();
  }
});
