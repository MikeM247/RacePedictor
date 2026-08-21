import type { ActivityDetail } from "../contracts/activity.ts";
import type { AthleteScope } from "../contracts/auth.ts";
import type { RawObjectMetadata, RawObjectStore } from "./cloud-sync.ts";
import type {
  StravaActivityDetail,
  StravaActivitySummary,
  StravaCanonicalStreamKey,
  StravaLap,
  StravaRawObjectKind,
  StravaStreamSet,
} from "../contracts/strava.ts";

export type StravaPayload<T> = Readonly<{
  /** Strict minimized projection; rawBody remains the untouched provider response. */
  data: T;
  rawBody: Uint8Array;
  capturedAt: string;
  contentType: "application/json";
}>;

export class StravaActivityClientError extends Error {
  readonly status: number | null;
  readonly retryAt: string | null;

  constructor(message: string, options: { status?: number | null; retryAt?: string | null } = {}) {
    super(message);
    this.name = "StravaActivityClientError";
    this.status = options.status ?? null;
    this.retryAt = options.retryAt ?? null;
  }
}

export class StravaActivityPayloadError extends Error {
  constructor(message = "Strava payload could not be projected") {
    super(message);
    this.name = "StravaActivityPayloadError";
  }
}

export interface StravaActivityClient {
  fetchActivityDetail(input: {
    accessToken: string;
    providerActivityId: string;
  }): Promise<StravaPayload<StravaActivityDetail>>;
  fetchActivityLaps(input: {
    accessToken: string;
    providerActivityId: string;
  }): Promise<StravaPayload<readonly StravaLap[]>>;
  fetchActivityStreams(input: {
    accessToken: string;
    providerActivityId: string;
    keys: readonly StravaCanonicalStreamKey[];
  }): Promise<StravaPayload<StravaStreamSet>>;
  listActivities(input: {
    accessToken: string;
    afterEpochSeconds: number;
    beforeEpochSeconds: number;
    page: number;
    perPage: number;
  }): Promise<readonly StravaActivitySummary[]>;
}

export interface StravaCredentialPort {
  getAccessToken(scope: AthleteScope): Promise<string>;
  refreshAccessToken(scope: AthleteScope): Promise<string>;
}

/**
 * The Strava application quota is shared by every athlete. Reservations are
 * made before provider I/O so parallel workers cannot discover a limit only
 * after exceeding it.
 */
export interface StravaReadRequestBudget {
  reserve(input: {
    units: number;
    occurredAt: string;
  }): Promise<
    | Readonly<{ state: "granted" }>
    | Readonly<{ state: "deferred"; retryAt: string }>
  >;
}

export interface ContentDigestPort {
  sha256(input: string | Uint8Array): string;
}

export type StravaReconciliationCandidate = Readonly<{
  providerActivityId: string;
  occurredAt: string;
  sport: ActivityDetail["sport"];
  elapsedTimeS: number;
  distanceM: number;
  elevationGainM: number;
  dedupeHash: string;
}>;

export type StravaReconciliationResolution =
  | Readonly<{ kind: "new" }>
  | Readonly<{
      kind: "existing_provider";
      activityId: string;
      canonicalCreatedAt: string;
      canonicalSource: Pick<ActivityDetail, "sourceType" | "sourceFileId" | "sourceActivityId">;
    }>
  | Readonly<{
      kind: "manual_match";
      activityId: string;
      canonicalCreatedAt: string;
      canonicalSource: Pick<ActivityDetail, "sourceType" | "sourceFileId" | "sourceActivityId">;
    }>
  | Readonly<{ kind: "ambiguous"; candidateCount: number }>;

export interface CanonicalActivityMutationPort {
  resolveTarget(candidate: StravaReconciliationCandidate): Promise<StravaReconciliationResolution>;
  upsert(input: {
    providerActivityId: string;
    activity: ActivityDetail;
    rawObjects: Readonly<Record<StravaRawObjectKind, RawObjectMetadata>>;
    source: "webhook" | "backfill" | "reconciliation";
    aspect: "create" | "update";
    providerObservedAt: string;
    providerCapturedAt: string;
  }): Promise<{
    activity: ActivityDetail;
    revision: number;
    created: boolean;
    changed: boolean;
  }>;
  tombstone(input: {
    providerActivityId: string;
    changedAt: string;
    reason: "provider_delete" | "provider_not_found";
  }): Promise<{
    activityId: string;
    occurredAt: string;
    revision: number;
    changed: boolean;
  }>;
}

export interface TransactionalActivitySyncPort {
  append(input: {
    entityId: string;
    entityRevision: number;
    operation: "upsert" | "delete";
    changedAt: string;
    payload: ActivityDetail | null;
  }): Promise<void>;
}

export interface AnalyticsRecomputePort {
  requestActivityRecompute(input: {
    activityId: string;
    occurredAt: string;
    reason: "activity_upsert" | "activity_delete";
  }): Promise<void>;
}

export type StravaIngestionTransaction = Readonly<{
  activities: CanonicalActivityMutationPort;
  sync: TransactionalActivitySyncPort;
  analytics: AnalyticsRecomputePort;
}>;

export interface StravaIngestionUnitOfWork {
  run<T>(
    scope: AthleteScope,
    operation: (transaction: StravaIngestionTransaction) => Promise<T>,
  ): Promise<T>;
}

export type StravaIngestionDependencies = Readonly<{
  client: StravaActivityClient;
  credentials: StravaCredentialPort;
  requestBudget: StravaReadRequestBudget;
  rawObjects: RawObjectStore;
  unitOfWork: StravaIngestionUnitOfWork;
  digest: ContentDigestPort;
  now(): Date;
}>;
