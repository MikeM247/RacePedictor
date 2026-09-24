import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { CLOUD_SYNC_END, CLOUD_SYNC_START, renderCloudSyncSummary, updateCloudSyncNote } from "../src/local-sync-note.js";

test("cloud sync note replaces one owned block and preserves surrounding user content byte-for-byte", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-cloud-note-"));
  const notePath = path.join(directory, "RacePredictor Cloud Sync.md");
  const prefix = "# My dashboard\r\n\r\nPrivate introduction.\r\n";
  const suffix = "\r\n## My notes\r\n\r\nKeep this exactly.\r\n";
  await writeFile(notePath, `${prefix}${CLOUD_SYNC_START}\nold\n${CLOUD_SYNC_END}${suffix}`, "utf8");

  await updateCloudSyncNote(notePath, "new cloud projection");

  const next = await readFile(notePath, "utf8");
  assert.equal(next.slice(0, prefix.length), prefix);
  assert.equal(next.slice(next.length - suffix.length), suffix);
  assert.match(next, /new cloud projection/u);
  assert.equal((next.match(new RegExp(CLOUD_SYNC_START, "g")) ?? []).length, 1);
  assert.equal((next.match(new RegExp(CLOUD_SYNC_END, "g")) ?? []).length, 1);
});

test("cloud sync note fails closed for malformed or duplicate generated markers", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-cloud-note-"));
  const notePath = path.join(directory, "RacePredictor Cloud Sync.md");
  const original = `My note\n${CLOUD_SYNC_START}\nowned\n${CLOUD_SYNC_START}\n`;
  await writeFile(notePath, original, "utf8");

  await assert.rejects(() => updateCloudSyncNote(notePath, "replacement"), /markers are malformed/u);
  assert.equal(await readFile(notePath, "utf8"), original);
});

test("cloud sync rendering labels cloud-owned material and cannot forge generated markers", () => {
  const rendered = renderCloudSyncSummary({
    cursor: "9",
    entities: {
      activePlan: {
        id: "plan-a", revision: 2, startsOn: "2026-08-10", endsOn: "2026-08-16",
        approval: { summary: "Approved <!-- racepredictor:cloud-sync:end --> plan" },
      },
      calendarSessions: [{ id: "session-a", effectiveDate: "2026-08-11", startTime: "06:30", title: "Easy\nrun", status: "upcoming" }],
      activities: [{ id: "activity-a", occurredAt: "2026-08-10T06:00:00.000Z", title: "Cloud run", sport: "run", distanceM: 5000 }],
    },
  });

  assert.match(rendered, /Cloud-owned plans, calendar sessions, and activities are read-only/u);
  assert.match(rendered, /Easy run \(upcoming\)/u);
  assert.match(rendered, /Approved &lt;!-- racepredictor:cloud-sync:end --> plan/u);
  assert.equal((rendered.match(new RegExp(CLOUD_SYNC_END, "g")) ?? []).length, 0);
});
