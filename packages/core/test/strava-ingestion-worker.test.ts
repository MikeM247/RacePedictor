import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext, type AthleteScope } from "../src/contracts/auth.ts";
import type {
  ClaimedStravaIngestionJob,
  StravaIngestionJobRepository,
  StravaJobClaimRequest,
  StravaJobCompletion,
  StravaJobFailure,
  StravaIngestionJobEvent,
} from "../src/ports/strava-ingestion-worker.ts";
import type { StravaIngestionOutcome } from "../src/services/strava-ingestion-service.ts";
import { StravaIngestionJobProcessor } from "../src/use-cases/strava-ingestion-worker.ts";

const baseTime = "2026-08-10T10:00:00.000Z";

test("activity jobs run through a one-athlete internal actor and complete durably", async () => {
  const harness = createHarness();
  harness.jobs.add(job("job-a", "athlete-a", {
    kind: "activity",
    providerActivityId: "900000000001",
    aspect: "create",
    occurredAt: baseTime,
  }));

  const result = await harness.processor.processJob("job-a", "after-vercel-001");

  assert.deepEqual(result, { state: "completed", jobId: "job-a", diagnosticCode: null });
  assert.equal(harness.ingestionCalls.length, 1);
  assert.deepEqual(harness.ingestionCalls[0].scope.actor.permittedAthleteIds, ["athlete-a"]);
  assert.equal(harness.ingestionCalls[0].scope.actor.activeAthleteId, "athlete-a");
  assert.equal(harness.ingestionCalls[0].scope.actor.credentialKind, "internal");
  assert.deepEqual(harness.ingestionCalls[0].event, {
    providerActivityId: "900000000001",
    aspect: "create",
    source: "webhook",
    occurredAt: baseTime,
    attempt: 1,
  });
  assert.equal(harness.jobs.records.get("job-a")?.status, "completed");
  assert.equal(harness.coachingPlanMutations, 0);
});

test("retry, terminal attention, and exhausted attempts map to distinct durable states", async () => {
  const retryHarness = createHarness();
  retryHarness.jobs.add(job("job-retry", "athlete-a", activityEvent()));
  retryHarness.outcomes.push({
    state: "retry",
    diagnosticCode: "STRAVA_RATE_LIMITED",
    retryAt: "2026-08-10T10:15:05.000Z",
  });
  assert.deepEqual(await retryHarness.processor.processNext("poller-001"), {
    state: "retry",
    jobId: "job-retry",
    diagnosticCode: "STRAVA_RATE_LIMITED",
  });
  assert.equal(retryHarness.jobs.records.get("job-retry")?.status, "queued");
  assert.equal(retryHarness.jobs.records.get("job-retry")?.availableAt, "2026-08-10T10:15:05.000Z");

  const attentionHarness = createHarness();
  attentionHarness.jobs.add(job("job-attention", "athlete-a", activityEvent()));
  attentionHarness.outcomes.push({
    state: "attention",
    diagnosticCode: "AMBIGUOUS_CROSS_SOURCE_MATCH",
    candidateCount: 2,
    rawObjectKeys: ["synthetic-key"],
  });
  assert.equal((await attentionHarness.processor.processNext("poller-002")).state, "terminal");
  assert.equal(attentionHarness.jobs.records.get("job-attention")?.status, "failed");

  const exhaustedHarness = createHarness({ maxAttempts: 2 });
  exhaustedHarness.jobs.add(job("job-exhausted", "athlete-a", activityEvent(), 1));
  exhaustedHarness.outcomes.push({
    state: "retry",
    diagnosticCode: "STRAVA_UNAVAILABLE",
    retryAt: "2026-08-10T10:02:00.000Z",
  });
  assert.equal((await exhaustedHarness.processor.processNext("poller-003")).state, "dead_letter");
  assert.equal(exhaustedHarness.jobs.records.get("job-exhausted")?.status, "dead_letter");
});

test("deauthorization clears only the claimed athlete connection and marks the event complete", async () => {
  const harness = createHarness();
  harness.credentials.set("athlete-a", "encrypted-a");
  harness.credentials.set("athlete-b", "encrypted-b");
  harness.jobs.add(job("job-deauth", "athlete-a", {
    kind: "athlete_deauthorization",
    occurredAt: baseTime,
  }));

  const result = await harness.processor.processNext("poller-deauth");

  assert.equal(result.state, "completed");
  assert.equal(harness.credentials.has("athlete-a"), false);
  assert.equal(harness.credentials.get("athlete-b"), "encrypted-b");
  assert.deepEqual(harness.deauthorizationScopes[0].actor.permittedAthleteIds, ["athlete-a"]);
  assert.equal(harness.ingestionCalls.length, 0);
  assert.equal(harness.jobs.records.get("job-deauth")?.status, "completed");
});

