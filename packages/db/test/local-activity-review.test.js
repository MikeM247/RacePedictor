import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { importGarminCsv } from "../src/local-garmin-pipeline.js";
import {
  getLocalActivityReview,
  queueLocalActivityReview,
} from "../src/local-activity-review.js";
import { runLocalActivityReview } from "../src/local-activity-review-worker.js";
import { runCloudActivityReviewBatch } from "../src/local-activity-review-cloud-worker.js";
import { listLocalActivities } from "../src/local-activities.js";

const header = "Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Aerobic TE,Avg Run Cadence,Max Run Cadence,Avg Pace,Best Pace,Total Ascent,Total Descent,Moving Time,Elapsed Time,Avg Power,Steps";
const row = "Running,2026-09-08 06:00:00,false,Morning Run,8.20,500,00:48:10,145,170,3.2,160,175,5:52,4:30,70,65,00:48:00,00:48:10,250,9000";

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-review-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const sourcePath = path.join(directory, "Activities.csv");
  await writeFile(sourcePath, `${header}\n${row}\n`, "utf8");
  await importGarminCsv({ sourcePath, vaultPath: path.join(directory, "vault"), databasePath });
  return { databasePath, activityId: listLocalActivities({ databasePath }).items[0].id };
}

test("queues a local activity review and reports missing AI configuration safely", async () => {
  const { databasePath, activityId } = await fixture();
  const queued = queueLocalActivityReview({ databasePath, activityId });
  assert.equal(queued.status, "queued");
  const result = await runLocalActivityReview({ databasePath, apiKey: undefined });
  assert.equal(result.status, "attention");
  assert.equal(getLocalActivityReview({ databasePath, activityId }).status, "attention");
});

test("persists a validated generated review from a mocked OpenAI response", async () => {
  const { databasePath, activityId } = await fixture();
  queueLocalActivityReview({ databasePath, activityId });
  const result = await runLocalActivityReview({
    databasePath,
    apiKey: "sk-test-12345678901234567890",
    model: "test-model",
    fetchImpl: async () => new Response(JSON.stringify({ output_text: JSON.stringify({
      headline: "A controlled aerobic run",
      assessment: "The run was close to the planned duration and provides useful aerobic work.",
      nextStep: "Keep the next easy run conversational and stop at the planned duration.",
      evidence: [{ source: "activity", label: "Distance and elapsed time" }],
      limitations: [],
    }) }), { status: 200 }),
  });
  assert.equal(result.status, "ready");
  const stored = getLocalActivityReview({ databasePath, activityId });
  assert.equal(stored.status, "ready");
  assert.equal(stored.review.headline, "A controlled aerobic run");
});

test("claims and publishes a cloud review from the local scheduled job", async () => {
  const { databasePath, activityId } = await fixture();
  let published;
  const result = await runCloudActivityReviewBatch({
    databasePath,
    token: "rpd1.device_test.token",
    apiKey: "sk-test-12345678901234567890",
    client: {
      async claimActivityReviews() {
        return { data: { items: [{ requestId: "request-a", activityId, leaseToken: "lease-a", status: "processing" }] } };
      },
      async publishActivityReview(_token, artifact) {
        published = artifact;
      },
    },
    fetchImpl: async () => new Response(JSON.stringify({ output_text: JSON.stringify({
      headline: "A useful aerobic session",
      assessment: "The recorded run provides a clear aerobic stimulus.",
      nextStep: "Keep the next easy run relaxed.",
      evidence: [{ source: "activity", label: "Distance and elapsed time" }],
      limitations: [],
    }) }), { status: 200 }),
  });
  assert.equal(result.status, "processed", JSON.stringify(result));
  assert.equal(result.processed, 1);
  assert.equal(published.requestId, "request-a");
  assert.equal(published.leaseToken, "lease-a");
  assert.equal(published.activityId, activityId);
});
