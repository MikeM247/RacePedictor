import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

function model(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Expected ${name} model`);
  return match[1];
}

test("athlete journal records are separate, scoped and revision fenced", () => {
  const reflection = model("ActivityReflection");
  const wellbeing = model("DailyWellbeingCheckIn");
  assert.match(reflection, /@@unique\(\[athleteId, activityId\]\)/u);
  assert.match(reflection, /answers\s+Json/u);
  assert.match(reflection, /sections\s+Json/u);
  assert.match(wellbeing, /@@unique\(\[athleteId, localDate\]\)/u);
  assert.match(wellbeing, /revision\s+Int/u);
  assert.match(wellbeing, /status\s+String/u);
});
