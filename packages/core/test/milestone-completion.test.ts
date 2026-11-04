import test from "node:test";
import assert from "node:assert/strict";
import { assessMilestone, composeMilestoneTimeline } from "../src/services/milestone-timeline.ts";
import { emptyMilestoneState } from "../src/contracts/milestone-timeline.ts";
import { history, context } from "./milestone-timeline.test.ts";
const target = { id: "oldies", title: "Sub-60", date: "2026-11-01", distanceMeters: 10000, targetTimeSeconds: 3600, mainGoal: false, comparison: "lt" as const };
test("official facts determine assessment without borrowing GPS facts", () => {
 const result = { ...history[0], targetId: "oldies", raceDate: target.date, distanceMeters: 10100, officialResult: { confirmedBy: "user" as const, raceDate: target.date, distanceMeters: 10000, elapsedTimeSeconds: 3563 } };
 assert.equal(assessMilestone(result, target, target.date).performance, "achieved");
 assert.equal(assessMilestone(result, target, target.date).timeDifferenceSeconds, -37);
 assert.equal(assessMilestone({ ...result, officialResult: { confirmedBy: "user" } }, target, target.date).performance, "unassessed");
 assert.equal(assessMilestone({ ...result, officialResult: { ...result.officialResult, elapsedTimeSeconds: 3600 } }, target, target.date).performance, "missed");
});
test("a captured target remains the assessment authority after plan changes", () => {
 const snapshot = { id: "gate", title: "Sub-2", date: "2026-10-04", distanceMeters: 21097.5, targetTimeSeconds: 7200 };
 const records = [{ ...history[0], targetId: "gate", targetSnapshot: snapshot, elapsedTimeSeconds: 7100 }];
 const changed = { ...context, milestones: context.milestones!.map(m => ({ ...m, title: "Sub-1", targetTimeSeconds: 3600 })) };
 const entry = composeMilestoneTimeline(changed, records, emptyMilestoneState(), "2026-11-01").entries[0];
 assert.equal(entry.performance, "achieved");
 assert.equal(entry.target?.targetTimeSeconds, 7200);
});

test("automatic review candidates require race-day facts, stay deduplicated after Later, and reopen on changed evidence", async () => {
 const { milestoneReviewCandidates, changeMilestoneState } = await import("../src/services/milestone-timeline.ts");
 const source = { ...history[0], targetId: undefined, title: "Verulam Gaterite Half Marathon", revision: 1 };
 const candidates = milestoneReviewCandidates(context, [source], emptyMilestoneState(), "2026-10-04");
 assert.equal(candidates.length, 1);
 assert.equal(candidates[0].ambiguous, false);
 const command = { operation: "review" as const, entryId: "gate", achievementId: source.id, reviewDecision: "deferred" as const, expectedRevision: 0, sourceVersion: "v" };
 const state = changeMilestoneState({ context, history: [source], state: emptyMilestoneState(), change: command, today: "2026-10-04", removalId: "r", now: "2026-10-04T10:00:00Z" });
 assert.equal(milestoneReviewCandidates(context, [source], state, "2026-10-04").length, 0);
 assert.equal(milestoneReviewCandidates(context, [{ ...source, revision: 2 }], state, "2026-10-04").length, 1);
});

test("ambiguous result groups can be deferred together, reopen when the evidence set changes, and stop after a target is linked", async () => {
 const { milestoneReviewCandidates, changeMilestoneState } = await import("../src/services/milestone-timeline.ts");
 const first = { ...history[0], id: "first-match", targetId: undefined, raceDate: "2026-10-04", distanceMeters: 21097.5, elapsedTimeSeconds: 7100, revision: 1 };
 const second = { ...first, id: "second-match", revision: 2 };
 const group = [first, second];
 const candidates = milestoneReviewCandidates(context, group, emptyMilestoneState(), "2026-10-04");
 assert.equal(candidates.length, 2);
 assert.equal(candidates.every(candidate => candidate.ambiguous), true);
 const deferred = changeMilestoneState({ context, history: group, state: emptyMilestoneState(), change: { operation: "review", entryId: "gate", achievementId: "*", reviewDecision: "deferred", expectedRevision: 0, sourceVersion: "v" }, today: "2026-10-04", removalId: "r", now: "2026-10-04T10:00:00Z" });
 assert.equal(milestoneReviewCandidates(context, group, deferred, "2026-10-04").length, 0);
 assert.equal(milestoneReviewCandidates(context, [...group, { ...first, id: "new-match", revision: 1 }], deferred, "2026-10-04").length, 3);
 const linked = changeMilestoneState({ context, history: group, state: emptyMilestoneState(), change: { operation: "link", entryId: "target:gate", achievementId: first.id, confirmedSameRace: true, expectedRevision: 0, sourceVersion: "v" }, today: "2026-10-04", removalId: "r", now: "2026-10-04T10:00:00Z" });
 assert.equal(milestoneReviewCandidates(context, group, linked, "2026-10-04").length, 0);
});
