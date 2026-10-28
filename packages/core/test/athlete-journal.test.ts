import assert from "node:assert/strict";
import test from "node:test";
import {
  activityReflectionSchema,
  savePostRunReflectionRequestSchema,
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

test("post-run v2 reflection requires explicit RPE and discomfort answers and preserves older journal fields", () => {
  const input = {
    requestId: "4e56bfee-7c75-4d5f-90df-1b79e56c1e9f",
    expectedRevision: 1,
    expectedActivityRevision: 2,
    type: "training",
    answers: {
      overallRpe: 6,
      overallFeeling: "good",
      expectation: "as_expected",
      pain: { present: "no" },
      postRun: { rpeAnswer: "rated", discomfort: "none", energy: "okay", note: "Steady effort" },
    },
    sections: [{ id: "turn_1", kind: "turning_point", location: "km 8", notes: "Wind picked up" }],
  } as const;
  const parsed = savePostRunReflectionRequestSchema.parse(input);
  assert.equal(parsed.answers.expectation, "as_expected");
  assert.equal(parsed.answers.pain?.present, "no");
  assert.equal(parsed.sections[0]?.location, "km 8");
  assert.throws(() => savePostRunReflectionRequestSchema.parse({ ...input, answers: { ...input.answers, overallRpe: 0 } }));
  assert.throws(() => savePostRunReflectionRequestSchema.parse({ ...input, answers: { ...input.answers, overallRpe: undefined, postRun: { rpeAnswer: "rated", discomfort: "none" } } }));
  const unable = savePostRunReflectionRequestSchema.parse({ ...input, answers: { ...input.answers, overallRpe: undefined, postRun: { ...input.answers.postRun, rpeAnswer: "unable" } } });
  assert.equal(unable.answers.overallRpe, undefined);
  assert.throws(() => savePostRunReflectionRequestSchema.parse({ ...input, answers: { ...input.answers, postRun: { ...input.answers.postRun, rpeAnswer: "unable" } } }));
  assert.throws(() => savePostRunReflectionRequestSchema.parse({ ...input, answers: { ...input.answers, postRun: { ...input.answers.postRun, discomfort: undefined } } }));
  assert.throws(() => savePostRunReflectionRequestSchema.parse({ ...input, answers: { ...input.answers, postRun: { ...input.answers.postRun, note: "x".repeat(1001) } } }));
  assert.throws(() => savePostRunReflectionRequestSchema.parse({ ...input, answers: { ...input.answers, postRun: { rpeAnswer: "unable", discomfort: "none", symptoms: { bodyArea: "calf" } } } }));
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
