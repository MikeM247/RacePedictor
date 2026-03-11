import { createHash } from "node:crypto";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const idempotentResponses = new Map();
const VALID_SOURCE_TYPES = new Set(["gpx", "tcx", "csv", "fit", "strava", "garmin", "polar", "coros", "suunto", "other"]);

function countTagOccurrences(body, tagName) {
  const regex = new RegExp(`<${tagName}(\\s|>|\\/)`, "gi");
  return [...body.matchAll(regex)].length;
}

function parseAndStageCounts(sourceType, body) {
  const warnings = [];

  if (sourceType === "gpx") {
    const trkCount = countTagOccurrences(body, "trk");
    if (trkCount > 1) warnings.push("Multiple GPX activities detected. Only the first activity was staged in MVP mode.");
    if (trkCount === 0) return { status: "failed", stagedCount: 0, rejectedCount: 1, parseWarnings: ["GPX file has no <trk> activity block."] };
  }

  if (sourceType === "tcx") {
    const activityCount = countTagOccurrences(body, "Activity");
    if (activityCount > 1) warnings.push("Multiple TCX activities detected. Only the first activity was staged in MVP mode.");
    if (activityCount === 0) return { status: "failed", stagedCount: 0, rejectedCount: 1, parseWarnings: ["TCX file has no <Activity> block."] };
  }

  return { status: "parsed", stagedCount: 1, rejectedCount: 0, parseWarnings: warnings };
}

export async function handleImportUpload(formData) {
  const file = formData.get("file");
  const sourceType = formData.get("sourceType");
  const idempotencyKey = formData.get("idempotencyKey");

  if (!(file instanceof File)) throw new Error("The multipart field 'file' is required.");
  if (typeof sourceType !== "string" || !VALID_SOURCE_TYPES.has(sourceType)) throw new Error("sourceType is required and must be a valid enum value.");
  if (idempotencyKey != null && (typeof idempotencyKey !== "string" || !idempotencyKey.trim())) throw new Error("idempotencyKey must be a non-empty string when provided.");
  if (file.size === 0) throw new Error("Uploaded file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Uploaded file exceeds the 5MB MVP upload limit.");

  if (typeof idempotencyKey === "string" && idempotentResponses.has(idempotencyKey)) {
    const existing = idempotentResponses.get(idempotencyKey);
    return { ...existing, parseWarnings: [...existing.parseWarnings, "Idempotent retry accepted; returning existing import summary."] };
  }

  const text = await file.text();
  const checksum = createHash("sha256").update(text).digest("hex");
  const parseResult = parseAndStageCounts(sourceType, text);

  const response = {
    importId: `imp_${checksum.slice(0, 12)}`,
    status: parseResult.status,
    stagedCount: parseResult.stagedCount,
    duplicateCount: 0,
    rejectedCount: parseResult.rejectedCount,
    parseWarnings: parseResult.parseWarnings,
  };

  if (typeof idempotencyKey === "string") idempotentResponses.set(idempotencyKey, response);
  return response;
}
