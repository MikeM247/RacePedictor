import {
  stravaBackfillRequestSchema,
  stravaBatchCheckpointSchema,
  stravaReconciliationRequestSchema,
} from "../../../core/src/contracts/strava.ts";
import { assertAthleteScope, immutableCopy } from "./athlete-scope.js";

const MAX_CLAIM_CONTENTION_RETRIES = 8;

export class PrismaStravaIngestionJobRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma || typeof prisma.$transaction !== "function") throw new Error("Prisma client is required");
    this.#prisma = prisma;
  }

  async enqueueBatch(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const request = input?.kind === "backfill"
      ? stravaBackfillRequestSchema.parse(input.request)
      : input?.kind === "reconciliation"
        ? stravaReconciliationRequestSchema.parse(input.request)
        : null;
    if (!request) throw new Error("Strava batch job kind is invalid");
    const idempotencyKey = batchIdempotencyKey(input.kind, request);

    return this.#prisma.$transaction(async (transaction) => {
      const connection = await transaction.providerConnection.findUnique({
        where: { athleteId_provider: { athleteId, provider: "strava" } },
        select: { id: true, athleteId: true, status: true },
      });
      if (!connection || connection.athleteId !== athleteId || connection.status !== "connected") {
        throw new Error("Strava connection is unavailable for batch ingestion");
      }
      const unique = { athleteId, idempotencyKey };
      const existing = await transaction.ingestionJob.findUnique({
        where: { athleteId_idempotencyKey: unique },
        select: { id: true },
      });
      const job = await transaction.ingestionJob.upsert({
        where: { athleteId_idempotencyKey: unique },
        create: {
          athleteId,
          providerConnectionId: connection.id,
          webhookEventId: null,
          idempotencyKey,
          kind: input.kind,
          payload: batchPayload(request, initialBatchCheckpoint()),
          status: "queued",
        },
        update: {},
        select: {
          id: true,
          athleteId: true,
          providerConnectionId: true,
          kind: true,
          payload: true,
        },
      });
      if (
        job.athleteId !== athleteId
        || job.providerConnectionId !== connection.id
        || job.kind !== input.kind
        || !sameBatchRequest(input.kind, job.payload, request)
      ) {
        throw new Error("Strava batch job conflicts with its idempotency key");
      }
      return immutableCopy({ jobId: job.id, reused: Boolean(existing) });
    });
  }

  async claimNext(input) {
    return this.#claim(null, input);
  }

  async claimById(jobId, input) {
    assertIdentifier(jobId, "Job id");
    return this.#claim(jobId, input);
  }

  async markCompleted(input) {
    return this.#finalize(input, "completed");
  }

  async markRetry(input) {
    assertDate(input.availableAt, "Job retry time");
    return this.#finalize(input, "retry");
  }

  async markDeferred(input) {
    assertDate(input.availableAt, "Job deferred time");
    return this.#finalize(input, "deferred");
  }

  async markTerminal(input) {
    return this.#finalize(input, "failed");
  }

  async markDeadLetter(input) {
    return this.#finalize(input, "dead_letter");
  }

  async #claim(requestedJobId, input) {
    const request = validateClaim(input);
    return this.#prisma.$transaction(async (transaction) => {
      await deadLetterExhausted(transaction, requestedJobId, request);

      for (let contention = 0; contention < MAX_CLAIM_CONTENTION_RETRIES; contention += 1) {
        const candidate = await transaction.ingestionJob.findFirst({
          where: claimableWhere(requestedJobId, request, { lt: request.maxAttempts }),
          orderBy: [
            { availableAt: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
          ],
          select: { id: true, athleteId: true, attemptCount: true },
        });
        if (!candidate) return null;

        const claimed = await transaction.ingestionJob.updateMany({
          where: {
            ...claimableWhere(candidate.id, request, { equals: candidate.attemptCount }),
            athleteId: candidate.athleteId,
          },
          data: {
            status: "processing",
            attemptCount: { increment: 1 },
            lockedAt: request.claimedAt,
            lockedBy: request.workerId,
            leaseToken: request.leaseToken,
            completedAt: null,
            errorCode: null,
            errorMessage: null,
            updatedAt: request.claimedAt,
          },
        });
        if (claimed.count !== 1) continue;

        const record = await transaction.ingestionJob.findUnique({
          where: { id: candidate.id },
          select: {
            id: true,
            athleteId: true,
            attemptCount: true,
            leaseToken: true,
            webhookEventId: true,
            kind: true,
            payload: true,
            webhookEvent: {
              select: {
                id: true,
                athleteId: true,
                provider: true,
                objectType: true,
                providerObjectId: true,
                aspectType: true,
                eventOccurredAt: true,
              },
            },
          },
        });
        try {
          return projectClaim(record, request.leaseToken);
        } catch {
          await markInvalidClaim(transaction, record, request.claimedAt);
          return null;
        }
      }
      return null;
    });
  }

  async #finalize(input, outcome) {
    const completion = validateCompletion(input);
    return this.#prisma.$transaction(async (transaction) => {
      const status = outcome === "retry" || outcome === "deferred" ? "queued" : outcome;
      const terminal = outcome !== "retry" && outcome !== "deferred";
      const data = {
        status,
        availableAt: outcome === "retry" || outcome === "deferred" ? completion.availableAt : completion.occurredAt,
        lockedAt: null,
        lockedBy: null,
        leaseToken: null,
        ...(outcome === "deferred" ? { attemptCount: { decrement: 1 } } : {}),
        completedAt: terminal ? completion.occurredAt : null,
        errorCode: outcome === "completed" || outcome === "deferred" ? null : completion.diagnosticCode,
        errorMessage: null,
        updatedAt: completion.occurredAt,
      };
      if ((outcome === "retry" || outcome === "deferred") && completion.batchPayload) {
        data.payload = completion.batchPayload;
      }
      const updated = await transaction.ingestionJob.updateMany({
        where: {
          id: completion.job.id,
          athleteId: completion.job.athleteId,
          status: "processing",
          attemptCount: completion.job.attempt,
          leaseToken: completion.job.leaseToken,
        },
        data,
      });
      if (updated.count !== 1) throw new Error("Ingestion job lease was lost");

      const eventStatus = outcome === "completed" ? "processed" : outcome === "retry" || outcome === "deferred" ? "queued" : "failed";
      if (completion.job.webhookEventId === null) return;
      const eventUpdated = await transaction.providerWebhookEvent.updateMany({
        where: {
          id: completion.job.webhookEventId,
          athleteId: completion.job.athleteId,
        },
        data: {
          status: eventStatus,
          processedAt: outcome === "retry" || outcome === "deferred" ? null : completion.occurredAt,
          errorCode: outcome === "completed" || outcome === "deferred" ? null : completion.diagnosticCode,
        },
      });
      if (eventUpdated.count !== 1) throw new Error("Ingestion job event is unavailable");
    });
  }
}

