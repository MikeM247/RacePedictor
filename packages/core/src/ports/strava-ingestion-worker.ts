import type { AthleteScope } from "../contracts/auth.ts";
import type {
  StravaBackfillWindow,
  StravaReconciliationWindow,
} from "../contracts/strava.ts";

export type StravaIngestionJobEvent =
  | Readonly<{
      kind: "activity";
      providerActivityId: string;
      aspect: "create" | "update" | "delete";
      occurredAt: string;
    }>
  | Readonly<{
      kind: "athlete_deauthorization";
      occurredAt: string;
    }>
  | Readonly<{
      kind: "backfill";
      request: StravaBackfillWindow;
    }>
  | Readonly<{
      kind: "reconciliation";
      request: StravaReconciliationWindow;
    }>;

export type ClaimedStravaIngestionJob = Readonly<{
  id: string;
  athleteId: string;
  webhookEventId: string | null;
  attempt: number;
  leaseToken: string;
  event: StravaIngestionJobEvent;
}>;

export type StravaJobClaimRequest = Readonly<{
  workerId: string;
  leaseToken: string;
  claimedAt: string;
  leaseTimeoutSeconds: number;
  maxAttempts: number;
}>;

export type StravaJobCompletion = Readonly<{
  job: ClaimedStravaIngestionJob;
  occurredAt: string;
}>;

export type StravaJobFailure = StravaJobCompletion & Readonly<{
  diagnosticCode: string;
}>;

/** Durable state transitions must compare the claim's lease token. */
export interface StravaIngestionJobRepository {
  enqueueBatch(
    scope: AthleteScope,
    input:
      | { kind: "backfill"; request: StravaBackfillWindow }
      | { kind: "reconciliation"; request: StravaReconciliationWindow },
  ): Promise<Readonly<{ jobId: string; reused: boolean }>>;
  claimNext(input: StravaJobClaimRequest): Promise<ClaimedStravaIngestionJob | null>;
  claimById(jobId: string, input: StravaJobClaimRequest): Promise<ClaimedStravaIngestionJob | null>;
  markCompleted(input: StravaJobCompletion): Promise<void>;
  markRetry(input: StravaJobFailure & { availableAt: string }): Promise<void>;
  markTerminal(input: StravaJobFailure): Promise<void>;
  markDeadLetter(input: StravaJobFailure): Promise<void>;
}

/** Inject Next `after()` or Vercel `waitUntil` at the composition root. */
export interface DurableWebhookJobScheduler {
  schedule(jobId: string): void;
}
