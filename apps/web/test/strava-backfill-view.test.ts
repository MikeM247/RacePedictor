import assert from "node:assert/strict";
import test from "node:test";
import { backfillStatusLabel, backfillStatusMessage } from "../lib/strava-backfill-view.ts";

const job = {
  jobId: "job-a",
  status: "queued" as const,
  createdAt: "2026-09-26T10:00:00.000Z",
  updatedAt: "2026-09-26T10:00:00.000Z",
  availableAt: "2026-09-26T10:15:00.000Z",
  completedAt: null,
  attemptCount: 1,
};

test("Strava import labels distinguish queued, retry, completion, and failure", () => {
  const now = Date.parse("2026-09-26T10:05:00.000Z");
  assert.equal(backfillStatusLabel(job, now), "Waiting to retry");
  assert.equal(backfillStatusLabel(job, Date.parse("2026-09-26T10:20:00.000Z")), "Queued");
  assert.match(backfillStatusMessage({ ...job, status: "completed", completedAt: job.availableAt }, now), /Processing finished/u);
  assert.equal(backfillStatusLabel({ ...job, status: "dead_letter" }, now), "Needs attention");
  assert.match(backfillStatusMessage({ ...job, status: "failed" }, now), /stopped before it finished/u);
});