function claimableWhere(jobId, request, attemptCount) {
  return {
    ...(jobId ? { id: jobId } : {}),
    attemptCount,
    OR: [
      { status: "queued", availableAt: { lte: request.claimedAt } },
      { status: "processing", lockedAt: { lte: request.staleBefore } },
    ],
  };
}

async function deadLetterExhausted(transaction, jobId, request) {
  const exhausted = await transaction.ingestionJob.findMany({
    where: claimableWhere(jobId, request, { gte: request.maxAttempts }),
    select: { id: true, athleteId: true, webhookEventId: true, attemptCount: true },
    take: jobId ? 1 : 25,
  });
  for (const job of exhausted) {
    const updated = await transaction.ingestionJob.updateMany({
      where: {
        ...claimableWhere(job.id, request, { equals: job.attemptCount }),
        athleteId: job.athleteId,
      },
      data: {
        status: "dead_letter",
        availableAt: request.claimedAt,
        lockedAt: null,
        lockedBy: null,
        leaseToken: null,
        completedAt: request.claimedAt,
        errorCode: "MAX_ATTEMPTS_EXHAUSTED",
        errorMessage: null,
        updatedAt: request.claimedAt,
      },
    });
    if (updated.count !== 1 || !job.webhookEventId) continue;
    await transaction.providerWebhookEvent.updateMany({
      where: { id: job.webhookEventId, athleteId: job.athleteId },
      data: {
        status: "failed",
        processedAt: request.claimedAt,
        errorCode: "MAX_ATTEMPTS_EXHAUSTED",
      },
    });
  }
}

