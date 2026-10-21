import assert from "node:assert/strict";
import test from "node:test";
import { goalContextRouteDataSchema, type RaceMilestone } from "../src/contracts/coaching.ts";
import { milestoneChangeInstructions, milestoneChangeIsCurrent, milestoneChangeRequestSchema, milestoneDurationSeconds, prepareMilestoneChange } from "../src/services/milestone-management.ts";

const milestone = (id: string, date: string): RaceMilestone => ({ id, title: id, targetDate: date, distanceMeters: 10000, targetTimeSeconds: 3600 });
const context = () => goalContextRouteDataSchema.parse({ state: "ready", plan: { id: "plan", version: 3, revision: 2, startsOn: "2026-09-01", endsOn: "2027-06-13", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) }, goal: { id: "goal", athleteId: "athlete-a", revision: 2, title: "Primary race", why: "A meaningful target", target: { kind: "performance", distanceMeters: 42195, targetDate: "2027-06-13", targetTimeSeconds: 18000 } }, milestones: [milestone("first", "2026-11-01"), milestone("second", "2027-03-01")], projection: null });

test("duration parsing preserves supported formats and rejects invalid and unbounded results", () => {
  assert.equal(milestoneDurationSeconds("58:42"), 3522);
  assert.equal(milestoneDurationSeconds("2:10:00"), 7800);
  assert.equal(milestoneDurationSeconds("168:00:00"), 604800);
  for (const value of ["", "1:60", "1:00:60", "0:00", "-1:30", "1.5:30", "169:00:00", "00:1", "10"]) assert.equal(milestoneDurationSeconds(value), undefined, value);
});

test("add edit and remove retain the primary goal and every unaffected milestone without mutating the source", () => {
  const base = context(); const original = JSON.stringify(base);
  const add = prepareMilestoneChange(base, { operation: "add", milestone: milestone("third", "2027-04-01") });
  assert.deepEqual(add.milestones.map((item) => item.id), ["first", "second", "third"]);
  assert.deepEqual(add.baseGoal, base.goal); assert.deepEqual(add.basePlan, base.plan);
  const edit = prepareMilestoneChange(base, { operation: "edit", milestone: { ...base.milestones![0], targetTimeSeconds: 3500 } });
  assert.equal(edit.milestones[0].id, "first"); assert.equal(edit.milestones[0].targetTimeSeconds, 3500); assert.deepEqual(edit.milestones[1], base.milestones![1]);
  const remove = prepareMilestoneChange(base, { operation: "remove", milestoneId: "first" });
  assert.deepEqual(remove.milestones, [base.milestones![1]]); assert.equal(JSON.stringify(base), original);
});

test("planned changes require a verified performance goal and reject missing identities and primary-goal deletion", () => {
  assert.throws(() => prepareMilestoneChange(null, { operation: "remove", milestoneId: "first" }));
  for (const id of ["missing", "goal"]) assert.throws(() => prepareMilestoneChange(context(), { operation: "remove", milestoneId: id }));
  assert.throws(() => prepareMilestoneChange({ ...context(), state: "projection_pending" }, { operation: "add", milestone: milestone("new", "2027-04-01") }));
  assert.throws(() => prepareMilestoneChange(context(), { operation: "edit", milestone: milestone("missing", "2027-04-01") }));
});

test("target dates, counts, IDs and time values follow the existing approved milestone contract", () => {
  for (const value of [milestone("first", "2027-04-01"), milestone("new", "2026-11-01"), milestone("new", "2027-06-14"), milestone("goal", "2027-04-01"), { ...milestone("new", "2027-04-01"), targetTimeSeconds: 0 }]) assert.throws(() => prepareMilestoneChange(context(), { operation: "add", milestone: value }));
  const full = context(); full.milestones = Array.from({ length: 12 }, (_, index) => milestone(`m${index}`, `2027-05-${String(index + 1).padStart(2, "0")}`));
  assert.throws(() => prepareMilestoneChange(full, { operation: "add", milestone: milestone("extra", "2027-06-01") }));
});

test("stored requests cannot claim one operation while changing other milestones", () => {
  const request = prepareMilestoneChange(context(), { operation: "remove", milestoneId: "first" });
  assert.equal(milestoneChangeRequestSchema.safeParse({ ...request, milestones: [{ ...request.milestones[0], title: "also edited" }] }).success, false);
  assert.equal(milestoneChangeRequestSchema.safeParse({ ...request, athleteId: "other" }).success, false);
  assert.equal(milestoneChangeRequestSchema.safeParse({ ...request, operation: "add" }).success, false);
});

test("handoff checks every material base identity and rejects other athletes or stale plan/goal/milestone data", () => {
  const base = context(); const request = prepareMilestoneChange(base, { operation: "remove", milestoneId: "first" });
  assert.equal(milestoneChangeIsCurrent(request, base), true);
  const changed = [
    { ...base, plan: { ...base.plan!, version: 4 } }, { ...base, plan: { ...base.plan!, revision: 3 } },
    { ...base, plan: { ...base.plan!, id: "replacement" } }, { ...base, plan: { ...base.plan!, approvalContentHash: "b".repeat(64) } },
    { ...base, goal: { ...base.goal!, athleteId: "other" } }, { ...base, goal: { ...base.goal!, revision: 3 } },
    { ...base, milestones: [] }, { ...base, milestones: [{ ...base.milestones![0], title: "corrected" }, base.milestones![1]] },
  ];
  for (const value of changed) assert.equal(milestoneChangeIsCurrent(request, value), false);
  assert.equal(milestoneChangeIsCurrent(request, null), false);
});

test("portable instructions include the complete proposed list, source identity and explicit full-proposal approval boundary", () => {
  const request = prepareMilestoneChange(context(), { operation: "remove", milestoneId: "first" });
  const text = milestoneChangeInstructions(request);
  assert.match(text, /coaching-plan-proposal.v2/); assert.match(text, /complete intermediate-milestone list/);
  assert.match(text, /Preserve the approved primary goal/); assert.match(text, /Do not approve or publish automatically/);
  assert.match(text, /"id": "second"/); assert.doesNotMatch(text, /"id": "first"/);
});
