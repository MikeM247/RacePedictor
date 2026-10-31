import type { MilestoneEntry } from "../contracts/milestone-timeline.ts";
import { targetUsesStrictTime } from "./race-journey.ts";
const compare = (a: MilestoneEntry, b: MilestoneEntry) =>
  a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0;
export function homeMilestones(entries: MilestoneEntry[], today: string) {
  const final = entries.find((e) => e.target?.mainGoal);
  const achievements = entries
    .filter((e) => e.achievement && e !== final)
    .sort(compare);
  const targets = entries
    .filter((e) => !e.achievement && e !== final)
    .sort(compare);
  const ordered = [...achievements, ...targets, ...(final ? [final] : [])];
  const next =
    targets.find(
      (e) => e.target && e.target.date >= today && e.completion !== "completed",
    ) ??
    (final?.target &&
    final.completion !== "completed" &&
    final.target.date >= today
      ? final
      : null);
  const latest =
    achievements.filter((e) => e.date).at(-1) ?? achievements.at(-1);
  const nextIndex = next ? targets.indexOf(next) : -1;
  const selected = new Set(
    [
      latest,
      next,
      targets.slice(nextIndex < 0 ? 0 : nextIndex + 1).find((e) => e !== next),
      final,
    ].filter(Boolean),
  );
  return {
    ordered,
    next,
    highlights:
      ordered.length <= 4
        ? ordered
        : ordered.filter((e) => selected.has(e)).slice(0, 4),
  };
}
export function targetTimeLabel(seconds?: number, strict = false) {
  if (!seconds) return "Finish goal";
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60),
    remainder = seconds % 60;
  const time =
    hours === 0 || (hours === 1 && minutes === 0 && remainder === 0)
      ? `${Math.floor(seconds / 60)}${remainder ? `:${String(remainder).padStart(2, "0")}` : ""}`
      : `${hours}:${String(minutes).padStart(2, "0")}${remainder ? `:${String(remainder).padStart(2, "0")}` : ""}`;
  return strict ? `Sub-${time}` : `Target ${time}`;
}
export function entryTargetLabel(entry: MilestoneEntry) {
  return targetTimeLabel(
    entry.target?.targetTimeSeconds,
    targetUsesStrictTime(entry.target?.title ?? entry.title),
  );
}
export function entryStatus(entry: MilestoneEntry) {
  if (entry.completion !== "completed")
    return entry.completion === "result_pending"
      ? "Result pending"
      : "Upcoming";
  if (entry.performance === "missed") return "Completed · target missed";
  if (entry.performance === "unassessed")
    return "Completed · target unassessed";
  return entry.achievement?.achievement === "personal_best" ||
    entry.performance === "achieved" ||
    entry.achievement?.achievement === "goal_achieved"
    ? "Achieved"
    : "Completed";
}
export function daysUntil(date: string, today: string) {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) /
        86400000,
    ),
  );
}
