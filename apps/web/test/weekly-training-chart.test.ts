import assert from "node:assert/strict";
import test from "node:test";
import { axisTickText, distanceCeiling, metricText, overlayScale, trainingChartData } from "../lib/weekly-training-chart-model.ts";
import { weeklyTrainingFixture } from "../lib/mock-data/weekly-training.ts";
import { toDashboardViewModel } from "../lib/dashboard-view-model.ts";

test("chart domains keep distance at zero and handle constants, gaps and single points", () => {
  const weeks = weeklyTrainingFixture.weeks;
  assert.equal(distanceCeiling(weeks), 50);
  assert.equal(distanceCeiling(weeks.map(week => ({ ...week, distanceM: 0 }))), 10);
  assert.ok(distanceCeiling(weeks.map(week => ({ ...week, distanceM: 155000 }))) >= 155);
  const constant = weeks.map((week, index) => ({ ...week, avgPaceSecPerKm: index === 3 ? null : 360 }));
  const scale = overlayScale(constant, "avgPaceSecPerKm")!;
  assert.equal(scale.values[3], null);
  assert.ok(scale.domainMin < 360 && scale.domainMax > 360);
  assert.ok(Number.isFinite(scale.normalize(360)));
  const single = overlayScale(weeks.map((week, index) => ({ ...week, avgPaceSecPerKm: index === 0 ? 400 : null })), "avgPaceSecPerKm")!;
  assert.ok(single.domainMin <= 400 && single.domainMax >= 400);
  assert.equal(overlayScale(weeks.map(week => ({ ...week, avgPaceSecPerKm: null })), "avgPaceSecPerKm"), null);
  assert.equal(metricText("avgPaceSecPerKm", 359.9), "6:00 /km");
});

test("numeric overlay axes bracket observations and format source units", () => {
  for (const key of ["avgPaceSecPerKm", "elapsedTimeS", "elevationGainM"] as const) {
    const scale = overlayScale(weeklyTrainingFixture.weeks, key)!;
    for (const value of scale.values) if (value !== null) assert.ok(scale.normalize(value) >= 0 && scale.normalize(value) <= 1);
    assert.equal(new Set(scale.ticks.map(value => axisTickText(key, value, scale.step))).size, scale.ticks.length);
    assert.equal(scale.normalize(scale.domainMin), 0);
    assert.equal(scale.normalize(scale.domainMax), 1);
  }
  for (const key of ["elapsedTimeS", "elevationGainM"] as const) {
    const zero = overlayScale(weeklyTrainingFixture.weeks.map(week => ({ ...week, [key]: 0 })), key)!;
    assert.equal(zero.domainMin, 0);
    assert.ok(zero.domainMax > 0);
    assert.equal(zero.normalize(0), 0);
  }
  assert.equal(axisTickText("avgPaceSecPerKm", 360, 30), "6:00");
  assert.equal(axisTickText("elapsedTimeS", 90000, 3600), "25:00");
  assert.equal(axisTickText("elapsedTimeS", 5, 1), "0:00:05");
});

test("legacy distance adapts both production keys, preserving gaps and true zeros", () => {
  for (const featureKey of ["weekly_distance_km", "total_distance_km"]) {
    const points = ["2026-09-07", "2026-09-21"].map(weekStart => ({ weekStart, featureKey, featureLabel: "Weekly distance", value: 0, unit: "km" }));
    const result = trainingChartData(undefined, points);
    assert.deepEqual(result.weeks.map(week => week.distanceM), [0, null, 0]);
    assert.equal(result.legacy, true);
    assert.equal(result.weeks.some(week => week.isCurrentWeek), false);
    assert.equal(trainingChartData(undefined, [...points, points[0]]).consumedDistance, false);
    assert.equal(trainingChartData(undefined, [{ ...points[0], value: -1 }]).weeks.length, 0);
    assert.equal(trainingChartData(undefined, [...points, { ...points[0], featureLabel: "Other label" }]).consumedDistance, false);
  }
});

test("weekly data survives an empty prediction and malformed optional data is isolated", () => {
  const base = { fetchStatus: "empty", stale: { isStale: false } };
  assert.equal(toDashboardViewModel({ ...base, weeklyTraining: weeklyTrainingFixture }).weeklyTraining?.weeks.length, 12);
  const invalid = toDashboardViewModel({ ...base, weeklyTraining: { ...weeklyTrainingFixture, weeks: [] } });
  assert.match(invalid.weeklyTrainingError!, /validated/);
  assert.equal(invalid.uiState.showEmptyState, true);
  assert.equal(trainingChartData(undefined, [], invalid.weeklyTrainingError).legacy, false);
});
