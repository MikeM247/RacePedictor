import type { ActivityDetail } from "../../src/contracts/activity.ts";
import type { PaceBlock } from "../../src/contracts/activity-pace-comparison.ts";
import { paceHash, prescriptionSource, splitFingerprint } from "../../src/services/activity-pace-comparison.ts";
export const paces = [352,353,350,352,343,360,343,340,346,341,360,341,341,344,343,370,343,343,335,341,331,290];
export const activity: ActivityDetail = {
  id: "pace-run", athleteId: "pace-athlete", title: "Sunday race", sport: "run", sourceType: "strava",
  occurredAt: "2026-10-04T03:30:22.000Z", endedAt: "2026-10-04T05:32:31.000Z", localOccurredAt: "2026-10-04T05:30:22+02:00",
  distanceM: 21193.1, elapsedTimeS: 7329, avgPaceSecPerKm: 346, elevationGainM: 36, elevationLossM: 36,
  hrAvailable: false, cadenceAvailable: false, dedupeHash: "d".repeat(64), createdAt: "2026-10-04T06:00:00.000Z",
  splits: paces.map((pace, index) => ({ id: `split-${index}`, activityId: "pace-run", athleteId: "pace-athlete", splitIndex: index, startOffsetS: index*350, endOffsetS: index*350+pace, durationS: index === 21 ? 56 : pace, distanceM: index === 21 ? 193.1 : 1000, paceSecPerKm: pace, elevGainM: 0, elevLossM: 0, createdAt: "2026-10-04T06:00:00.000Z" })),
};
export const plan = {
  id: "pace-plan", athleteId: activity.athleteId, goalId: "pace-goal", goalRevision: 1, routineRevision: 1,
  version: 11, revision: 2, startsOn: "2026-09-28", endsOn: "2026-10-04", timezone: "Africa/Johannesburg",
  weeklyStructure: [{ weekStartsOn: "2026-09-28", focus: "Race", sessionIds: ["race-session"] }],
  workouts: [{ id: "race-session", kind: "run", scheduledDate: "2026-10-04", title: "Gaterite Challenge 21.1 km — PB first", purpose: "Race", prescription: "First 3 km near 5:55/km; settle near 5:50–5:52/km to 15 km; then build only if sustainable.", cautions: [], durationMinutes: 135, distanceMeters: 21100 }],
  contextArtifactId: "context", createdAt: "2026-09-25T08:00:00.000Z",
  approval: { goalRationale: "Approved goal", rationale: "Approved rationale", summary: "Approved plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash: "b".repeat(64) },
  status: "active", activatedAt: "2026-09-25T09:00:00.000Z", activatedBy: "user",
};
export const blocks: PaceBlock[] = [
  { kind: "approximate", firstSplitIndex: 0, lastSplitIndex: 2, paceSecPerKm: 355, label: "Controlled start · km 1–3" },
  { kind: "range", firstSplitIndex: 3, lastSplitIndex: 14, minPaceSecPerKm: 350, maxPaceSecPerKm: 352, label: "Settle · km 4–15" },
  { kind: "effort", firstSplitIndex: 15, lastSplitIndex: 21, guidance: "Build only if sustainable", label: "Finish · after km 15" },
];
export const source = prescriptionSource(plan, "race-session");
export function artifact(overrides: Record<string, unknown> = {}) {
  const body = { schema: "activity-pace-comparison.v1" as const, athleteId: activity.athleteId, activityId: activity.id, splitFingerprint: splitFingerprint(activity), source, blocks,
    expectedActivityRevision: 3, expectedComparisonRevision: 0, artifactId: "artifact-1", approvedAt: "2026-10-06T08:00:00.000Z", ...overrides };
  return { ...body, artifactHash: paceHash(body) };
}
