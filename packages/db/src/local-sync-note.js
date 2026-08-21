import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const CLOUD_SYNC_START = "<!-- racepredictor:cloud-sync:start -->";
export const CLOUD_SYNC_END = "<!-- racepredictor:cloud-sync:end -->";

export async function updateCloudSyncNote(filePath, generatedContent) {
  if (typeof filePath !== "string" || !filePath.trim()) throw new Error("Cloud sync note path is required");
  if (typeof generatedContent !== "string") throw new Error("Cloud sync note content is required");
  let existing = null;
  try {
    existing = await readFile(filePath, "utf8");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  const block = `${CLOUD_SYNC_START}\n${generatedContent.trim()}\n${CLOUD_SYNC_END}`;
  let next;
  if (existing === null) {
    next = `# RacePredictor Cloud Sync\n\n${block}\n\n## My notes\n\n`;
  } else {
    const start = existing.indexOf(CLOUD_SYNC_START);
    const end = existing.indexOf(CLOUD_SYNC_END);
    next = start >= 0 && end > start
      ? `${existing.slice(0, start)}${block}${existing.slice(end + CLOUD_SYNC_END.length)}`
      : `${existing}${existing.endsWith("\n") ? "" : "\n"}\n${block}\n`;
  }
  if (next === existing) return { filePath, created: false, changed: false };
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, next, "utf8");
  await rename(temporaryPath, filePath);
  return { filePath, created: existing === null, changed: true };
}

export function renderCloudSyncSummary({ cursor, entities }) {
  const activityCount = entities.filter((entity) => entity.entityType === "activity" && entity.operation === "upsert").length;
  const planCount = entities.filter((entity) => entity.entityType === "plan" && entity.operation === "upsert").length;
  const calendarCount = entities.filter((entity) => entity.entityType === "calendar_session" && entity.operation === "upsert").length;
  const latestActivity = entities
    .filter((entity) => entity.entityType === "activity" && entity.operation === "upsert")
    .sort((left, right) => String(right.payload?.occurredAt ?? "").localeCompare(String(left.payload?.occurredAt ?? "")))[0];
  return [
    "> Generated from the selected structured RacePredictor cloud projection. Text outside this block is never changed.",
    "",
    "## Sync status",
    "",
    `- Cursor: ${cursor ?? "not started"}`,
    `- Workouts available locally: ${activityCount}`,
    `- Approved plans available locally: ${planCount}`,
    `- Calendar sessions available locally: ${calendarCount}`,
    `- Latest workout: ${latestActivity?.payload?.title ?? "None"}${latestActivity?.payload?.occurredAt ? ` (${latestActivity.payload.occurredAt})` : ""}`,
  ].join("\n");
}
