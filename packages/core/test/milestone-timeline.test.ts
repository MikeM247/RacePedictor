import assert from "node:assert/strict";
import test from "node:test";
import { goalContextRouteDataSchema } from "../src/contracts/coaching.ts";
import type { RaceHistoryRecord } from "../src/contracts/race-history.ts";
import { emptyMilestoneState, milestoneMutationSchema, type MilestoneMutation, type MilestoneState } from "../src/contracts/milestone-timeline.ts";
import { changeMilestoneState, composeMilestoneTimeline } from "../src/services/milestone-timeline.ts";

export const context = goalContextRouteDataSchema.parse({
  state: "ready", plan: { id: "p", version: 1, revision: 1, startsOn: "2026-09-01", endsOn: "2027-06-13", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) },
  goal: { id: "main", athleteId: "a", revision: 1, title: "Comrades", why: "Running", target: { kind: "performance", targetDate: "2027-06-13", distanceMeters: 89000 } },
  milestones: [{ id: "gate", title: "Gaterite Challenge sub-2", targetDate: "2026-10-04", distanceMeters: 21097.5, targetTimeSeconds: 7200 }], projection: null,
});
export const history: RaceHistoryRecord[] = [{ id: "verulam", title: "Verulam Gaterite Half Marathon", confirmedBy: "user", achievement: "goal_achieved", raceDate: "2026-10-04", distanceMeters: 21097.5, elapsedTimeSeconds: 7300, revision: 1 }];
const today = "2026-10-25";
const command = (operation: MilestoneMutation["operation"], entryId: string, extra = {}): MilestoneMutation => ({ operation, entryId, expectedRevision: 0, sourceVersion: "v", ...extra });
function change(state: MilestoneState, mutation: MilestoneMutation, records = history) {
  return changeMilestoneState({ context, history: records, state, change: mutation, today, removalId: "removal", now: "2026-10-25T10:00:00Z" });
}
test("removal persists membership without rewriting the approved target or separate achievement", () => {
  const original = JSON.stringify({ context, history });
  const state = change(emptyMilestoneState(), command("remove", "target:gate"));
  const view = composeMilestoneTimeline(context, history, state, today);
  assert.deepEqual(view.entries.map((item) => item.title), [history[0].title, "Comrades"]);
  assert.equal(view.removed.length, 1);
  assert.equal(JSON.stringify({ context, history }), original);
  assert.equal(composeMilestoneTimeline({ ...context, plan: { ...context.plan!, version: 2 } }, history, state, today).entries.length, 2);
  assert.equal(composeMilestoneTimeline(context, history, change(state, command("restore", "removal")), today).entries.length, 3);
});
test("explicit same-race link reconciles different names and completion is independent of missed time", () => {
  assert.equal(composeMilestoneTimeline(context, history, emptyMilestoneState(), today).entries.length, 3);
  const state = change(emptyMilestoneState(), command("link", "target:gate", { achievementId: "verulam", confirmedSameRace: true }));
  const entries = composeMilestoneTimeline(context, history, state, today).entries;
  assert.equal(entries.length, 2); assert.equal(entries[0].completion, "completed"); assert.equal(entries[0].performance, "missed");
  const corrected = [{ ...history[0], elapsedTimeSeconds: 7100 }];
  assert.equal(composeMilestoneTimeline(context, corrected, state, today).entries[0].performance, "achieved");
  const removed = change(state, command("remove", "achievement:verulam"));
  assert.deepEqual(composeMilestoneTimeline(context, history, removed, today).entries.map((item) => item.id), ["target:main"]);
  assert.equal(composeMilestoneTimeline(context, history, change(removed, command("restore", "removal")), today).entries.length, 2);
  const unlinked = change(state, command("unlink", "achievement:verulam"));
  assert.equal(composeMilestoneTimeline(context, history, unlinked, today).entries.length, 3);
});
test("unknown result facts stay unknown; links never award a numeric time goal", () => {
  const unknown = [{ id: "verulam", title: "Verulam", confirmedBy: "user" as const, achievement: "goal_achieved" as const }];
  const state = change(emptyMilestoneState(), command("link", "target:gate", { achievementId: "verulam", confirmedSameRace: true }), unknown);
  const record = composeMilestoneTimeline(context, unknown, state, today).entries[0];
  assert.equal(record.completion, "completed"); assert.equal(record.performance, "unassessed");
  assert.equal(record.achievement?.raceDate, undefined); assert.equal(record.achievement?.elapsedTimeSeconds, undefined);
});
test("legacy linked slower results complete the race; unlink suppresses that automatic relationship", () => {
  const linked = [{ ...history[0], targetId: "gate" }];
  const view = composeMilestoneTimeline(context, linked, emptyMilestoneState(), today);
  assert.equal(view.entries.length, 2); assert.equal(view.entries[0].performance, "missed");
  const state = change(emptyMilestoneState(), command("unlink", "achievement:verulam"), linked);
  assert.equal(composeMilestoneTimeline(context, linked, state, today).entries.length, 3);
});
test("explicit identity may reconcile different recorded facts without awarding target performance", () => {
  for (const records of [[{ ...history[0], raceDate: "2026-10-03" }], [{ ...history[0], distanceMeters: 10000 }]]) {
    const state = change(emptyMilestoneState(), command("link", "target:gate", { achievementId: "verulam", confirmedSameRace: true }), records);
    const entries = composeMilestoneTimeline(context, records, state, today).entries;
    assert.equal(entries.length, 2); assert.equal(entries[0].performance, "unassessed");
  }
});
test("forged identities and primary-goal removal cannot reconcile", () => {
  assert.throws(() => change(emptyMilestoneState(), command("remove", "target:main")), { code: "VALIDATION_ERROR" });
  assert.throws(() => change(emptyMilestoneState(), command("remove", "target:foreign")), { code: "CONFLICT" });
  assert.throws(() => change(emptyMilestoneState(), command("link", "target:gate", { achievementId: "foreign", confirmedSameRace: true })), { code: "VALIDATION_ERROR" });
  assert.equal(milestoneMutationSchema.safeParse(command("link", "target:gate", { achievementId: "verulam" })).success, false);
});

test("the Verulam GPS-distance mismatch reconciles identity while preserving every saved fact", () => {
  const records = [{ ...history[0], achievement: "personal_best" as const, targetId: "gate", distanceMeters: 21194, elapsedTimeSeconds: 7329 }];
  assert.equal(composeMilestoneTimeline(context, records, emptyMilestoneState(), today).entries.length, 3);
  const before = JSON.stringify(records);
  const state = change(emptyMilestoneState(), command("link", "target:gate", { achievementId: "verulam", confirmedSameRace: true }), records);
  const entries = composeMilestoneTimeline(context, records, state, today).entries;
  assert.equal(entries.length, 2); assert.equal(entries[0].completion, "completed"); assert.equal(entries[0].performance, "unassessed");
  assert.equal(JSON.stringify(records), before);
});
test("restoring one removal preserves other removals and expired targets stay removed after plan replacement", () => {
  const first = change(emptyMilestoneState(), command("remove", "target:gate"));
  const second = changeMilestoneState({ context, history, state: first, change: command("remove", "achievement:verulam"), today, removalId: "second", now: "2026-10-25T10:00:00Z" });
  const restored = change(second, command("restore", "removal"));
  assert.equal(restored.removals.length, 1); assert.equal(restored.removals[0].id, "second");
  assert.equal(composeMilestoneTimeline({ ...context, milestones: [] }, history, first, today).removed.length, 1);
});
