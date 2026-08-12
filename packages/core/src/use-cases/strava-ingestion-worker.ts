import { athleteScopeFor, buildActorContext, type AthleteScope } from "../contracts/auth.ts";
import {
  stravaBackfillRequestSchema,
  stravaReconciliationRequestSchema,
  type StravaBackfillRequest,
  type StravaReconciliationRequest,
} from "../contracts/strava.ts";
import type {
  ClaimedStravaIngestionJob,
  StravaIngestionJobRepository,
  StravaJobClaimRequest,
} from "../ports/strava-ingestion-worker.ts";
import type {
  StravaBatchResult,
  StravaIngestionService,
} from "../services/strava-ingestion-service.ts";
import type { StravaConnectionService } from "./strava-connection.ts";

export type StravaJobProcessingResult =
  | Readonly<{ state: "not_available" }>
  | Readonly<{
      state: "completed" | "deferred" | "retry" | "terminal" | "dead_letter";
      jobId: string;
      diagnosticCode: string | null;
    }>;

export interface StravaIngestionJobProcessorDependencies {
  jobs: StravaIngestionJobRepository;
  ingestion: Pick<StravaIngestionService, "ingest" | "runBackfill" | "runReconciliation">;
  connections: Pick<StravaConnectionService, "deauthorize">;
  now(): Date;
  createLeaseToken(): string;
  leaseTimeoutSeconds?: number;
  maxAttempts?: number;
}

export class StravaIngestionJobProcessor {
  readonly #dependencies: StravaIngestionJobProcessorDependencies;
  readonly #leaseTimeoutSeconds: number;
  readonly #maxAttempts: number;

  constructor(dependencies: StravaIngestionJobProcessorDependencies) {
    this.#dependencies = dependencies;
    this.#leaseTimeoutSeconds = dependencies.leaseTimeoutSeconds ?? 120;
    this.#maxAttempts = dependencies.maxAttempts ?? 5;
    if (!Number.isInteger(this.#leaseTimeoutSeconds) || this.#leaseTimeoutSeconds < 30 || this.#leaseTimeoutSeconds > 900) {
      throw new Error("Strava ingestion job lease must be between 30 and 900 seconds");
    }
    if (!Number.isInteger(this.#maxAttempts) || this.#maxAttempts < 1 || this.#maxAttempts > 20) {
      throw new Error("Strava ingestion job attempts must be between 1 and 20");
    }
  }

  async enqueueBackfill(scope: AthleteScope, input: StravaBackfillRequest) {
    return this.#dependencies.jobs.enqueueBatch(scope, {
      kind: "backfill",
      request: stravaBackfillRequestSchema.parse(input),
    });
  }

