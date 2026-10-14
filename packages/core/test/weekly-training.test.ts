import assert from "node:assert/strict";
import test from "node:test";
import { aggregateWeeklyTraining, trainingWindow, type TrainingActivity } from "../src/services/weekly-training.ts";
import { weeklyTrainingReadSchema } from "../src/contracts/weekly-training.ts";

const generatedAt = "2026-10-13T12:00:00.000Z";
const run = (overrides: Partial<TrainingActivity> = {}): TrainingActivity => ({ athleteId: "a", occurredAt: "2026-10-12T06:00:00Z", sport: "run", distanceM: 1000, elapsedTimeS: 400, avgPaceSecPerKm: 360, elevationGainM: 10, ...overrides });
const aggregate = (activities: TrainingActivity[]) => aggregateWeeklyTraining({ athleteId: "a", generatedAt, activities });

test("twelve calendar weeks preserve zeros and weight pace by distance", () => {
  const result = aggregate([run(), run({ distanceM: 3000, elapsedTimeS: 1500, avgPaceSecPerKm: 480, elevationGainM: 30 })]);
  assert.equal(result.windowStart, "2026-07-27");
  assert.equal(result.weeks.length, 12);
  assert.deepEqual(result.weeks[11], { weekStart: "2026-10-12", weekEndExclusive: "2026-10-19", isCurrentWeek: true, runCount: 2, distanceM: 4000, elapsedTimeS: 1900, avgPaceSecPerKm: 450, elevationGainM: 40, coverage: "recorded" });
  assert.equal(result.weeks[0].coverage, "no_recorded_runs");
  assert.equal(result.weeks[0].distanceM, 0);
  assert.equal(result.weeks[0].avgPaceSecPerKm, null);
});

test("missing metrics remain null and zero-distance runs do not weight pace", () => {
  const last = aggregate([run(), run({ distanceM: 0, avgPaceSecPerKm: null, elevationGainM: null })]).weeks[11];
  assert.equal(last.avgPaceSecPerKm, 360);
  assert.equal(last.elapsedTimeS, 800);
  assert.equal(last.elevationGainM, null);
  assert.equal(aggregate([run({ avgPaceSecPerKm: null })]).weeks[11].avgPaceSecPerKm, null);
  assert.equal(aggregate([run({ distanceM: -1 })]).weeks[11].distanceM, null);
});

test("filters foreign, deleted, non-running, out-of-window and future records", () => {
  const result = aggregate([run(), run({ athleteId: "b" }), run({ deletedAt: "2026-10-13" }), run({ sport: "ride" }), run({ occurredAt: "2026-07-20T06:00:00Z" }), run({ occurredAt: "2026-10-14T06:00:00Z" })]);
  assert.equal(result.weeks[11].runCount, 1);
  assert.equal(aggregate([]).status, "empty");
});

test("local Monday boundaries handle UTC Sunday and daylight saving", () => {
  assert.equal(aggregate([run({ occurredAt: "2026-10-11T22:30:00Z" })]).weeks[11].runCount, 1);
  const result = aggregateWeeklyTraining({ athleteId: "a", generatedAt: "2026-11-03T12:00:00.000Z", timezone: "America/New_York", activities: [run({ occurredAt: "2026-11-02T04:30:00Z" }), run({ occurredAt: "2026-11-02T05:30:00Z" })] });
  assert.equal(result.weeks[10].runCount, 1);
  assert.equal(result.weeks[11].runCount, 1);
  assert.equal(trainingWindow("2026-03-09T03:30:00.000Z", "America/New_York").windowEnd, "2026-03-09");
});

test("contract rejects duplicated weeks, invalid dates and negative totals", () => {
  const result = aggregate([run()]);
  assert.equal(weeklyTrainingReadSchema.safeParse({ ...result, weeks: [...result.weeks.slice(0, 11), result.weeks[0]] }).success, false);
  assert.equal(weeklyTrainingReadSchema.safeParse({ ...result, windowStart: "2026-02-30" }).success, false);
  assert.equal(weeklyTrainingReadSchema.safeParse({ ...result, weeks: result.weeks.map(week => ({ ...week, distanceM: -1 })) }).success, false);
});
