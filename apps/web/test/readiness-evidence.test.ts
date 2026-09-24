import assert from "node:assert/strict";
import test from "node:test";
import { groupTrendSeries, selectOutlookReason } from "../lib/readiness-evidence.ts";

const driver = (key: string, contributionPct: number, direction: "positive" | "negative" | "neutral" = contributionPct > 0 ? "positive" : contributionPct < 0 ? "negative" : "neutral") => ({ key, label: `${key} label`, contributionPct, direction, confidence: 0.5 });
const trend = (overrides: Partial<{ weekStart: string; featureKey: string; featureLabel: string; value: number; unit: string }> = {}) => ({ weekStart: "2026-08-03", featureKey: "distance", featureLabel: "Weekly distance", value: 0, unit: "km", ...overrides });

test("selects a supplied driver by absolute signed contribution and stable key, not array order", () => {
  const reason = selectOutlookReason([driver("zeta", 20), driver("alpha", -20), driver("small", 3)], []);
  assert.match(reason.text, /alpha label/);
  assert.match(reason.text, /-20%/);
  assert.match(reason.text, /zeta label \(\+20%\)/);
  assert.match(reason.text, /do not explain or predict a finish time/);
});

test("keeps conflicting and neutral driver metadata bounded", () => {
  assert.match(selectOutlookReason([driver("conflict", 8, "negative")], []).text, /direction metadata is inconsistent/);
  assert.match(selectOutlookReason([driver("zero", 0)], []).text, /Only neutral supplied training signals/);
  assert.match(selectOutlookReason([], []).text, /no supplied explanatory evidence/);
});

test("uses observed trend facts only when drivers are absent", () => {
  const reason = selectOutlookReason([], [trend({ value: -4 }), trend({ weekStart: "2026-08-17", value: 0 })]);
  assert.match(reason.text, /Weekly distance/);
  assert.match(reason.text, /latest supplied value is 0 km/);
  assert.match(reason.text, /effect .* unavailable/);
});

test("groups trends by supplied label, key and unit while preserving gaps, zeroes and negatives", () => {
  const series = groupTrendSeries([
    trend({ weekStart: "2026-08-17", value: 0 }),
    trend({ weekStart: "2026-08-03", value: -2 }),
    trend({ featureKey: "effort", featureLabel: "Weekly effort", unit: "points", value: 4 }),
    trend({ featureLabel: "Distance (legacy label)", value: 9 }),
  ]);
  assert.equal(series.length, 3);
  const distance = series.find((item) => item.featureLabel === "Weekly distance")!;
  assert.deepEqual(distance.points.map((point) => [point.weekStart, point.value]), [["2026-08-03", -2], ["2026-08-17", 0]]);
  assert.match(distance.periodLabel, /2 supplied weekly observations/);
  assert.match(distance.periodLabel, /2026-08-03 to 2026-08-17/);
  assert.match(groupTrendSeries([trend({ value: 5 })])[0]!.periodLabel, /1 supplied weekly observation/);
});