  async enqueueReconciliation(scope: AthleteScope, input: StravaReconciliationRequest) {
    return this.#dependencies.jobs.enqueueBatch(scope, {
      kind: "reconciliation",
      request: stravaReconciliationRequestSchema.parse(input),
    });
  }

  async processNext(workerId: string): Promise<StravaJobProcessingResult> {
    const job = await this.#dependencies.jobs.claimNext(this.#claimRequest(workerId));
    return job ? this.#processClaim(job) : { state: "not_available" };
  }

  /** Stable entry point for Next `after()`/Vercel `waitUntil` composition. */
  async processJob(jobId: string, workerId: string): Promise<StravaJobProcessingResult> {
    const job = await this.#dependencies.jobs.claimById(jobId, this.#claimRequest(workerId));
    return job ? this.#processClaim(job) : { state: "not_available" };
  }

  #claimRequest(workerId: string): StravaJobClaimRequest {
    assertIdentifier(workerId, "Worker id");
    const leaseToken = this.#dependencies.createLeaseToken();
    assertIdentifier(leaseToken, "Lease token");
    return {
      workerId,
      leaseToken,
      claimedAt: this.#dependencies.now().toISOString(),
      leaseTimeoutSeconds: this.#leaseTimeoutSeconds,
      maxAttempts: this.#maxAttempts,
    };
  }

  async #processClaim(job: ClaimedStravaIngestionJob): Promise<StravaJobProcessingResult> {
    const actor = buildActorContext({
      userId: "worker:strava",
      permittedAthleteIds: [job.athleteId],
      activeAthleteId: job.athleteId,
      requestId: `strava-job:${job.id}`.slice(0, 128),
      credentialKind: "internal",
    });
    const scope = athleteScopeFor(actor);

    try {
      if (job.event.kind === "athlete_deauthorization") {
        await this.#dependencies.connections.deauthorize(scope);
        await this.#dependencies.jobs.markCompleted({
          job,
          occurredAt: this.#dependencies.now().toISOString(),
        });
        return { state: "completed", jobId: job.id, diagnosticCode: null };
      }

      if (job.event.kind === "backfill" || job.event.kind === "reconciliation") {
        const outcome = job.event.kind === "backfill"
          ? await this.#dependencies.ingestion.runBackfill(scope, job.event.request, job.event.checkpoint)
          : await this.#dependencies.ingestion.runReconciliation(scope, job.event.request, job.event.checkpoint);
        return this.#settleBatch(job, outcome);
      }

      const outcome = await this.#dependencies.ingestion.ingest(scope, {
        providerActivityId: job.event.providerActivityId,
        aspect: job.event.aspect,
        source: "webhook",
        occurredAt: job.event.occurredAt,
        attempt: job.attempt,
      });
      if (outcome.state === "applied" || outcome.state === "deleted") {
        await this.#dependencies.jobs.markCompleted({
          job,
          occurredAt: this.#dependencies.now().toISOString(),
        });
        return { state: "completed", jobId: job.id, diagnosticCode: null };
      }
      if (outcome.state === "retry") {
        return this.#retryOrDeadLetter(
          job,
          outcome.diagnosticCode,
          outcome.retryAt ?? genericRetryAt(this.#dependencies.now(), job.attempt),
        );
      }
      if (outcome.state === "deferred") {
        return this.#defer(job, outcome.diagnosticCode, outcome.retryAt);
      }
      const diagnosticCode = outcome.diagnosticCode;
      await this.#dependencies.jobs.markTerminal({
        job,
        occurredAt: this.#dependencies.now().toISOString(),
        diagnosticCode,
      });
      return { state: "terminal", jobId: job.id, diagnosticCode };
    } catch {
      return this.#retryOrDeadLetter(job, "STRAVA_WORKER_UNAVAILABLE", genericRetryAt(this.#dependencies.now(), job.attempt));
    }
  }

  async #settleBatch(job: ClaimedStravaIngestionJob, batch: StravaBatchResult): Promise<StravaJobProcessingResult> {
    if (batch.failure?.state === "deferred") {
      return this.#defer(job, batch.failure.diagnosticCode, batch.failure.retryAt, batch.checkpoint);
    }
    if (batch.failure?.state === "terminal") {
      await this.#dependencies.jobs.markTerminal({
        job,
        occurredAt: this.#dependencies.now().toISOString(),
        diagnosticCode: batch.failure.diagnosticCode,
      });
      return { state: "terminal", jobId: job.id, diagnosticCode: batch.failure.diagnosticCode };
    }
    if (batch.failure?.state === "retry") {
      return this.#retryOrDeadLetter(
        job,
        batch.failure.diagnosticCode,
        batch.failure.retryAt ?? genericRetryAt(this.#dependencies.now(), job.attempt),
        batch.checkpoint,
      );
    }

    const terminal = batch.outcomes.find((outcome) => outcome.state === "terminal" || outcome.state === "attention");
    if (terminal && (terminal.state === "terminal" || terminal.state === "attention")) {
      await this.#dependencies.jobs.markTerminal({
        job,
        occurredAt: this.#dependencies.now().toISOString(),
        diagnosticCode: terminal.diagnosticCode,
      });
      return { state: "terminal", jobId: job.id, diagnosticCode: terminal.diagnosticCode };
    }
    const retryOutcome = batch.outcomes.find((outcome) => outcome.state === "retry");
    if (retryOutcome?.state === "retry") {
      return this.#retryOrDeadLetter(
        job,
        retryOutcome.diagnosticCode,
        retryOutcome.retryAt ?? genericRetryAt(this.#dependencies.now(), job.attempt),
        batch.checkpoint,
      );
    }

    await this.#dependencies.jobs.markCompleted({
      job,
      occurredAt: this.#dependencies.now().toISOString(),
    });
    return { state: "completed", jobId: job.id, diagnosticCode: null };
  }

  async #retryOrDeadLetter(
    job: ClaimedStravaIngestionJob,
    diagnosticCode: string,
    availableAt: string,
    checkpoint?: import("../contracts/strava.ts").StravaBatchCheckpoint,
  ): Promise<StravaJobProcessingResult> {
    const occurredAt = this.#dependencies.now().toISOString();
    if (job.attempt >= this.#maxAttempts) {
      await this.#dependencies.jobs.markDeadLetter({ job, occurredAt, diagnosticCode });
      return { state: "dead_letter", jobId: job.id, diagnosticCode };
    }
    await this.#dependencies.jobs.markRetry({ job, occurredAt, diagnosticCode, availableAt, checkpoint });
    return { state: "retry", jobId: job.id, diagnosticCode };
  }

  async #defer(
    job: ClaimedStravaIngestionJob,
    diagnosticCode: "STRAVA_RATE_WINDOW_DEFERRED",
    availableAt: string,
    checkpoint?: import("../contracts/strava.ts").StravaBatchCheckpoint,
  ): Promise<StravaJobProcessingResult> {
    await this.#dependencies.jobs.markDeferred({
      job,
      occurredAt: this.#dependencies.now().toISOString(),
      diagnosticCode,
      availableAt,
      checkpoint,
    });
    return { state: "deferred", jobId: job.id, diagnosticCode };
  }
}

function genericRetryAt(now: Date, attempt: number) {
  const delaySeconds = Math.min(3_600, 60 * 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + delaySeconds * 1_000).toISOString();
}

function assertIdentifier(value: string, label: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,255}$/.test(value)) throw new Error(`${label} is invalid`);
}
