import type { GoalContextRouteData } from "../contracts/coaching.ts";
import type { RaceHistoryRecord } from "../contracts/race-history.ts";
import { milestoneStateSchema, type MilestoneEntry, type MilestoneMutation, type MilestoneSource, type MilestoneState } from "../contracts/milestone-timeline.ts";
import { buildRaceJourney, resultAchievesTarget, type JourneyTarget } from "./race-journey.ts";

export const milestoneSourceKey = (source: MilestoneSource) => `${source.kind}:${source.id}`;
const sameResult = (record: RaceHistoryRecord, target: JourneyTarget, today: string) =>
  Boolean(record.raceDate && record.raceDate <= today && record.raceDate === target.date
    && record.distanceMeters !== undefined && Math.abs(record.distanceMeters - target.distanceMeters) <= 1 && record.elapsedTimeSeconds);

function performance(record: RaceHistoryRecord, target: JourneyTarget | undefined, today: string): MilestoneEntry["performance"] {
  if (!target) return "not_set";
  if (!target.targetTimeSeconds) return "not_set";
  if (!sameResult(record, target, today)) return "unassessed";
  return resultAchievesTarget({ ...record, targetId: target.id }, target, today) ? "achieved" : "missed";
}

/** Read-only projection: approved sources never receive membership changes. */
export function composeMilestoneTimeline(context: GoalContextRouteData | null, history: RaceHistoryRecord[], state: MilestoneState, today: string) {
  const targets = buildRaceJourney(context, [], today).ahead;
  const used = new Set<string>();
  const entries: MilestoneEntry[] = [];
  for (const record of history) {
    if (record.raceDate && record.raceDate > today) continue;
    const linked = targets.filter((target) => {
      const explicit = state.links.find((link) => link.target.id === target.id);
      // Owner-confirmed race identity is separate from agreement on result facts.
      // Performance still requires the approved date and official distance.
      if (explicit) return explicit.achievementId === record.id;
      return !state.unlinkedTargetIds.includes(target.id)
        && (record.targetId === target.id || target.aliases?.includes(record.targetId ?? "")) && sameResult(record, target, today);
    });
    for (const target of linked) used.add(target.id);
    const saved = state.links.find((link) => link.achievementId === record.id)?.target;
    const snapshot = record.targetSnapshot ? { ...record.targetSnapshot, mainGoal: false } : undefined;
    const target = linked.find((item) => item.mainGoal) ?? linked[0] ?? saved ?? snapshot;
    entries.push({ id: `achievement:${record.id}`, title: record.title, date: record.raceDate,
      sources: [{ kind: "achievement", id: record.id }, ...linked.map((item) => ({ kind: "target" as const, id: item.id })),
        ...state.links.filter((link) => link.achievementId === record.id && !linked.some((item) => item.id === link.target.id))
          .map((link) => ({ kind: "target" as const, id: link.target.id }))],
      achievement: record, target, completion: "completed", performance: performance(record, target, today) });
  }
  for (const target of targets) {
    if (!used.has(target.id)) entries.push({ id: `target:${target.id}`, title: target.eventName || target.title, date: target.date,
      sources: [{ kind: "target", id: target.id }], target,
      completion: target.date < today ? "result_pending" : "upcoming", performance: "unassessed" });
  }
  const hidden = new Set(state.removals.flatMap((item) => item.sources.map(milestoneSourceKey)));
  const visible = entries.flatMap((entry) => {
    const sources = entry.sources.filter((source) => !hidden.has(milestoneSourceKey(source)));
    if (entry.achievement && hidden.has(`achievement:${entry.achievement.id}`)) {
      if (entry.target?.mainGoal && sources.some((source) => source.kind === "target")) {
        const target = entry.target;
        return [{ id: `target:${target.id}`, title: target.eventName || target.title, date: target.date, sources,
          target, completion: target.date < today ? "result_pending" as const : "upcoming" as const, performance: "unassessed" as const }];
      }
      return [];
    }
    return sources.length ? [{ ...entry, sources }] : [];
  });
  visible.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id));
  const removed: MilestoneEntry[] = state.removals.map((removal) => ({
    id: removal.id, title: removal.title, sources: removal.sources,
    completion: "result_pending", performance: "unassessed", removalId: removal.id,
  }));
  return { entries: visible, removed };
}

export class MilestoneChangeError extends Error {
  readonly code: "CONFLICT" | "VALIDATION_ERROR";
  constructor(code: "CONFLICT" | "VALIDATION_ERROR", message: string) { super(message); this.code = code; }
}

export function changeMilestoneState(input: {
  context: GoalContextRouteData | null; history: RaceHistoryRecord[]; state: MilestoneState;
  change: MilestoneMutation; today: string; removalId: string; now: string;
}): MilestoneState {
  const { context, history, change, today } = input;
  const state = milestoneStateSchema.parse(structuredClone(input.state));
  if (change.operation === "restore") {
    if (!state.removals.some((item) => item.id === change.entryId)) throw new MilestoneChangeError("CONFLICT", "This removal changed. Reload milestones before restoring.");
    state.removals = state.removals.filter((item) => item.id !== change.entryId);
    return state;
  }
  const entry = composeMilestoneTimeline(context, history, state, today).entries.find((item) => item.id === change.entryId);
  if (!entry) throw new MilestoneChangeError("CONFLICT", "This milestone changed. Reload milestones before deciding again.");
  if (change.operation === "remove") {
    if (entry.target?.mainGoal && !entry.achievement) throw new MilestoneChangeError("VALIDATION_ERROR", "Manage the primary goal through Plan.");
    const sources = entry.sources.filter((source) => !(source.kind === "target" && source.id === context?.goal?.id));
    state.removals.push({ id: input.removalId, sources, title: entry.title, removedAt: input.now });
  } else if (change.operation === "link") {
    const target = entry.target;
    const record = history.find((item) => item.id === change.achievementId);
    if (!target || target.mainGoal || target.date > today || !record || !change.confirmedSameRace) throw new MilestoneChangeError("VALIDATION_ERROR", "Choose a past intermediate race and its own saved achievement.");
    if (state.removals.some((removal) => removal.sources.some((source) => source.kind === "achievement" && source.id === record.id))) throw new MilestoneChangeError("VALIDATION_ERROR", "Restore the saved achievement before linking it.");
    if (state.links.some((link) => link.target.id === target.id && link.achievementId !== record.id)) throw new MilestoneChangeError("CONFLICT", "Unlink the current achievement before changing its race link.");
    state.links = [...state.links.filter((link) => link.target.id !== target.id), { target, achievementId: record.id }];
    state.unlinkedTargetIds = state.unlinkedTargetIds.filter((id) => id !== target.id);
  } else {
    const targetIds = entry.sources.filter((source) => source.kind === "target").map((source) => source.id);
    if (!entry.achievement || !targetIds.length) throw new MilestoneChangeError("VALIDATION_ERROR", "This milestone has no race link to remove.");
    state.links = state.links.filter((link) => !targetIds.includes(link.target.id));
    state.unlinkedTargetIds = [...new Set([...state.unlinkedTargetIds, ...targetIds])];
  }
  return milestoneStateSchema.parse(state);
}
