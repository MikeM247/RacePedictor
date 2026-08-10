import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import { PrismaStravaIngestionJobRepository } from "../src/cloud/index.js";

const t0 = "2026-08-10T10:00:00.000Z";

test("optimistic claim gives two workers one winner and stale lease recovery is fenced", async () => {
  const prisma = new FakeWorkerPrisma();
  prisma.seed("job-a", "athlete-a", activityEvent("event-a", "900000000001"));
  const repository = new PrismaStravaIngestionJobRepository({ prisma });

  const [first, second] = await Promise.all([
    repository.claimById("job-a", claim("worker-a", "lease-a", t0)),
    repository.claimById("job-a", claim("worker-b", "lease-b", t0)),
  ]);
  const winner = first ?? second;
  assert.ok(winner);
  assert.equal([first, second].filter(Boolean).length, 1);
  assert.equal(winner.attempt, 1);
  assert.deepEqual(winner.event, {
    kind: "activity",
    providerActivityId: "900000000001",
    aspect: "create",
    occurredAt: t0,
  });

  assert.equal(await repository.claimById("job-a", claim("worker-c", "lease-c", "2026-08-10T10:01:00.000Z")), null);
  const reclaimed = await repository.claimById(
    "job-a",
    claim("worker-c", winner.leaseToken, "2026-08-10T10:02:01.000Z"),
  );
  assert.equal(reclaimed.attempt, 2);
  await assert.rejects(
    repository.markCompleted({ job: winner, occurredAt: "2026-08-10T10:02:02.000Z" }),
    /lease was lost/u,
  );
  await repository.markCompleted({ job: reclaimed, occurredAt: "2026-08-10T10:02:03.000Z" });
  assert.equal(prisma.jobs.get("job-a").status, "completed");
  assert.equal(prisma.events.get("event-a").status, "processed");
});

test("availableAt delays retries and terminal outcomes update job and event atomically", async () => {
  const prisma = new FakeWorkerPrisma();
  prisma.seed("job-retry", "athlete-a", activityEvent("event-retry", "900000000002"));
  const repository = new PrismaStravaIngestionJobRepository({ prisma });
  const first = await repository.claimNext(claim("worker-a", "lease-a", t0));

  await repository.markRetry({
    job: first,
    occurredAt: "2026-08-10T10:00:10.000Z",
    availableAt: "2026-08-10T10:15:05.000Z",
    diagnosticCode: "STRAVA_RATE_LIMITED",
  });
  assert.equal(prisma.jobs.get("job-retry").status, "queued");
  assert.equal(prisma.events.get("event-retry").status, "queued");
  assert.equal(await repository.claimNext(claim("worker-b", "lease-b", "2026-08-10T10:15:04.000Z")), null);

  const retried = await repository.claimNext(claim("worker-b", "lease-b", "2026-08-10T10:15:05.000Z"));
  assert.equal(retried.attempt, 2);
  await repository.markTerminal({
    job: retried,
    occurredAt: "2026-08-10T10:15:06.000Z",
    diagnosticCode: "STRAVA_REAUTH_REQUIRED",
  });
  assert.equal(prisma.jobs.get("job-retry").status, "failed");
  assert.equal(prisma.events.get("event-retry").status, "failed");
  assert.equal(prisma.events.get("event-retry").errorCode, "STRAVA_REAUTH_REQUIRED");
});

test("stale final attempts dead-letter and athlete deauthorization is projected without raw updates", async () => {
  const prisma = new FakeWorkerPrisma();
  prisma.seed("job-exhausted", "athlete-a", activityEvent("event-exhausted", "900000000003"), {
    status: "processing",
    attemptCount: 3,
    lockedAt: new Date("2026-08-10T09:00:00.000Z"),
    lockedBy: "dead-worker",
    leaseToken: "dead-lease",
  });
  prisma.seed("job-deauth", "athlete-b", {
    id: "event-deauth",
    provider: "strava",
    objectType: "athlete",
    providerObjectId: "222",
    aspectType: "update",
    eventOccurredAt: new Date(t0),
  });
  const repository = new PrismaStravaIngestionJobRepository({ prisma });

  const deauthorization = await repository.claimById("job-deauth", claim("worker-a", "lease-a", t0));
  assert.deepEqual(deauthorization.event, { kind: "athlete_deauthorization", occurredAt: t0 });
  assert.equal(deauthorization.athleteId, "athlete-b");

  assert.equal(await repository.claimById(
    "job-exhausted",
    claim("worker-b", "lease-b", "2026-08-10T10:00:00.000Z", 3),
  ), null);
  assert.equal(prisma.jobs.get("job-exhausted").status, "dead_letter");
  assert.equal(prisma.events.get("event-exhausted").status, "failed");
  assert.equal(prisma.jobs.get("job-exhausted").errorCode, "MAX_ATTEMPTS_EXHAUSTED");
});