test("unexpected worker failure is scheduled durably and processJob cannot steal another id", async () => {
  const harness = createHarness();
  harness.jobs.add(job("job-first", "athlete-a", activityEvent()));
  harness.jobs.add(job("job-second", "athlete-b", activityEvent("900000000002")));
  harness.throwIngestion = true;

  assert.deepEqual(await harness.processor.processJob("missing", "after-001"), { state: "not_available" });
  const result = await harness.processor.processJob("job-second", "after-002");
  assert.deepEqual(result, {
    state: "retry",
    jobId: "job-second",
    diagnosticCode: "STRAVA_WORKER_UNAVAILABLE",
  });
  assert.equal(harness.jobs.records.get("job-first")?.status, "queued");
  assert.equal(harness.jobs.records.get("job-second")?.availableAt, "2026-08-10T10:01:00.000Z");
});

test("bounded backfill and reconciliation windows enqueue idempotently and use the same athlete fence", async () => {
  const harness = createHarness();
  const scope = athleteScopeFor(buildActorContext({
    userId: "owner-a",
    permittedAthleteIds: ["athlete-a"],
    activeAthleteId: "athlete-a",
    requestId: "request-batch-a",
    credentialKind: "session",
  }));
  const window = {
    after: "2026-08-01T00:00:00.000Z",
    before: "2026-08-10T00:00:00.000Z",
  };

  const first = await harness.processor.enqueueBackfill(scope, window);
  const duplicate = await harness.processor.enqueueBackfill(scope, window);
  assert.equal(first.reused, false);
  assert.deepEqual(duplicate, { ...first, reused: true });
  assert.equal(harness.jobs.records.size, 1);

  assert.equal((await harness.processor.processJob(first.jobId, "backfill-001")).state, "completed");
  assert.equal(harness.backfillCalls.length, 1);
  assert.equal(harness.backfillCalls[0].scope.athleteId, "athlete-a");
  assert.deepEqual(harness.backfillCalls[0].request, {
    ...window,
    pageSize: 30,
    maxPages: 5,
    maxActivities: 150,
  });

  const reconciliation = await harness.processor.enqueueReconciliation(scope, window);
  harness.batchOutcomes.push({
    source: "reconciliation",
    pagesFetched: 0,
    activitiesDiscovered: 0,
    outcomes: [],
    truncated: true,
    failure: { state: "retry", diagnosticCode: "STRAVA_RATE_LIMITED", retryAt: "2026-08-10T10:15:05.000Z" },
  });
  assert.equal((await harness.processor.processJob(reconciliation.jobId, "reconcile-001")).state, "retry");
  assert.equal(harness.reconciliationCalls[0].scope.athleteId, "athlete-a");

  await assert.rejects(
    harness.processor.enqueueReconciliation(scope, {
      after: "2026-01-01T00:00:00.000Z",
      before: "2026-08-10T00:00:00.000Z",
    }),
    /Window must not exceed 31 days/u,
  );
});

function createHarness(options: { maxAttempts?: number } = {}) {
  const jobs = new MemoryJobRepository();
  const outcomes: StravaIngestionOutcome[] = [];
  const ingestionCalls: Array<{ scope: AthleteScope; event: unknown }> = [];
  const deauthorizationScopes: AthleteScope[] = [];
  const backfillCalls: Array<{ scope: AthleteScope; request: unknown }> = [];
  const reconciliationCalls: Array<{ scope: AthleteScope; request: unknown }> = [];
  const batchOutcomes: import("../src/services/strava-ingestion-service.ts").StravaBatchResult[] = [];
  const credentials = new Map<string, string>();
  let leaseSequence = 0;
  const state = { throwIngestion: false, coachingPlanMutations: 0 };
  const processor = new StravaIngestionJobProcessor({
    jobs,
    ingestion: {
      async ingest(scope, event) {
        ingestionCalls.push({ scope, event: structuredClone(event) });
        if (state.throwIngestion) throw new Error("synthetic provider failure");
        return outcomes.shift() ?? {
          state: "applied",
          activityId: `activity_strava_${event.providerActivityId}`,
          revision: 1,
          created: true,
          changed: true,
          rawObjectKeys: [],
        };
      },
      async runBackfill(scope, request) {
        backfillCalls.push({ scope, request: structuredClone(request) });
        return batchOutcomes.shift() ?? successfulBatch("backfill");
      },
      async runReconciliation(scope, request) {
        reconciliationCalls.push({ scope, request: structuredClone(request) });
        return batchOutcomes.shift() ?? successfulBatch("reconciliation");
      },
    },
    connections: {
      async deauthorize(scope) {
        deauthorizationScopes.push(scope);
        credentials.delete(scope.athleteId);
        return {
          athleteId: scope.athleteId,
          provider: "strava",
          status: "revoked",
          displayStatus: "action_required",
          connectedAt: null,
          lastSuccessfulProviderContactAt: null,
          lastSuccessfulSyncAt: null,
          lastEventReceivedAt: null,
          lastErrorCode: "PROVIDER_DEAUTHORIZED",
          updatedAt: baseTime,
        };
      },
    },
    now: () => new Date(baseTime),
    createLeaseToken: () => `lease-${++leaseSequence}`,
    maxAttempts: options.maxAttempts,
  });
  return {
    processor,
    jobs,
    outcomes,
    ingestionCalls,
    deauthorizationScopes,
    backfillCalls,
    reconciliationCalls,
    batchOutcomes,
    credentials,
    get throwIngestion() { return state.throwIngestion; },
    set throwIngestion(value: boolean) { state.throwIngestion = value; },
    get coachingPlanMutations() { return state.coachingPlanMutations; },
  };
}

