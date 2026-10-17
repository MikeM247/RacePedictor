import type { GoalContextRouteData } from "../contracts/coaching.ts";
import type { RaceHistoryRecord } from "../contracts/race-history.ts";

export type JourneyTarget = {
  id: string; title: string; eventName?: string; date: string;
  distanceMeters: number; targetTimeSeconds?: number; mainGoal: boolean; aliases?: string[];
};
export type JourneyAchievement = RaceHistoryRecord & { matchedTarget?: JourneyTarget };

export function targetUsesStrictTime(title: string) {
  return /\b(?:sub[\s-]*\d|under\s+\d)/iu.test(title);
}

export function resultAchievesTarget(result: RaceHistoryRecord, target: JourneyTarget, today: string) {
  if ((result.targetId !== target.id && !target.aliases?.includes(result.targetId ?? "")) || !result.raceDate || result.raceDate !== target.date || result.raceDate > today
    || result.distanceMeters === undefined || Math.abs(result.distanceMeters - target.distanceMeters) > 1
    || result.elapsedTimeSeconds === undefined) return false;
  return target.targetTimeSeconds === undefined || (targetUsesStrictTime(target.title)
    ? result.elapsedTimeSeconds < target.targetTimeSeconds
    : result.elapsedTimeSeconds <= target.targetTimeSeconds);
}

export function buildRaceJourney(context: GoalContextRouteData | null, history: RaceHistoryRecord[], today: string) {
  const targets: JourneyTarget[] = context?.state === "ready" ? (context.milestones ?? []).map((race) => ({
    id: race.id, title: race.title, eventName: race.eventName, date: race.targetDate,
    distanceMeters: race.distanceMeters, targetTimeSeconds: race.targetTimeSeconds, mainGoal: false,
  })) : [];
  const goal = context?.goal;
  if (goal?.target.kind === "performance") {
    const target = goal.target;
    const sameRace = targets.findIndex((race) => race.date === target.targetDate
      && race.distanceMeters === target.distanceMeters && race.eventName === target.eventName);
    const aliases = sameRace >= 0 ? [targets[sameRace].id] : [];
    if (sameRace >= 0) targets.splice(sameRace, 1);
    targets.push({ id: goal.id, title: goal.title, eventName: target.eventName, date: target.targetDate,
      distanceMeters: target.distanceMeters, targetTimeSeconds: target.targetTimeSeconds, mainGoal: true, aliases });
  }
  targets.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const usableHistory = history.filter((record) => !record.raceDate || record.raceDate <= today);
  const achieved: JourneyAchievement[] = [];
  const completed = new Set<string>();
  for (const record of usableHistory) {
    const matchedTarget = targets.find((target) => resultAchievesTarget(record, target, today));
    if (matchedTarget) {
      if (completed.has(matchedTarget.id)) continue;
      completed.add(matchedTarget.id);
      achieved.push({ ...record, matchedTarget });
    } else if (record.targetSnapshot && resultAchievesTarget(record, { ...record.targetSnapshot, mainGoal: false }, today)
      || record.achievement === "personal_best" || (record.achievement === "goal_achieved" && !record.targetId)) {
      achieved.push(record);
    }
  }
  // Undated confirmations form an achieved group; they claim no race date.
  achieved.sort((a, b) => (a.raceDate ?? "").localeCompare(b.raceDate ?? "") || a.id.localeCompare(b.id));
  const ahead = targets.filter((target) => !completed.has(target.id));
  return { achieved, ahead, nextId: ahead.find((target) => target.date >= today)?.id ?? null };
}