test("event persistence failure rolls back completion and a forged athlete cannot settle a claim", async () => {
  const prisma = new FakeWorkerPrisma();
  prisma.seed("job-a", "athlete-a", activityEvent("event-a", "900000000001"));
  const repository = new PrismaStravaIngestionJobRepository({ prisma });
  const claimed = await repository.claimNext(claim("worker-a", "lease-a", t0));

  await assert.rejects(
    repository.markCompleted({
      job: { ...claimed, athleteId: "athlete-b" },
      occurredAt: "2026-08-10T10:00:01.000Z",
    }),
    /lease was lost/u,
  );
  assert.equal(prisma.jobs.get("job-a").status, "processing");

  prisma.failNextEventUpdate = true;
  await assert.rejects(
    repository.markCompleted({ job: claimed, occurredAt: "2026-08-10T10:00:02.000Z" }),
    /synthetic event update failure/u,
  );
  assert.equal(prisma.jobs.get("job-a").status, "processing");
  assert.equal(prisma.events.get("event-a").status, "queued");
});

test("bounded batch windows enqueue idempotently per athlete without synthetic webhook events", async () => {
  const prisma = new FakeWorkerPrisma();
  prisma.connections.set("athlete-a", { id: "connection-a", athleteId: "athlete-a", status: "connected" });
  const repository = new PrismaStravaIngestionJobRepository({ prisma });
  const scope = athleteScopeFor(buildActorContext({
    userId: "owner-a",
    permittedAthleteIds: ["athlete-a"],
    activeAthleteId: "athlete-a",
    requestId: "request-batch-a",
    credentialKind: "session",
  }));
  const request = {
    after: "2026-08-01T00:00:00.000Z",
    before: "2026-08-10T00:00:00.000Z",
  };

  const first = await repository.enqueueBatch(scope, { kind: "backfill", request });
  const duplicate = await repository.enqueueBatch(scope, { kind: "backfill", request });
  assert.equal(first.reused, false);
  assert.deepEqual(duplicate, { ...first, reused: true });
  const stored = prisma.jobs.get(first.jobId);
  assert.equal(stored.webhookEventId, null);
  assert.equal(stored.kind, "backfill");
  assert.equal(prisma.events.size, 0);

  const claimed = await repository.claimById(first.jobId, claim("batch-worker", "batch-lease", t0));
  assert.equal(claimed.webhookEventId, null);
  assert.deepEqual(claimed.event, {
    kind: "backfill",
    request: { ...request, pageSize: 30, maxPages: 5, maxActivities: 150 },
  });
  await repository.markCompleted({ job: claimed, occurredAt: "2026-08-10T10:00:01.000Z" });
  assert.equal(prisma.jobs.get(first.jobId).status, "completed");
  assert.equal(prisma.events.size, 0);
});

function claim(workerId, leaseToken, claimedAt, maxAttempts = 5) {
  return { workerId, leaseToken, claimedAt, leaseTimeoutSeconds: 120, maxAttempts };
}

function activityEvent(id, providerObjectId) {
  return {
    id,
    provider: "strava",
    objectType: "activity",
    providerObjectId,
    aspectType: "create",
    eventOccurredAt: new Date(t0),
  };
}

class FakeWorkerPrisma {
  jobs = new Map();
  events = new Map();
  connections = new Map();
  failNextEventUpdate = false;
  #transactionTail = Promise.resolve();

  seed(id, athleteId, event, jobOverrides = {}) {
    this.events.set(event.id, {
      ...structuredClone(event),
      athleteId,
      status: "queued",
      processedAt: null,
      errorCode: null,
    });
    this.jobs.set(id, {
      id,
      athleteId,
      webhookEventId: event.id,
      kind: "webhook",
      payload: null,
      status: "queued",
      attemptCount: 0,
      availableAt: new Date(t0),
      lockedAt: null,
      lockedBy: null,
      leaseToken: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date(t0),
      updatedAt: new Date(t0),
      ...structuredClone(jobOverrides),
    });
  }

