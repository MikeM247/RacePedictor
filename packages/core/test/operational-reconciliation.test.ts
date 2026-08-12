import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPERATIONAL_CEILINGS,
  evaluateOperationalGuardrails,
  summarizeStravaBatch,
  type OperationalUsage,
} from "../src/services/operational-guardrails.ts";
import { ScheduledReconciliationService } from "../src/use-cases/scheduled-reconciliation.ts";

const ZERO: OperationalUsage = {
  rawStorageBytes: 0, databaseBytes: 0, invocationsDaily: 0, bandwidthBytesDaily: 0,
  providerRequests15Minutes: 0, providerRequestsDaily: 0,
};

test("operational guardrails warn at 70%, stop at 85%, and preserve accepted data guidance", () => {
  const warning = evaluateOperationalGuardrails({
    ...ZERO, rawStorageBytes: Math.ceil(DEFAULT_OPERATIONAL_CEILINGS.rawStorageBytes * 0.7),
  });
  assert.equal(warning.state, "warning");
  assert.equal(warning.processingAllowed, true);
  const stopped = evaluateOperationalGuardrails({
    ...ZERO, providerRequests15Minutes: Math.ceil(DEFAULT_OPERATIONAL_CEILINGS.providerRequests15Minutes * 0.85),
  });
  assert.equal(stopped.state, "hard_stop");
  assert.equal(stopped.processingAllowed, false);
  assert.match(stopped.signals.find((signal) => signal.state === "hard_stop")?.ownerAction ?? "", /paused.*do not discard/u);
  assert.match(stopped.disclaimer, /revalidated/u);
});

test("scheduled reconciliation enqueues one stable 48-hour window and drains bounded retry/stale work", async () => {
  const scopes: string[] = [];
  const requests: Array<{ after: string; before: string }> = [];
  const outcomes = [
    { state: "completed" as const, jobId: "job-1", diagnosticCode: null },
    { state: "retry" as const, jobId: "job-2", diagnosticCode: "RATE_LIMITED" },
    { state: "not_available" as const },
  ];
  const service = new ScheduledReconciliationService({
    now: () => new Date("2026-08-10T12:34:56.000Z"),
    readUsage: async () => ZERO,
    listConnectedAthleteIds: async (limit) => { assert.equal(limit, 25); return ["athlete-a", "athlete-b"]; },
    processor: {
      enqueueReconciliation: async (scope, request) => {
        scopes.push(scope.athleteId);
        requests.push(request);
        return { jobId: `job-${scope.athleteId}`, reused: scope.athleteId === "athlete-b" };
      },
      processNext: async () => outcomes.shift() ?? { state: "not_available" as const },
    },
  });
  const result = await service.run({ workerId: "cron:synthetic" });
  assert.deepEqual(scopes, ["athlete-a", "athlete-b"]);
  assert.deepEqual(new Set(requests.map((request) => request.after)), new Set(["2026-08-08T12:00:00.000Z"]));
  assert.deepEqual(new Set(requests.map((request) => request.before)), new Set(["2026-08-10T12:00:00.000Z"]));
  assert.deepEqual({ enqueued: result.enqueued, reused: result.reused, processed: result.processed, outcomes: result.outcomes }, {
    enqueued: 1, reused: 1, processed: 2, outcomes: { completed: 1, retry: 1 },
  });
});

test("hard-stop guardrail schedules and processes no work", async () => {
  let calls = 0;
  const service = new ScheduledReconciliationService({
    now: () => new Date("2026-08-10T12:00:00.000Z"),
    readUsage: async () => ({ ...ZERO, invocationsDaily: DEFAULT_OPERATIONAL_CEILINGS.invocationsDaily }),
    listConnectedAthleteIds: async () => { calls += 1; return []; },
    processor: {
      enqueueReconciliation: async () => { calls += 1; return { jobId: "never", reused: false }; },
      processNext: async () => { calls += 1; return { state: "not_available" }; },
    },
  });
  const result = await service.run({ workerId: "cron:paused" });
  assert.equal(result.state, "paused");
  assert.equal(calls, 0);
});

test("scheduled reconciliation yields after one deferred provider-window job", async () => {
  let processedCalls = 0;
  const service = new ScheduledReconciliationService({
    now: () => new Date("2026-08-10T12:00:00.000Z"),
    readUsage: async () => ZERO,
    listConnectedAthleteIds: async () => [],
    processor: {
      enqueueReconciliation: async () => ({ jobId: "never", reused: false }),
      processNext: async () => {
        processedCalls += 1;
        return {
          state: "deferred" as const,
          jobId: "job-rate-window",
          diagnosticCode: "STRAVA_RATE_WINDOW_DEFERRED",
        };
      },
    },
  });

  const result = await service.run({ workerId: "cron:deferred", maxJobs: 5 });
  assert.equal(processedCalls, 1);
  assert.deepEqual({ processed: result.processed, outcomes: result.outcomes }, {
    processed: 1,
    outcomes: { deferred: 1 },
  });
});

test("bounded backfill summary accounts for every outcome class", () => {
  const summary = summarizeStravaBatch({
    activitiesDiscovered: 7,
    outcomes: [
      { state: "applied" }, { state: "applied" }, { state: "duplicate" },
      { state: "attention" }, { state: "terminal" }, { state: "retry" }, { state: "deleted" },
    ],
    failure: null,
  });
  assert.deepEqual(summary, {
    requested: 7, fetched: 7, retained: 3, normalized: 2,
    duplicate: 1, ambiguous: 1, rejected: 1, failed: 1,
  });
});
