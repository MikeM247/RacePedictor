import type { GoalContextRouteData } from "../contracts/coaching.ts";
import type { RaceHistoryRecord } from "../contracts/race-history.ts";
import { milestoneStateSchema, type MilestoneEntry, type MilestoneMutation, type MilestoneSource, type MilestoneState } from "../contracts/milestone-timeline.ts";
import { buildRaceJourney, resultAchievesTarget, type JourneyTarget } from "./race-journey.ts";

export const effectiveResult = (record: RaceHistoryRecord): RaceHistoryRecord => record.officialResult ? { ...record, raceDate: record.officialResult.raceDate, distanceMeters: record.officialResult.distanceMeters, elapsedTimeSeconds: record.officialResult.elapsedTimeSeconds } : record;
export function assessMilestone(record: RaceHistoryRecord, target: JourneyTarget | undefined, today: string) {
  const facts = effectiveResult(record);
  const assessmentReasons: string[] = [];
  if (!target) assessmentReasons.push("No linked target");
  else if (!target.targetTimeSeconds) assessmentReasons.push("No time target");
  else {
    if (!facts.raceDate) assessmentReasons.push("Official race date needed");
    else if (facts.raceDate !== target.date) assessmentReasons.push("Race date differs from target");
    if (!facts.distanceMeters) assessmentReasons.push("Official race distance needed");
    else if (Math.abs(facts.distanceMeters - target.distanceMeters) > 1) assessmentReasons.push("Official distance differs from target");
    if (!facts.elapsedTimeSeconds) assessmentReasons.push("Official result time needed");
  }
  return { performance: performance(record, target, today), assessmentBasis: record.officialResult ? "official" as const : "legacy" as const, assessmentReasons,
    ...(target?.targetTimeSeconds && facts.elapsedTimeSeconds && !assessmentReasons.length ? { timeDifferenceSeconds: facts.elapsedTimeSeconds - target.targetTimeSeconds } : {}) };
}
export const milestoneSourceKey = (source: MilestoneSource) => `${source.kind}:${source.id}`;
const sameResult = (record: RaceHistoryRecord, target: JourneyTarget, today: string) =>
  Boolean(record.raceDate && record.raceDate <= today && record.raceDate === target.date
    && record.distanceMeters !== undefined && Math.abs(record.distanceMeters - target.distanceMeters) <= 1 && record.elapsedTimeSeconds);

