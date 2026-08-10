import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runLocalAnalytics } from "../src/local-analytics.js";
import { importGarminCsv } from "../src/local-garmin-pipeline.js";
import { publishObsidianArtifacts } from "../src/obsidian-publisher.js";

const header = "Activity Type,Date,Favorite,Title,Distance,Time,Avg HR,Max HR,Aerobic TE,Avg Run Cadence,Max Run Cadence,Avg Pace,Best Pace,Total Ascent,Total Descent,Moving Time,Elapsed Time";
const activity = (date, distance, elapsed, pace) =>
  `Running,${date},false,Test Run,${distance},${elapsed},145,170,3.0,160,175,${pace},4:30,80,75,${elapsed},${elapsed}`;

test("updates generated review data while preserving personal context", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-obsidian-"));
  const sourcePath = path.join(directory, "Activities.csv");
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const snapshotPath = path.join(directory, "state", "dashboard-overview.json");
  const vaultPath = path.join(directory, "vault");
  await writeFile(sourcePath, [
    header,
    activity("2026-07-20 06:00:00", "10.00", "00:55:00", "5:30"),
    activity("2026-07-27 06:00:00", "18.00", "01:33:00", "5:10"),
  ].join("\n"), "utf8");
  await importGarminCsv({ sourcePath, vaultPath, databasePath });
  await runLocalAnalytics({ databasePath, snapshotPath });

  const first = await publishObsidianArtifacts({ databasePath, vaultPath, reviewWeeks: 2 });
  assert.equal(first.reviewCount, 2);
  assert.equal(first.context.created, true);
  assert.equal(first.activityTemplate.created, true);
  const latestReviewPath = first.reviews[1].filePath;
  const withPersonalContext = `${await readFile(latestReviewPath, "utf8")}\nFelt strong on the long run.\n`;
  await writeFile(latestReviewPath, withPersonalContext, "utf8");

  const second = await publishObsidianArtifacts({ databasePath, vaultPath, reviewWeeks: 2 });
  assert.equal(second.context.created, false);
  assert.equal(second.activityTemplate.created, false);
  const refreshed = await readFile(latestReviewPath, "utf8");
  assert.match(refreshed, /Felt strong on the long run\./);
  assert.equal((refreshed.match(/racepredictor:generated:start/g) ?? []).length, 1);
  assert.match(await readFile(second.dashboard.filePath, "utf8"), /Current half-marathon training estimate/);
});