  ingestionJob = {
    findFirst: async ({ where, orderBy }) => {
      const candidates = [...this.jobs.values()].filter((job) => matches(job, where));
      candidates.sort((left, right) => compareOrder(left, right, orderBy));
      return candidates[0] ? selectJob(candidates[0]) : null;
    },
    findMany: async ({ where, take }) => [...this.jobs.values()]
      .filter((job) => matches(job, where))
      .slice(0, take)
      .map((job) => selectJob(job)),
    findUnique: async ({ where }) => {
      const job = where.athleteId_idempotencyKey
        ? [...this.jobs.values()].find((candidate) => (
            candidate.athleteId === where.athleteId_idempotencyKey.athleteId
            && candidate.idempotencyKey === where.athleteId_idempotencyKey.idempotencyKey
          ))
        : this.jobs.get(where.id);
      if (!job) return null;
      return {
        ...structuredClone(job),
        webhookEvent: structuredClone(this.events.get(job.webhookEventId) ?? null),
      };
    },
    upsert: async ({ where, create }) => {
      const unique = where.athleteId_idempotencyKey;
      const existing = [...this.jobs.values()].find((candidate) => (
        candidate.athleteId === unique.athleteId && candidate.idempotencyKey === unique.idempotencyKey
      ));
      if (existing) return structuredClone(existing);
      const id = `job-batch-${this.jobs.size + 1}`;
      const record = {
        id,
        attemptCount: 0,
        availableAt: new Date(t0),
        lockedAt: null,
        lockedBy: null,
        leaseToken: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date(t0),
        updatedAt: new Date(t0),
        ...structuredClone(create),
      };
      this.jobs.set(id, record);
      return structuredClone(record);
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const [id, job] of this.jobs) {
        if (!matches(job, where)) continue;
        this.jobs.set(id, applyData(job, data));
        count += 1;
      }
      return { count };
    },
  };

  providerWebhookEvent = {
    updateMany: async ({ where, data }) => {
      if (this.failNextEventUpdate) {
        this.failNextEventUpdate = false;
        throw new Error("synthetic event update failure");
      }
      let count = 0;
      for (const [id, event] of this.events) {
        if (!matches(event, where)) continue;
        this.events.set(id, applyData(event, data));
        count += 1;
      }
      return { count };
    },
  };

  providerConnection = {
    findUnique: async ({ where }) => {
      const unique = where.athleteId_provider;
      return unique?.provider === "strava" ? structuredClone(this.connections.get(unique.athleteId) ?? null) : null;
    },
  };

  async $transaction(action) {
    let release;
    const previous = this.#transactionTail;
    this.#transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    const snapshot = {
      jobs: structuredClone(this.jobs),
      events: structuredClone(this.events),
    };
    try {
      return await action(this);
    } catch (error) {
      this.jobs = snapshot.jobs;
      this.events = snapshot.events;
      throw error;
    } finally {
      release();
    }
  }
}

function matches(record, where) {
  if (!where) return true;
  if (where.OR && !where.OR.some((candidate) => matches(record, candidate))) return false;
  for (const [key, expected] of Object.entries(where)) {
    if (key === "OR") continue;
    const actual = record[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if ("not" in expected && actual === expected.not) return false;
      if ("lt" in expected && !(actual < expected.lt)) return false;
      if ("lte" in expected && !(actual <= expected.lte)) return false;
      if ("gte" in expected && !(actual >= expected.gte)) return false;
      if ("equals" in expected && actual !== expected.equals) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function applyData(record, data) {
  const updated = structuredClone(record);
  for (const [key, value] of Object.entries(data)) {
    updated[key] = value && typeof value === "object" && "increment" in value
      ? updated[key] + value.increment
      : structuredClone(value);
  }
  return updated;
}

function selectJob(job) {
  return structuredClone(job);
}

function compareOrder(left, right, orderBy) {
  for (const order of orderBy) {
    const [field, direction] = Object.entries(order)[0];
    const comparison = left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0;
    if (comparison !== 0) return direction === "asc" ? comparison : -comparison;
  }
  return 0;
}
