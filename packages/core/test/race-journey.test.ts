import assert from "node:assert/strict";
import test from "node:test";
import { raceHistorySchema, type RaceHistoryRecord } from "../src/contracts/race-history.ts";
import { buildRaceJourney, resultAchievesTarget, type JourneyTarget } from "../src/services/race-journey.ts";
import type { GoalContextRouteData } from "../src/contracts/coaching.ts";

const target: JourneyTarget = { id: "oldies", title: "Oldies 10 km sub-60", date: "2026-10-17", distanceMeters: 10_000, targetTimeSeconds: 3600, mainGoal: false };
const result: RaceHistoryRecord = { id: "result", title: "Oldies result", confirmedBy: "user", targetId: "oldies", raceDate: target.date, distanceMeters: 10_000, elapsedTimeSeconds: 3599 };
const context = { state: "ready", plan: { id: "p", timezone: "Africa/Johannesburg" }, goal: { id: "comrades", title: "Comrades sub-11", target: { kind: "performance", distanceMeters: 89_000, targetTimeSeconds: 39600, targetDate: "2027-06-13", eventName: "Comrades 2027" } }, milestones: [{ id: target.id, title: target.title, targetDate: target.date, distanceMeters: target.distanceMeters, targetTimeSeconds: target.targetTimeSeconds }], projection: null } as GoalContextRouteData;

test("a linked result earns its own target; a past 10 km achievement never completes a new race", () => {
  const history: RaceHistoryRecord[] = [{ id: "previous10", title: "10 km goal", confirmedBy: "user", achievement: "goal_achieved" }];
  assert.equal(buildRaceJourney(context, history, "2026-10-17").ahead.length, 2);
  const journey = buildRaceJourney(context, [...history, result], "2026-10-17");
  assert.deepEqual(journey.ahead.map((race) => race.id), ["comrades"]);
  assert.equal(journey.achieved[1].matchedTarget?.id, "oldies");
  assert.equal(journey.nextId, "comrades");
});

test("strict sub targets reject equality; numeric targets accept equality", () => {
  assert.equal(resultAchievesTarget({ ...result, elapsedTimeSeconds: 3600 }, target, "2026-10-17"), false);
  assert.equal(resultAchievesTarget({ ...result, elapsedTimeSeconds: 3600 }, { ...target, title: "Oldies target" }, "2026-10-17"), true);
  assert.equal(resultAchievesTarget(result, target, "2026-10-16"), false);
});

test("wrong race, wrong official distance, missing time, future date and slower results cannot earn the target", () => {
  for (const patch of [{ targetId: "different" }, { raceDate: "2026-10-16" }, { distanceMeters: 9900 }, { elapsedTimeSeconds: undefined }, { elapsedTimeSeconds: 3601 }]) {
    assert.equal(resultAchievesTarget({ ...result, ...patch }, target, "2026-10-17"), false);
  }
  assert.equal(buildRaceJourney(context, [], "2026-10-18").ahead[0].id, "oldies");
});

test("correcting history or a plan re-evaluates achievement state without mutating either input", () => {
  const before = JSON.stringify(context);
  assert.equal(buildRaceJourney(context, [result], "2026-10-17").ahead.length, 1);
  assert.equal(buildRaceJourney(context, [{ ...result, elapsedTimeSeconds: 3650 }], "2026-10-17").ahead.length, 2);
  const revised = { ...context, milestones: context.milestones!.map((race) => ({ ...race, targetTimeSeconds: 3500 })) };
  assert.equal(buildRaceJourney(revised, [result], "2026-10-17").ahead.length, 2);
  assert.equal(JSON.stringify(context), before);
});

test("PBs require explicit owner confirmation; undated achievements retain no invented date or time", () => {
  const history = raceHistorySchema.parse([{ id: "pb", title: "Comrades PB", confirmedBy: "user", achievement: "personal_best" }]);
  const journey = buildRaceJourney(null, history, "2026-10-17");
  assert.equal(journey.achieved[0].raceDate, undefined);
  assert.equal(journey.achieved[0].elapsedTimeSeconds, undefined);
  assert.throws(() => raceHistorySchema.parse([{ id: "pb", title: "Comrades PB" }]));
  assert.throws(() => raceHistorySchema.parse([history[0], history[0]]));
  assert.throws(() => raceHistorySchema.parse([{ ...history[0], raceDate: "2026-02-30" }]));
});

test("deduplicating a main race preserves its approved milestone's result link", () => {
  const goal = { ...context.goal!, id: "main-oldies", title: target.title, target: { kind: "performance" as const, distanceMeters: 10000, targetDate: target.date, targetTimeSeconds: 3600 } };
  const journey = buildRaceJourney({ ...context, goal }, [result], target.date);
  assert.equal(journey.ahead.length, 0);
  assert.equal(journey.achieved[0].matchedTarget?.id, "main-oldies");
});

test("a slower linked goal result is not an achievement even if its category was labelled achieved", () => {
  const journey = buildRaceJourney(context, [{ ...result, achievement: "goal_achieved", elapsedTimeSeconds: 3700 }], target.date);
  assert.equal(journey.achieved.length, 0);
  assert.equal(journey.ahead.length, 2);
});

test("completed historical targets survive plan replacement and re-evaluate corrected results", () => {
  const savedResult = { ...result, targetSnapshot: { id: target.id, title: target.title, date: target.date, distanceMeters: target.distanceMeters, targetTimeSeconds: target.targetTimeSeconds } };
  const newPlan = { ...context, milestones: [] };
  assert.equal(buildRaceJourney(newPlan, [savedResult], "2026-10-18").achieved.length, 1);
  assert.equal(buildRaceJourney(newPlan, [{ ...savedResult, elapsedTimeSeconds: 3700 }], "2026-10-18").achieved.length, 0);
});
