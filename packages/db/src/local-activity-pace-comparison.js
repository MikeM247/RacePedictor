import { openLocalDatabase } from "./local-database.js";
import { getLocalActivity } from "./local-activities.js";
import { paceComparisonSchema } from "../../core/src/contracts/activity-pace-comparison.ts";
import { comparisonRead, PaceComparisonError } from "../../core/src/services/activity-pace-comparison.ts";

// Store only the cloud-accepted artifact; approval and publication remain one authority.
export function cachePaceComparison({ databasePath, comparison }) {
  const parsed = paceComparisonSchema.parse(comparison), db = openLocalDatabase({ databasePath });
  try {
    db.exec("BEGIN IMMEDIATE");
    const existing = db.prepare("SELECT artifact_hash AS hash FROM local_activity_pace_comparisons WHERE athlete_id = ? AND activity_id = ? AND revision = ?").get(parsed.athleteId, parsed.activityId, parsed.revision);
    if (existing && existing.hash !== parsed.artifactHash) throw new PaceComparisonError("CONFLICT", "Cached revision has different content");
    if (!existing) db.prepare("INSERT INTO local_activity_pace_comparisons VALUES (?, ?, ?, ?, ?, ?)").run(parsed.athleteId, parsed.activityId, parsed.revision, parsed.artifactId, parsed.artifactHash, JSON.stringify(parsed));
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; } finally { db.close(); }
}
export function getLocalPaceComparison({ databasePath, athleteId, activityId }) {
  const activity = getLocalActivity({ databasePath, athleteId, activityId });
  if (!activity) throw new PaceComparisonError("NOT_FOUND", "Activity was not found");
  const db = openLocalDatabase({ databasePath });
  try {
    const mapping = db.prepare("SELECT cloud_activity_id AS id FROM cloud_activity_mappings WHERE athlete_id = ? AND local_activity_id = ?").get(athleteId, activityId);
    const row = db.prepare("SELECT payload_json AS payload FROM local_activity_pace_comparisons WHERE athlete_id = ? AND activity_id = ? ORDER BY revision DESC LIMIT 1").get(athleteId, mapping?.id ?? activityId);
    return comparisonRead(activity, row ? paceComparisonSchema.parse(JSON.parse(row.payload)) : null);
  } finally { db.close(); }
}
