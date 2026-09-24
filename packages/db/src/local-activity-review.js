import { createHash, randomUUID } from "node:crypto";
import { openLocalDatabase } from "./local-database.js";
import { getLocalActivity } from "./local-activities.js";
import {
  activityCoachReviewSchema,
  activityReviewRequestStatusSchema,
} from "../../core/src/contracts/activity-review.ts";

const nowIso = () => new Date().toISOString();

export function queueLocalActivityReview({ databasePath, athleteId = "athlete_001", activityId, now = nowIso } = {}) {
  if (!activityId) throw new Error("activityId is required");
  const database = openLocalDatabase({ databasePath });
  try {
    const timestamp = now();
    const existing = database.prepare(`
      SELECT athlete_id AS athleteId, activity_id AS activityId, status,
        updated_at AS updatedAt
      FROM local_activity_review_requests
      WHERE athlete_id = ? AND activity_id = ?
    `).get(athleteId, activityId);
    if (existing) {
      database.prepare(`
        UPDATE local_activity_review_requests
        SET status = 'queued', available_at = ?, last_error_code = NULL, updated_at = ?
        WHERE athlete_id = ? AND activity_id = ?
      `).run(timestamp, timestamp, athleteId, activityId);
    } else {
      database.prepare(`
        INSERT INTO local_activity_review_requests (
          athlete_id, activity_id, status, available_at, updated_at, created_at
        ) VALUES (?, ?, 'queued', ?, ?, ?)
      `).run(athleteId, activityId, timestamp, timestamp, timestamp);
    }
    return {
      activityId,
      requestId: `local_review_request_${athleteId}_${activityId}`,
      status: "queued",
      reused: Boolean(existing),
      updatedAt: timestamp,
    };
  } finally {
    database.close();
  }
}

export function getLocalActivityReview({ databasePath, athleteId = "athlete_001", activityId } = {}) {
  const database = openLocalDatabase({ databasePath });
  try {
    const request = database.prepare(`
      SELECT activity_id AS activityId, status, updated_at AS updatedAt
      FROM local_activity_review_requests
      WHERE athlete_id = ? AND activity_id = ?
    `).get(athleteId, activityId);
    const reviewRow = database.prepare(`
      SELECT payload_json AS payloadJson, generated_at AS generatedAt
      FROM local_activity_reviews
      WHERE athlete_id = ? AND activity_id = ?
      ORDER BY revision DESC LIMIT 1
    `).get(athleteId, activityId);
    const review = reviewRow ? activityCoachReviewSchema.parse(JSON.parse(reviewRow.payloadJson)) : null;
    return {
      activityId,
      status: request?.status ?? (review ? "ready" : "not_requested"),
      review,
      requestId: request ? `local_review_request_${athleteId}_${activityId}` : null,
      updatedAt: request?.updatedAt ?? reviewRow?.generatedAt ?? null,
      readRevision: null,
    };
  } finally {
    database.close();
  }
}

export function listLocalActivityReviews({ databasePath, athleteId = "athlete_001", limit = 10 } = {}) {
  const database = openLocalDatabase({ databasePath });
  try {
    const rows = database.prepare(`
      SELECT payload_json AS payloadJson
      FROM local_activity_reviews
      WHERE athlete_id = ?
      ORDER BY published_at DESC
      LIMIT ?
    `).all(athleteId, Math.min(Math.max(Number(limit) || 10, 1), 40));
    return rows.map((row) => activityCoachReviewSchema.parse(JSON.parse(row.payloadJson)));
  } finally {
    database.close();
  }
}

export function claimLocalActivityReview({ databasePath, athleteId = "athlete_001", now = nowIso } = {}) {
  const database = openLocalDatabase({ databasePath });
  try {
    const timestamp = now();
    const request = database.prepare(`
      SELECT activity_id AS activityId, attempt_count AS attemptCount
      FROM local_activity_review_requests
      WHERE athlete_id = ? AND status IN ('queued', 'retry_wait') AND available_at <= ?
      ORDER BY available_at, activity_id LIMIT 1
    `).get(athleteId, timestamp);
    if (!request) return null;
    database.prepare(`
      UPDATE local_activity_review_requests
      SET status = 'processing', attempt_count = attempt_count + 1, updated_at = ?
      WHERE athlete_id = ? AND activity_id = ?
    `).run(timestamp, athleteId, request.activityId);
    return { activityId: request.activityId, attemptCount: request.attemptCount + 1 };
  } finally {
    database.close();
  }
}