async function markInvalidClaim(transaction, record, occurredAt) {
  if (!record?.id || !record.athleteId || !record.leaseToken) return;
  const updated = await transaction.ingestionJob.updateMany({
    where: { id: record.id, athleteId: record.athleteId, status: "processing", leaseToken: record.leaseToken },
    data: {
      status: "failed",
      lockedAt: null,
      lockedBy: null,
      leaseToken: null,
      completedAt: occurredAt,
      errorCode: "INVALID_INGESTION_JOB",
      errorMessage: null,
      updatedAt: occurredAt,
    },
  });
  if (updated.count === 1 && record.webhookEventId) {
    await transaction.providerWebhookEvent.updateMany({
      where: { id: record.webhookEventId, athleteId: record.athleteId },
      data: { status: "failed", processedAt: occurredAt, errorCode: "INVALID_INGESTION_JOB" },
    });
  }
}

function projectClaim(record, expectedLeaseToken) {
  const event = record?.webhookEvent;
  if (
    !record
    || record.leaseToken !== expectedLeaseToken
    || !Number.isInteger(record.attemptCount)
    || record.attemptCount < 1
  ) {
    throw new Error("Claimed ingestion job is invalid");
  }
  let projectedEvent;
  if (record.kind === "backfill") {
    if (record.webhookEventId !== null || event !== null) throw new Error("Batch job cannot reference a webhook event");
    const batch = parseBatchPayload("backfill", record.payload);
    projectedEvent = { kind: "backfill", ...batch };
  } else if (record.kind === "reconciliation") {
    if (record.webhookEventId !== null || event !== null) throw new Error("Batch job cannot reference a webhook event");
    const batch = parseBatchPayload("reconciliation", record.payload);
    projectedEvent = { kind: "reconciliation", ...batch };
  } else if (
    record.kind === "webhook"
    && event
    && event.id === record.webhookEventId
    && event.athleteId === record.athleteId
    && event.provider === "strava"
  ) {
    const occurredAt = new Date(event.eventOccurredAt).toISOString();
    if (
      event.objectType === "activity"
      && ["create", "update", "delete"].includes(event.aspectType)
      && /^\d+$/.test(event.providerObjectId)
    ) {
      projectedEvent = {
        kind: "activity",
        providerActivityId: event.providerObjectId,
        aspect: event.aspectType,
        occurredAt,
      };
    } else if (event.objectType === "athlete" && event.aspectType === "update") {
      projectedEvent = { kind: "athlete_deauthorization", occurredAt };
    } else {
      throw new Error("Claimed webhook event is invalid");
    }
  } else {
    throw new Error("Claimed ingestion job kind is invalid");
  }
  return immutableCopy({
    id: record.id,
    athleteId: record.athleteId,
    webhookEventId: record.webhookEventId,
    attempt: record.attemptCount,
    leaseToken: record.leaseToken,
    event: projectedEvent,
  });
}

function batchIdempotencyKey(kind, request) {
  return [
    "strava",
    kind,
    request.after,
    request.before,
    request.pageSize,
    request.maxPages,
    request.maxActivities,
  ].join(":");
}

/**
 * PostgreSQL's JSONB storage can return object keys in a different order to
 * the request that was written. Verify the schema-normalised fields rather
 * than the incidental JSON serialisation order, otherwise a valid queue row
 * would be rolled back as a false idempotency conflict.
 */
function sameBatchRequest(kind, stored, expected) {
  try {
    return canonicalBatchRequest(kind, stored) === canonicalBatchRequest(kind, expected);
  } catch {
    return false;
  }
}

