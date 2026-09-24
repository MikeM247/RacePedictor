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
    const starts = markerOffsets(existing, CLOUD_SYNC_START);
    const ends = markerOffsets(existing, CLOUD_SYNC_END);
    if (starts.length === 0 && ends.length === 0) {
      next = `${existing}${existing.endsWith("\n") ? "" : "\n"}\n${block}\n`;
    } else if (starts.length === 1 && ends.length === 1 && starts[0] < ends[0]) {
      next = `${existing.slice(0, starts[0])}${block}${existing.slice(ends[0] + CLOUD_SYNC_END.length)}`;
    } else {
      throw new Error("Cloud sync generated markers are malformed; refusing to overwrite the note");
    }
  }
  if (next === existing) return { filePath, created: false, changed: false };
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, next, "utf8");
  await rename(temporaryPath, filePath);
  return { filePath, created: existing === null, changed: true };
}

export function renderCloudSyncSummary({ cursor, entities }) {
  const projection = entities ?? { activePlan: null, activities: [], calendarSessions: [] };
  const activePlan = projection.activePlan;
  const calendarSessions = projection.calendarSessions ?? [];
  const activities = projection.activities ?? [];
  const lines = [
    "> Generated from the selected structured RacePredictor cloud projection. Text outside this block is never changed.",
    "> Cloud-owned plans, calendar sessions, and activities are read-only here; update them in RacePredictor.",
    "",
    "## Sync status",
    "",
    `- Cursor: ${cursor ?? "not started"}`,
    `- Workouts available locally: ${activities.length}`,
    `- Active approved plan: ${activePlan ? safeText(activePlan.id) : "None"}`,
    `- Calendar sessions available locally: ${calendarSessions.length}`,
  ];
  lines.push("", "## Active approved plan", "");
  if (!activePlan) {
    lines.push("- None");
  } else {
    lines.push(
      `- Plan: ${safeText(activePlan.id)} (revision ${activePlan.revision})`,
      `- Dates: ${activePlan.startsOn} to ${activePlan.endsOn}`,
      `- Summary: ${safeText(activePlan.approval.summary)}`,
    );
  }
  lines.push("", "## Calendar sessions", "");
  if (calendarSessions.length === 0) {
    lines.push("- None");
  } else {
    for (const session of calendarSessions) {
      lines.push(`- ${session.effectiveDate}${session.startTime ? ` ${session.startTime}` : ""} — ${safeText(session.title)} (${session.status})`);
    }
  }
  lines.push("", "## Recent activities", "");
  if (activities.length === 0) {
    lines.push("- None");
  } else {
    for (const activity of activities.slice(0, 10)) {
      lines.push(`- ${activity.occurredAt} — ${safeText(activity.title ?? activity.sport)} (${formatDistance(activity.distanceM)})`);
    }
  }
  return lines.join("\n");
}

function markerOffsets(content, marker) {
  const offsets = [];
  let offset = content.indexOf(marker);
  while (offset >= 0) {
    offsets.push(offset);
    offset = content.indexOf(marker, offset + marker.length);
  }
  return offsets;
}

function safeText(value) {
  return String(value).replace(/[\r\n]+/gu, " ").replace(/<!--/gu, "&lt;!--").trim();
}

function formatDistance(distanceM) {
  return `${(Number(distanceM) / 1000).toFixed(1)} km`;
}
