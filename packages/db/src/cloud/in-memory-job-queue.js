import { createHash } from "node:crypto";
import { assertAthleteOwnership, assertAthleteScope, immutableCopy } from "./athlete-scope.js";

export class InMemoryDurableJobQueue {
  #jobsById = new Map();
  #jobIdByIdempotencyKey = new Map();
  #sequence = 0;
  #now;

  constructor({ now = () => new Date() } = {}) {
    this.#now = now;
  }

  async enqueue(scope, input) {
    const athleteId = assertAthleteScope(scope);
    assertEnqueueInput(input);
    const idempotencyKey = `${athleteId}\u0000${input.provider}\u0000${input.providerEventId}`;
    const existingId = this.#jobIdByIdempotencyKey.get(idempotencyKey);
    if (existingId) return publicJob(this.#jobsById.get(existingId));

    const id = `job_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24)}`;
    const record = {
      id,
      athleteId,
      provider: input.provider,
      providerEventId: input.providerEventId,
      attempt: 0,
      status: "queued",
      workerId: null,
      retryAt: null,
      diagnosticCode: null,
      sequence: ++this.#sequence,
    };
    this.#jobsById.set(id, record);
    this.#jobIdByIdempotencyKey.set(idempotencyKey, id);
    return publicJob(record);
  }

  async claim(scope, workerId) {
    const athleteId = assertAthleteScope(scope);
    assertIdentifier(workerId, "Worker id");
    const nowMs = this.#now().getTime();
    const candidate = [...this.#jobsById.values()]
      .filter((job) => job.athleteId === athleteId && (
        job.status === "queued"
        || (job.status === "retry_scheduled" && Date.parse(job.retryAt) <= nowMs)
      ))
      .sort((left, right) => left.sequence - right.sequence)[0];

    if (!candidate) return null;
    candidate.status = "claimed";
    candidate.workerId = workerId;
    candidate.attempt += 1;
    candidate.retryAt = null;
    return publicJob(candidate);
  }

  async complete(scope, jobId) {
    const job = this.#ownedClaimedJob(scope, jobId);
    job.status = "completed";
    job.workerId = null;
  }

  async retry(scope, { jobId, diagnosticCode, retryAt }) {
    const job = this.#ownedClaimedJob(scope, jobId);
    assertDiagnosticCode(diagnosticCode);
    if (typeof retryAt !== "string" || Number.isNaN(Date.parse(retryAt))) {
      throw new Error("Job retry time is invalid");
    }
    job.status = "retry_scheduled";
    job.workerId = null;
    job.retryAt = retryAt;
    job.diagnosticCode = diagnosticCode;
  }

  async fail(scope, { jobId, diagnosticCode }) {
    const job = this.#ownedClaimedJob(scope, jobId);
    assertDiagnosticCode(diagnosticCode);
    job.status = "failed";
    job.workerId = null;
    job.diagnosticCode = diagnosticCode;
  }

  async inspect(scope, jobId) {
    const job = this.#ownedJob(scope, jobId);
    return immutableCopy({
      ...publicJob(job),
      status: job.status,
      workerId: job.workerId,
      retryAt: job.retryAt,
      diagnosticCode: job.diagnosticCode,
    });
  }

  #ownedClaimedJob(scope, jobId) {
    const job = this.#ownedJob(scope, jobId);
    if (job.status !== "claimed") throw new Error("Job is not currently claimed");
    return job;
  }

  #ownedJob(scope, jobId) {
    assertAthleteScope(scope);
    assertIdentifier(jobId, "Job id");
    const job = this.#jobsById.get(jobId);
    if (!job) throw new Error("Job was not found");
    assertAthleteOwnership(scope, job.athleteId);
    return job;
  }
}

function publicJob(job) {
  return immutableCopy({
    id: job.id,
    athleteId: job.athleteId,
    provider: job.provider,
    providerEventId: job.providerEventId,
    attempt: job.attempt,
  });
}

function assertEnqueueInput(input) {
  if (!input || input.provider !== "strava") throw new Error("Job provider is unsupported");
  assertIdentifier(input.providerEventId, "Provider event id");
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new Error(`${label} is invalid`);
  }
}

function assertDiagnosticCode(value) {
  if (typeof value !== "string" || !/^[A-Z0-9_:-]{1,80}$/.test(value)) {
    throw new Error("Job diagnostic code is invalid");
  }
}