function canonicalBatchRequest(kind, request) {
  const parsed = parseBatchPayload(kind, request).request;
  return [
    parsed.after,
    parsed.before,
    parsed.pageSize,
    parsed.maxPages,
    parsed.maxActivities,
  ].join("\u001f");
}

function validateClaim(input) {
  if (!input || typeof input !== "object") throw new Error("Job claim is invalid");
  assertIdentifier(input.workerId, "Worker id");
  assertIdentifier(input.leaseToken, "Lease token");
  const claimedAt = assertDate(input.claimedAt, "Job claim time");
  if (!Number.isInteger(input.leaseTimeoutSeconds) || input.leaseTimeoutSeconds < 30 || input.leaseTimeoutSeconds > 900) {
    throw new Error("Job lease duration is invalid");
  }
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 20) {
    throw new Error("Job attempt limit is invalid");
  }
  return {
    workerId: input.workerId,
    leaseToken: input.leaseToken,
    claimedAt,
    staleBefore: new Date(claimedAt.getTime() - input.leaseTimeoutSeconds * 1_000),
    maxAttempts: input.maxAttempts,
  };
}

function validateCompletion(input) {
  if (!input?.job || typeof input.job !== "object") throw new Error("Claimed job is required");
  assertIdentifier(input.job.id, "Job id");
  assertIdentifier(input.job.athleteId, "Athlete id");
  if (input.job.webhookEventId !== null) assertIdentifier(input.job.webhookEventId, "Webhook event id");
  assertIdentifier(input.job.leaseToken, "Lease token");
  if (!Number.isInteger(input.job.attempt) || input.job.attempt < 1 || input.job.attempt > 20) {
    throw new Error("Job attempt is invalid");
  }
  const occurredAt = assertDate(input.occurredAt, "Job outcome time");
  const diagnosticCode = input.diagnosticCode ?? null;
  if (diagnosticCode !== null && !/^[A-Z0-9_:-]{1,80}$/.test(diagnosticCode)) {
    throw new Error("Job diagnostic code is invalid");
  }
  let checkpointPayload = null;
  if (input.checkpoint !== undefined) {
    const event = input.job.event;
    if (!event || (event.kind !== "backfill" && event.kind !== "reconciliation")) {
      throw new Error("Batch progress is invalid for this ingestion job");
    }
    checkpointPayload = batchPayload(event.request, input.checkpoint);
  }
  return {
    job: input.job,
    occurredAt,
    diagnosticCode,
    availableAt: input.availableAt ? assertDate(input.availableAt, "Job retry time") : null,
    batchPayload: checkpointPayload,
  };
}

/**
 * Batch progress remains private queue state. The original request stays
 * versioned and strict; progress is carried over any safe retry or provider-window
 * deferral so already completed provider calls are not repeated unnecessarily.
 */
function batchPayload(request, checkpoint) {
  return { request, checkpoint: stravaBatchCheckpointSchema.parse(checkpoint) };
}

function parseBatchPayload(kind, value) {
  const requestSchema = kind === "backfill" ? stravaBackfillRequestSchema : stravaReconciliationRequestSchema;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Batch job payload is invalid");
  if (Object.prototype.hasOwnProperty.call(value, "request")) {
    const keys = Object.keys(value).sort();
    if (keys.length !== 2 || keys[0] !== "checkpoint" || keys[1] !== "request") {
      throw new Error("Batch job payload is invalid");
    }
    return {
      request: requestSchema.parse(value.request),
      checkpoint: stravaBatchCheckpointSchema.parse(value.checkpoint),
    };
  }
  // Pre-checkpoint rows are compatible and resume with no completed work.
  return { request: requestSchema.parse(value), checkpoint: initialBatchCheckpoint() };
}

function initialBatchCheckpoint() {
  return {
    version: 1,
    nextPage: 1,
    pendingActivityIds: [],
    seenActivityIds: [],
    completedActivityIds: [],
    pagesFetched: 0,
    activitiesDiscovered: 0,
    exhausted: false,
  };
}

function assertDate(value, label) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is invalid`);
  return parsed;
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,255}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}
