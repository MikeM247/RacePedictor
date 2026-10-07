import assert from "node:assert/strict";
import test from "node:test";
import {
  activityReflectionSchema,
  saveDailyWellbeingRequestSchema,
  wellbeingRangeQuerySchema,
} from "../src/contracts/athlete-journal.ts";

test("activity reflection permits an unclassified combined questionnaire", () => {
  const parsed = activityReflectionSchema.parse({
    id: "reflection_1", athleteId: "athlete_1", activityId: "activity_1", revision: 1,
    activityRevision: 2, type: null, answers: { overallRpe: 7, race: { targetTime: "03:30:00" } }, sections: [],
    questionnaireVersion: "activity-reflection.v1", createdAt: "2026-10-06T06:00:00.000Z", updatedAt: "2026-10-06T06:00:00.000Z",
  });
  assert.equal(parsed.type, null);
  assert.equal(parsed.answers.race?.targetTime, "03:30:00");
});

test("daily wellbeing saves require at least one answer but skips can be empty", () => {
  assert.throws(() => saveDailyWellbeingRequestSchema.parse({ expectedRevision: 0, timezone: "Africa/Johannesburg", status: "saved", answers: {} }));
  const skipped = saveDailyWellbeingRequestSchema.parse({ expectedRevision: 0, timezone: "Africa/Johannesburg", status: "skipped", answers: {} });
  assert.equal(skipped.status, "skipped");
});

test("wellbeing ranges are bounded to 31 local dates", () => {
  assert.doesNotThrow(() => wellbeingRangeQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" }));
  assert.throws(() => wellbeingRangeQuerySchema.parse({ from: "2026-10-01", to: "2026-11-01" }));
});