function performance(record: RaceHistoryRecord, target: JourneyTarget | undefined, today: string): MilestoneEntry["performance"] {
  record = effectiveResult(record);
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
    if (effectiveResult(record).raceDate && effectiveResult(record).raceDate! > today) continue;
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
    const current = linked.find((item) => item.mainGoal) ?? linked[0];
    const criteria = snapshot && (!current || snapshot.id === current.id || current.aliases?.includes(snapshot.id)) ? snapshot : saved ?? current;
    const target = criteria ? { ...criteria, mainGoal: current?.mainGoal ?? criteria.mainGoal, aliases: current?.aliases } : undefined;
    entries.push({ id: `achievement:${record.id}`, title: record.title, date: effectiveResult(record).raceDate,
      sources: [{ kind: "achievement", id: record.id }, ...linked.map((item) => ({ kind: "target" as const, id: item.id })),
        ...state.links.filter((link) => link.achievementId === record.id && !state.unlinkedTargetIds.includes(link.target.id) && !linked.some((item) => item.id === link.target.id))
          .map((link) => ({ kind: "target" as const, id: link.target.id }))],
      achievement: record, target, completion: "completed", ...assessMilestone(record, target, today) });
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
  if (change.operation === "review") {
    if (!change.achievementId || !change.reviewDecision) throw new MilestoneChangeError("VALIDATION_ERROR", "Choose a review decision.");
    const targetId = change.entryId.startsWith("target:") ? change.entryId.slice(7) : change.entryId;
    if (!context) throw new MilestoneChangeError("CONFLICT", "Review evidence changed.");
    const target = buildRaceJourney(context, [], today).ahead.find(item => item.id === targetId || item.aliases?.includes(targetId));
    const linkedIds = new Set(state.links.map(link => link.achievementId));
    const matches = target ? history.filter(record => {
      const facts = effectiveResult(record);
      return !linkedIds.has(record.id) && facts.raceDate === target.date && facts.distanceMeters !== undefined
        && Math.abs(facts.distanceMeters - target.distanceMeters) <= Math.max(100, target.distanceMeters * .02);
    }) : [];
    if (change.achievementId === "*") {
      if (!target || matches.length < 2) throw new MilestoneChangeError("CONFLICT", "The ambiguous review group changed. Reload before deciding.");
    } else if (!history.some(record => record.id === change.achievementId)) throw new MilestoneChangeError("CONFLICT", "Review evidence changed.");
    const evidenceVersion = change.achievementId === "*"
      ? reviewGroupEvidenceVersion(context, matches)
      : `${context.plan?.revision ?? 0}:${history.find(record => record.id === change.achievementId)?.revision ?? 1}`;
    state.reviews = state.reviews.filter(item => item.targetId !== targetId || item.achievementId !== change.achievementId);
    state.reviews.push({ targetId, achievementId: change.achievementId, decision: change.reviewDecision, evidenceVersion });
    return milestoneStateSchema.parse(state);
  }
  if (change.operation === "restore") {
    if (!state.removals.some((item) => item.id === change.entryId)) throw new MilestoneChangeError("CONFLICT", "This removal changed. Reload milestones before restoring.");
    state.removals = state.removals.filter((item) => item.id !== change.entryId);
    return state;
  }
  const projected = composeMilestoneTimeline(context, history, state, today).entries;
  const entry = projected.find((item) => item.id === change.entryId) ?? (change.operation === "link" && change.entryId.startsWith("target:") ? projected.find(item => item.achievement?.id === change.achievementId && item.target?.id === change.entryId.slice(7)) : undefined);
  if (!entry) throw new MilestoneChangeError("CONFLICT", "This milestone changed. Reload milestones before deciding again.");
  if (change.operation === "remove") {
    if (entry.target?.mainGoal && !entry.achievement) throw new MilestoneChangeError("VALIDATION_ERROR", "Manage the primary goal through Plan.");
    const sources = entry.sources.filter((source) => !(source.kind === "target" && source.id === context?.goal?.id));
    state.removals.push({ id: input.removalId, sources, title: entry.title, removedAt: input.now });
  } else if (change.operation === "link") {
    const target = entry.target;
    const record = history.find((item) => item.id === change.achievementId);
    if (!target || target.date > today || !record || !change.confirmedSameRace) throw new MilestoneChangeError("VALIDATION_ERROR", "Choose a past intermediate race and its own saved achievement.");
    if (state.removals.some((removal) => removal.sources.some((source) => source.kind === "achievement" && source.id === record.id))) throw new MilestoneChangeError("VALIDATION_ERROR", "Restore the saved achievement before linking it.");
    if (state.links.some((link) => link.target.id === target.id && link.achievementId !== record.id)) throw new MilestoneChangeError("CONFLICT", "Unlink the current achievement before changing its race link.");
    if (state.links.some((link) => link.achievementId === record.id && link.target.id !== target.id && !target.aliases?.includes(link.target.id))) throw new MilestoneChangeError("CONFLICT", "Unlink the other milestone before assigning this result.");
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

export function milestoneReviewCandidates(context: GoalContextRouteData | null, history: RaceHistoryRecord[], state: MilestoneState, today: string) {
 const linkedTargetIds = new Set(state.links.flatMap(link => [link.target.id, ...(link.target.aliases ?? [])]));
 const projectedTargetIds = new Set(composeMilestoneTimeline(context, history, state, today).entries.filter(entry => entry.achievement).flatMap(entry => entry.sources.filter(source => source.kind === "target").map(source => source.id)));
 const targets = buildRaceJourney(context, [], today).ahead.filter(t => t.date <= today && !state.unlinkedTargetIds.includes(t.id) && !linkedTargetIds.has(t.id) && !projectedTargetIds.has(t.id));
 const linkedIds = new Set(state.links.map(x => x.achievementId));
 const candidates = [] as Array<{ target: JourneyTarget; achievement: RaceHistoryRecord; ambiguous: boolean; evidenceVersion: string; assessment: ReturnType<typeof assessMilestone> }>;
 for (const target of targets) {
  const matches = history.filter(r => { const facts=effectiveResult(r); return !linkedIds.has(r.id) && facts.raceDate === target.date && facts.distanceMeters !== undefined && Math.abs(facts.distanceMeters-target.distanceMeters) <= Math.max(100,target.distanceMeters*.02); });
  const groupVersion = reviewGroupEvidenceVersion(context, matches);
  if (matches.length > 1 && state.reviews.some(item => item.targetId === target.id && item.achievementId === "*" && item.evidenceVersion === groupVersion)) continue;
  for (const achievement of matches) {
   const version=`${context?.plan?.revision??0}:${achievement.revision??1}`;
   const decision=state.reviews.find(x=>x.targetId===target.id&&x.achievementId===achievement.id);
   if (decision && decision.evidenceVersion===version) continue;
   candidates.push({target,achievement,ambiguous:matches.length!==1,evidenceVersion:version,assessment:assessMilestone(achievement,target,today)});
  }
 }
 return candidates;
}

function reviewGroupEvidenceVersion(context: GoalContextRouteData | null, matches: RaceHistoryRecord[]) {
 return `${context?.plan?.revision ?? 0}:group:${matches.map(record => `${record.id}:${record.revision ?? 1}`).sort().join(",")}`;
}
