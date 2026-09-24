import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readSelectedSecondBrainSource,
  SELECTED_SECOND_BRAIN_CONTEXT_RELATIVE_PATH,
} from "../src/obsidian-selected-context.js";

test("reads only the fixed selected-context document and returns structured allow-listed fields", async () => {
  const vaultPath = await mkdtemp(path.join(tmpdir(), "racepredictor-selected-context-"));
  const sourcePath = path.join(vaultPath, SELECTED_SECOND_BRAIN_CONTEXT_RELATIVE_PATH);
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(path.join(vaultPath, "private-note.md"), "Do not read this prose note.", "utf8");
  await writeFile(sourcePath, JSON.stringify({
    selectedFields: ["availability", "wellbeingCheckIns"],
    context: {
      availability: { weeklyMinutesBudget: 300 },
      wellbeingCheckIns: [{ recordedOn: "2026-08-28", energy: 4, fatigue: 2, soreness: 1, sleepQuality: 4, stress: 2 }],
    },
    logicalSourceRefs: ["running-context", "morning-check-in"],
  }), "utf8");

  const result = await readSelectedSecondBrainSource({ vaultPath });
  assert.deepEqual(result, {
    selectedFields: ["availability", "wellbeingCheckIns"],
    sourceContext: {
      availability: { weeklyMinutesBudget: 300 },
      wellbeingCheckIns: [{ recordedOn: "2026-08-28", energy: 4, fatigue: 2, soreness: 1, sleepQuality: 4, stress: 2 }],
    },
    logicalSourceRefs: ["running-context", "morning-check-in"],
  });
});

test("rejects malformed, unselected, and path-bearing local source content before publication", async () => {
  const vaultPath = await mkdtemp(path.join(tmpdir(), "racepredictor-selected-context-"));
  const sourcePath = path.join(vaultPath, SELECTED_SECOND_BRAIN_CONTEXT_RELATIVE_PATH);
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await assert.rejects(readSelectedSecondBrainSource({ vaultPath }), /source is missing/u);
  await writeFile(sourcePath, "not json", "utf8");
  await assert.rejects(readSelectedSecondBrainSource({ vaultPath }), /valid JSON/u);
  await writeFile(sourcePath, JSON.stringify({
    selectedFields: ["availability"],
    context: { availability: { weeklyMinutesBudget: 300, vaultPath: "C:/private" } },
  }), "utf8");
  await assert.rejects(readSelectedSecondBrainSource({ vaultPath }));
  await writeFile(sourcePath, JSON.stringify({
    selectedFields: ["availability"],
    context: { availability: { weeklyMinutesBudget: 300 } },
    logicalSourceRefs: ["Vault/Private.md"],
  }), "utf8");
  await assert.rejects(readSelectedSecondBrainSource({ vaultPath }), /without a path/u);
});