type MemoryRecord = {
  id: string;
  athleteId: string;
  webhookEventId: string | null;
  event: StravaIngestionJobEvent;
  attempt: number;
  status: "queued" | "processing" | "completed" | "failed" | "dead_letter";
  leaseToken: string | null;
  availableAt: string;
  diagnosticCode: string | null;
};

class MemoryJobRepository implements StravaIngestionJobRepository {
  records = new Map<string, MemoryRecord>();

  async enqueueBatch(scope: AthleteScope, input: Extract<StravaIngestionJobEvent, { kind: "backfill" | "reconciliation" }>) {
    const existing = [...this.records.values()].find((record) => (
      record.athleteId === scope.athleteId && JSON.stringify(record.event) === JSON.stringify(input)
    ));
    if (existing) return { jobId: existing.id, reused: true };
    const id = `job-batch-${this.records.size + 1}`;
    this.add(job(id, scope.athleteId, input));
    return { jobId: id, reused: false };
  }

  add(record: MemoryRecord) {
    this.records.set(record.id, structuredClone(record));
  }

  async claimNext(input: StravaJobClaimRequest) {
    const record = [...this.records.values()].find((candidate) => candidate.status === "queued") ?? null;
    return this.claim(record, input);
  }

  async claimById(jobId: string, input: StravaJobClaimRequest) {
    return this.claim(this.records.get(jobId) ?? null, input);
  }

  async markCompleted(input: StravaJobCompletion) {
    this.finalize(input.job, "completed", null);
  }

  async markRetry(input: StravaJobFailure & { availableAt: string }) {
    const record = this.finalize(input.job, "queued", input.diagnosticCode);
    record.availableAt = input.availableAt;
  }

  async markTerminal(input: StravaJobFailure) {
    this.finalize(input.job, "failed", input.diagnosticCode);
  }

  async markDeadLetter(input: StravaJobFailure) {
    this.finalize(input.job, "dead_letter", input.diagnosticCode);
  }

  private claim(record: MemoryRecord | null, input: StravaJobClaimRequest): ClaimedStravaIngestionJob | null {
    if (!record || record.status !== "queued" || Date.parse(record.availableAt) > Date.parse(input.claimedAt)) return null;
    if (record.attempt >= input.maxAttempts) return null;
    record.status = "processing";
    record.attempt += 1;
    record.leaseToken = input.leaseToken;
    return structuredClone({
      id: record.id,
      athleteId: record.athleteId,
      webhookEventId: record.webhookEventId,
      attempt: record.attempt,
      leaseToken: record.leaseToken,
      event: record.event,
    });
  }

  private finalize(job: ClaimedStravaIngestionJob, status: MemoryRecord["status"], diagnosticCode: string | null) {
    const record = this.records.get(job.id);
    if (!record || record.status !== "processing" || record.leaseToken !== job.leaseToken) {
      throw new Error("Job lease was lost");
    }
    record.status = status;
    record.diagnosticCode = diagnosticCode;
    record.leaseToken = null;
    return record;
  }
}

function job(
  id: string,
  athleteId: string,
  event: StravaIngestionJobEvent,
  attempt = 0,
): MemoryRecord {
  return {
    id,
    athleteId,
    webhookEventId: event.kind === "backfill" || event.kind === "reconciliation" ? null : `event-${id}`,
    event,
    attempt,
    status: "queued",
    leaseToken: null,
    availableAt: baseTime,
    diagnosticCode: null,
  };
}

function activityEvent(providerActivityId = "900000000001"): StravaIngestionJobEvent {
  return { kind: "activity", providerActivityId, aspect: "update", occurredAt: baseTime };
}

function successfulBatch(source: "backfill" | "reconciliation") {
  return {
    source,
    pagesFetched: 1,
    activitiesDiscovered: 0,
    outcomes: [],
    truncated: false,
    failure: null,
  } as const;
}