export function queueUnreviewedLocalActivities({ databasePath, athleteId = "athlete_001", now = nowIso } = {}) {
  const database = openLocalDatabase({ databasePath });
  try {
    const timestamp = now();
    const rows = database.prepare(`
      SELECT a.id AS activityId
      FROM activities a
      LEFT JOIN local_activity_review_requests r ON r.athlete_id = a.athlete_id AND r.activity_id = a.id
      LEFT JOIN local_activity_reviews v ON v.athlete_id = a.athlete_id AND v.activity_id = a.id
      WHERE a.athlete_id = ? AND r.activity_id IS NULL AND v.activity_id IS NULL
        AND a.sport IN ('run', 'trail_run', 'treadmill_run')
      ORDER BY a.occurred_at DESC
    `).all(athleteId);
    for (const row of rows) {
      database.prepare(`
        INSERT OR IGNORE INTO local_activity_review_requests (
          athlete_id, activity_id, status, available_at, updated_at, created_at
        ) VALUES (?, ?, 'queued', ?, ?, ?)
      `).run(athleteId, row.activityId, timestamp, timestamp, timestamp);
    }
    return rows.length;
  } finally {
    database.close();
  }
}

export function markLocalActivityReviewFailure({ databasePath, athleteId = "athlete_001", activityId, code, retry = true, now = nowIso } = {}) {
  const database = openLocalDatabase({ databasePath });
  try {
    const timestamp = now();
    database.prepare(`
      UPDATE local_activity_review_requests
      SET status = ?, last_error_code = ?, available_at = ?, updated_at = ?
      WHERE athlete_id = ? AND activity_id = ?
    `).run(retry ? "retry_wait" : "attention", code.slice(0, 80), retry ? timestamp : "9999-12-31T00:00:00.000Z", timestamp, athleteId, activityId);
  } finally {
    database.close();
  }
}

export function saveLocalActivityReview({ databasePath, athleteId = "athlete_001", activityId, review, now = nowIso } = {}) {
  const parsed = activityCoachReviewSchema.parse(review);
  if (parsed.athleteId !== athleteId || parsed.activityId !== activityId) throw new Error("Review identity does not match local scope");
  const database = openLocalDatabase({ databasePath });
  try {
    const timestamp = now();
    database.prepare(`
      INSERT INTO local_activity_reviews (
        id, athlete_id, activity_id, revision, input_fingerprint,
        payload_json, generated_at, published_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (athlete_id, activity_id, revision) DO UPDATE SET
        payload_json = excluded.payload_json, published_at = excluded.published_at
    `).run(
      parsed.id, athleteId, activityId, parsed.revision, parsed.inputFingerprint,
      JSON.stringify(parsed), parsed.generatedAt, parsed.publishedAt, timestamp,
    );
    database.prepare(`
      UPDATE local_activity_review_requests
      SET status = 'ready', last_error_code = NULL, updated_at = ?
      WHERE athlete_id = ? AND activity_id = ?
    `).run(timestamp, athleteId, activityId);
    return parsed;
  } finally {
    database.close();
  }
}

export function buildLocalReviewInput({ databasePath, athleteId = "athlete_001", activityId } = {}) {
  const activity = getLocalActivity({ databasePath, athleteId, activityId });
  if (!activity) throw new Error("Activity was not found in the local projection");
  const database = openLocalDatabase({ databasePath, readOnly: true });
  try {
    const localDate = (activity.localOccurredAt ?? activity.occurredAt).slice(0, 10);
    let plannedRows = [];
    try {
      plannedRows = database.prepare(`
        SELECT w.id, w.plan_id AS planId, p.version AS planVersion, w.title,
          w.local_date AS scheduledDate, w.duration_minutes AS durationMinutes,
          w.distance_m AS distanceMeters, w.intensity, w.details_json AS detailsJson
        FROM coaching_planned_workouts w
        JOIN coaching_plans p ON p.id = w.plan_id
        WHERE w.athlete_id = ? AND p.lifecycle = 'active' AND w.local_date = ?
        ORDER BY w.position, w.id
      `).all(athleteId, localDate);
    } catch (error) {
      if (!(error instanceof Error) || !/no such table: coaching_planned_workouts/i.test(error.message)) throw error;
    }
    const sessions = plannedRows.map((row) => {
      let details = {};
      try { details = JSON.parse(row.detailsJson || "{}"); } catch { details = {}; }
      return {
        id: row.id,
        planId: row.planId,
        planVersion: row.planVersion,
        title: row.title,
        scheduledDate: row.scheduledDate,
        durationMinutes: row.durationMinutes,
        distanceMeters: row.distanceMeters,
        intensityRpe: Number.isInteger(details.intensityRpe) ? details.intensityRpe : null,
        purpose: details.purpose,
        prescription: details.prescription,
      };
    });
    return { activity, sessions };
  } finally {
    database.close();
  }
}

export function reviewInputFingerprint(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function makeLocalReviewId(activityId, revision = 1) {
  return `activity_review_${activityId}_${revision}_${randomUUID().replaceAll("-", "")}`;
}

export function assertReviewStatus(value) {
  return activityReviewRequestStatusSchema.parse(value);
}
