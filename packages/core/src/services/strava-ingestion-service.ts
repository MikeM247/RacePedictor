import { z } from "zod";
import { activityDetailSchema, type ActivityDetail } from "../contracts/activity.ts";
import type { AthleteScope } from "../contracts/auth.ts";
import {
  STRAVA_CANONICAL_STREAM_KEYS,
  stravaActivityDetailSchema,
  stravaActivitySummaryPageSchema,
  stravaBatchCheckpointSchema,
  stravaBackfillRequestSchema,
  stravaIngestionEventSchema,
  stravaLapsSchema,
  stravaReconciliationRequestSchema,
  stravaStreamSetSchema,
  type StravaBackfillRequest,
  type StravaBatchCheckpoint,
  type StravaIngestionEvent,
  type StravaRawObjectKind,
  type StravaReconciliationRequest,
} from "../contracts/strava.ts";
import type { RawObjectMetadata } from "../ports/cloud-sync.ts";
import {
  StravaActivityClientError,
  StravaActivityPayloadError,
  type StravaIngestionDependencies,
  type StravaPayload,
} from "../ports/strava-ingestion.ts";
import {
  createStravaReconciliationCandidate,
  mapStravaActivity,
} from "./strava-activity-mapper.ts";

export type StravaIngestionOutcome =
  | Readonly<{
      state: "applied";
      activityId: string;
      revision: number;
      created: boolean;
      changed: boolean;
      rawObjectKeys: readonly string[];
    }>
  | Readonly<{
      state: "deleted";
      activityId: string;
      revision: number;
      changed: boolean;
    }>
  | Readonly<{
      state: "attention";
      diagnosticCode: "AMBIGUOUS_CROSS_SOURCE_MATCH";
      candidateCount: number;
      rawObjectKeys: readonly string[];
    }>
  | StravaIngestionDeferred
  | StravaIngestionFailure;

export type StravaIngestionFailure = Readonly<{
  state: "retry" | "terminal";
  diagnosticCode: string;
  retryAt: string | null;
}>;

export type StravaIngestionDeferred = Readonly<{
  state: "deferred";
  diagnosticCode: "STRAVA_RATE_WINDOW_DEFERRED";
  retryAt: string;
}>;

export type StravaBatchResult = Readonly<{
  source: "backfill" | "reconciliation";
  pagesFetched: number;
  activitiesDiscovered: number;
  checkpoint: StravaBatchCheckpoint;
  outcomes: readonly StravaIngestionOutcome[];
  truncated: boolean;
  failure: StravaIngestionFailure | StravaIngestionDeferred | null;
}>;

class StravaAuthenticationFailure extends Error {}
class StravaPayloadFailure extends Error {}

export class StravaIngestionService {
  readonly #dependencies: StravaIngestionDependencies;

  constructor(dependencies: StravaIngestionDependencies) {
    this.#dependencies = dependencies;
  }

  async ingest(scope: AthleteScope, eventInput: StravaIngestionEvent): Promise<StravaIngestionOutcome> {
    const parsedEvent = stravaIngestionEventSchema.safeParse(eventInput);
    if (!parsedEvent.success) return terminal("STRAVA_EVENT_INVALID");
    const event = parsedEvent.data;
    if (event.aspect === "delete") {
      return this.#applyDeletion(scope, event, "provider_delete");
    }
    const upsertAspect = event.aspect;

    const reservation = await this.#reserve(3);
    if (reservation.state === "deferred") return reservation;

    let access: AccessSession;
    try {
      access = await this.#createAccessSession(scope);
    } catch {
      return terminal("STRAVA_REAUTH_REQUIRED");
    }

    let detailPayload: Awaited<ReturnType<StravaIngestionDependencies["client"]["fetchActivityDetail"]>>;
    try {
      detailPayload = await access.call((accessToken) => this.#dependencies.client.fetchActivityDetail({
        accessToken,
        providerActivityId: event.providerActivityId,
      }));
    } catch (error) {
      if (error instanceof StravaActivityClientError && error.status === 404) {
        return this.#applyDeletion(scope, event, "provider_not_found");
      }
      return classifyClientFailure(error, event.attempt, this.#dependencies.now());
    }

    let detail;
    try {
      detail = stravaActivityDetailSchema.parse(detailPayload.data);
      assertPayloadEnvelope(detailPayload);
      if (detail.id !== event.providerActivityId) throw new StravaPayloadFailure();
    } catch {
      return terminal("STRAVA_PAYLOAD_INVALID");
    }

    const rawObjects = {} as Record<StravaRawObjectKind, RawObjectMetadata>;
    try {
      rawObjects.detail = await this.#storeRaw(scope, event.providerActivityId, "detail", detailPayload);
    } catch {
      return retry("RAW_OBJECT_STORE_UNAVAILABLE", retryTime(this.#dependencies.now(), event.attempt));
    }

    let lapsPayload: Awaited<ReturnType<StravaIngestionDependencies["client"]["fetchActivityLaps"]>>;
    let streamsPayload: Awaited<ReturnType<StravaIngestionDependencies["client"]["fetchActivityStreams"]>>;
    try {
      lapsPayload = await access.call((accessToken) => this.#dependencies.client.fetchActivityLaps({
        accessToken,
        providerActivityId: event.providerActivityId,
      }));
      streamsPayload = await access.call((accessToken) => this.#dependencies.client.fetchActivityStreams({
        accessToken,
        providerActivityId: event.providerActivityId,
        keys: STRAVA_CANONICAL_STREAM_KEYS,
      }));
    } catch (error) {
      return classifyClientFailure(error, event.attempt, this.#dependencies.now());
    }

    let laps;
    let streams;
    try {
      laps = stravaLapsSchema.parse(lapsPayload.data);
      streams = stravaStreamSetSchema.parse(streamsPayload.data);
      assertPayloadEnvelope(lapsPayload);
      assertPayloadEnvelope(streamsPayload);
    } catch {
      return terminal("STRAVA_PAYLOAD_INVALID");
    }

    try {
      rawObjects.laps = await this.#storeRaw(scope, event.providerActivityId, "laps", lapsPayload);
      rawObjects.streams = await this.#storeRaw(scope, event.providerActivityId, "streams", streamsPayload);
    } catch {
      return retry("RAW_OBJECT_STORE_UNAVAILABLE", retryTime(this.#dependencies.now(), event.attempt));
    }

    const rawObjectKeys = [rawObjects.detail.key, rawObjects.laps.key, rawObjects.streams.key];
    try {
      return await this.#dependencies.unitOfWork.run(scope, async (transaction) => {
        const candidate = createStravaReconciliationCandidate(scope.athleteId, detail, this.#dependencies.digest);
        const resolution = await transaction.activities.resolveTarget(candidate);
        if (resolution.kind === "ambiguous") {
          return {
            state: "attention" as const,
            diagnosticCode: "AMBIGUOUS_CROSS_SOURCE_MATCH" as const,
            candidateCount: resolution.candidateCount,
            rawObjectKeys,
          };
        }

        const activityId = resolution.kind === "new"
          ? `activity_strava_${event.providerActivityId}`
          : resolution.activityId;
        const canonicalCreatedAt = resolution.kind === "new"
          ? this.#dependencies.now().toISOString()
          : resolution.canonicalCreatedAt;
        const mappedActivity = mapStravaActivity({
          athleteId: scope.athleteId,
          activityId,
          canonicalCreatedAt,
          detail,
          laps,
          streams,
          digest: this.#dependencies.digest,
        });
        const activity = activityDetailSchema.parse(resolution.kind !== "new"
          ? { ...mappedActivity, ...resolution.canonicalSource }
          : mappedActivity) as ActivityDetail;
        const result = await transaction.activities.upsert({
          providerActivityId: event.providerActivityId,
          activity,
          rawObjects,
          source: event.source,
          aspect: upsertAspect,
          providerObservedAt: event.occurredAt,
          providerCapturedAt: detailPayload.capturedAt,
        });
        if (result.changed) {
          await transaction.sync.append({
            entityId: result.activity.id,
            entityRevision: result.revision,
            operation: "upsert",
            changedAt: event.occurredAt,
            payload: result.activity,
          });
          await transaction.analytics.requestActivityRecompute({
            activityId: result.activity.id,
            occurredAt: result.activity.occurredAt,
            reason: "activity_upsert",
          });
        }
        return {
          state: "applied" as const,
          activityId: result.activity.id,
          revision: result.revision,
          created: result.created,
          changed: result.changed,
          rawObjectKeys,
        };
      });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof StravaPayloadFailure) {
        return terminal("STRAVA_MAPPING_INVALID");
      }
      return retry("CANONICAL_TRANSACTION_UNAVAILABLE", retryTime(this.#dependencies.now(), event.attempt));
    }
  }

  async runBackfill(
    scope: AthleteScope,
    input: StravaBackfillRequest,
    checkpointInput?: StravaBatchCheckpoint,
  ): Promise<StravaBatchResult> {
    const parsed = stravaBackfillRequestSchema.safeParse(input);
    if (!parsed.success) return invalidBatch("backfill");
    return this.#runPaged(scope, parsed.data, "backfill", checkpointInput);
  }

  async runReconciliation(
    scope: AthleteScope,
    input: StravaReconciliationRequest,
    checkpointInput?: StravaBatchCheckpoint,
  ): Promise<StravaBatchResult> {
    const parsed = stravaReconciliationRequestSchema.safeParse(input);
    if (!parsed.success) return invalidBatch("reconciliation");
    return this.#runPaged(scope, parsed.data, "reconciliation", checkpointInput);
  }

  async #runPaged(
    scope: AthleteScope,
    input: { after: string; before: string; pageSize: number; maxPages: number; maxActivities: number },
    source: "backfill" | "reconciliation",
    checkpointInput?: StravaBatchCheckpoint,
  ): Promise<StravaBatchResult> {
    let checkpoint: BatchCheckpoint;
    try {
      checkpoint = readCheckpoint(checkpointInput, input);
    } catch {
      return invalidBatch(source);
    }
    let access: AccessSession | null = null;

    const outcomes: StravaIngestionOutcome[] = [];
    while (
      checkpoint.pendingActivityIds.length > 0
      || (!checkpoint.exhausted && checkpoint.nextPage <= input.maxPages && checkpoint.seenActivityIds.size < input.maxActivities)
    ) {
      if (checkpoint.pendingActivityIds.length === 0) {
        const reservation = await this.#reserve(1);
        if (reservation.state === "deferred") return batchResult(source, checkpoint, outcomes, reservation, true);
        if (!access) {
          try {
            access = await this.#createAccessSession(scope);
          } catch {
            return { ...invalidBatch(source), failure: terminal("STRAVA_REAUTH_REQUIRED") };
          }
        }
        let summaries;
        try {
          const response = await access.call((accessToken) => this.#dependencies.client.listActivities({
            accessToken,
            afterEpochSeconds: Math.floor(Date.parse(input.after) / 1_000),
            beforeEpochSeconds: Math.floor(Date.parse(input.before) / 1_000),
            page: checkpoint.nextPage,
            perPage: input.pageSize,
          }));
          summaries = stravaActivitySummaryPageSchema.parse(response);
        } catch (error) {
          return batchResult(
            source,
            checkpoint,
            outcomes,
            error instanceof z.ZodError ? terminal("STRAVA_PAYLOAD_INVALID") : classifyClientFailure(error, 1, this.#dependencies.now()),
            true,
          );
        }

        checkpoint.pagesFetched += 1;
        checkpoint.nextPage += 1;
        for (const summary of summaries) {
          if (checkpoint.seenActivityIds.size >= input.maxActivities) break;
          if (checkpoint.seenActivityIds.has(summary.id)) continue;
          checkpoint.seenActivityIds.add(summary.id);
          if (!checkpoint.completedActivityIds.has(summary.id)) checkpoint.pendingActivityIds.push(summary.id);
        }
        checkpoint.exhausted = summaries.length < input.pageSize;
      }

      while (checkpoint.pendingActivityIds.length > 0) {
        const providerActivityId = checkpoint.pendingActivityIds[0];
        const outcome = await this.ingest(scope, {
          providerActivityId,
          aspect: "create",
          source,
          occurredAt: this.#dependencies.now().toISOString(),
          attempt: 1,
        });
        outcomes.push(outcome);
        if (outcome.state === "applied" || outcome.state === "deleted") {
          checkpoint.completedActivityIds.add(providerActivityId);
          checkpoint.pendingActivityIds.shift();
          continue;
        }
        return batchResult(
          source,
          checkpoint,
          outcomes,
          outcome.state === "retry" || outcome.state === "terminal" || outcome.state === "deferred" ? outcome : null,
          true,
        );
      }
    }

    return batchResult(source, checkpoint, outcomes, null, checkpoint.pendingActivityIds.length > 0 || !checkpoint.exhausted);
  }

  async #applyDeletion(
    scope: AthleteScope,
    event: StravaIngestionEvent,
    reason: "provider_delete" | "provider_not_found",
  ): Promise<StravaIngestionOutcome> {
    try {
      return await this.#dependencies.unitOfWork.run(scope, async (transaction) => {
        const result = await transaction.activities.tombstone({
          providerActivityId: event.providerActivityId,
          changedAt: event.occurredAt,
          reason,
        });
        if (result.changed) {
          await transaction.sync.append({
            entityId: result.activityId,
            entityRevision: result.revision,
            operation: "delete",
            changedAt: event.occurredAt,
            payload: null,
          });
          await transaction.analytics.requestActivityRecompute({
            activityId: result.activityId,
            occurredAt: result.occurredAt,
            reason: "activity_delete",
          });
        }
        return {
          state: "deleted" as const,
          activityId: result.activityId,
          revision: result.revision,
          changed: result.changed,
        };
      });
    } catch {
      return retry("CANONICAL_TRANSACTION_UNAVAILABLE", retryTime(this.#dependencies.now(), event.attempt));
    }
  }

  async #createAccessSession(scope: AthleteScope): Promise<AccessSession> {
    let token = await this.#dependencies.credentials.getAccessToken(scope);
    if (!token) throw new StravaAuthenticationFailure();
    let refreshed = false;
    return {
      call: async <T>(operation: (accessToken: string) => Promise<T>) => {
        try {
          return await operation(token);
        } catch (error) {
          if (!(error instanceof StravaActivityClientError) || error.status !== 401 || refreshed) throw error;
          refreshed = true;
          try {
            token = await this.#dependencies.credentials.refreshAccessToken(scope);
          } catch {
            throw new StravaAuthenticationFailure();
          }
          if (!token) throw new StravaAuthenticationFailure();
          try {
            return await operation(token);
          } catch (retryError) {
            if (retryError instanceof StravaActivityClientError && retryError.status === 401) {
              throw new StravaAuthenticationFailure();
            }
            throw retryError;
          }
        }
      },
    };
  }

  async #reserve(units: number) {
    const reservation = await this.#dependencies.requestBudget.reserve({
      units,
      occurredAt: this.#dependencies.now().toISOString(),
    });
    if (reservation.state === "granted") return reservation;
    if (
      reservation.state === "deferred"
      && !Number.isNaN(Date.parse(reservation.retryAt))
      && Date.parse(reservation.retryAt) > this.#dependencies.now().getTime()
    ) {
      return {
        state: "deferred" as const,
        diagnosticCode: "STRAVA_RATE_WINDOW_DEFERRED" as const,
        retryAt: reservation.retryAt,
      };
    }
    throw new Error("Strava request budget returned an invalid reservation");
  }

  async #storeRaw<T>(
    scope: AthleteScope,
    providerActivityId: string,
    kind: StravaRawObjectKind,
    payload: StravaPayload<T>,
  ) {
    assertPayloadEnvelope(payload);
    const checksumSha256 = this.#dependencies.digest.sha256(payload.rawBody);
    if (!/^[a-f0-9]{64}$/.test(checksumSha256)) throw new Error("Invalid checksum digest");
    const key = [
      `athletes/${scope.athleteId}/providers/strava/activities`,
      providerActivityId,
      kind,
      `${checksumSha256}.json`,
    ].join("/");
    const existing = await this.#dependencies.rawObjects.head(scope, key);
    if (existing) {
      if (existing.checksumSha256 !== checksumSha256 || existing.sizeBytes !== payload.rawBody.byteLength) {
        throw new Error("Existing raw object metadata does not match its content address");
      }
      return existing;
    }
    const metadata: RawObjectMetadata = {
      athleteId: scope.athleteId,
      provider: "strava",
      key,
      checksumSha256,
      contentType: payload.contentType,
      sizeBytes: payload.rawBody.byteLength,
      capturedAt: new Date(payload.capturedAt).toISOString(),
    };
    return this.#dependencies.rawObjects.put(scope, { metadata, body: payload.rawBody });
  }
}

type AccessSession = {
  call<T>(operation: (accessToken: string) => Promise<T>): Promise<T>;
};

function assertPayloadEnvelope<T>(payload: StravaPayload<T>) {
  if (!(payload.rawBody instanceof Uint8Array)) throw new StravaPayloadFailure();
  if (payload.contentType !== "application/json") throw new StravaPayloadFailure();
  if (Number.isNaN(Date.parse(payload.capturedAt))) throw new StravaPayloadFailure();
}

function terminal(diagnosticCode: string): StravaIngestionFailure {
  return { state: "terminal", diagnosticCode, retryAt: null };
}

function retry(diagnosticCode: string, retryAt: string): StravaIngestionFailure {
  return { state: "retry", diagnosticCode, retryAt };
}

function classifyClientFailure(error: unknown, attempt: number, now: Date): StravaIngestionFailure {
  if (error instanceof StravaAuthenticationFailure) return terminal("STRAVA_REAUTH_REQUIRED");
  if (error instanceof StravaActivityPayloadError) return terminal("STRAVA_PAYLOAD_INVALID");
  if (error instanceof StravaActivityClientError) {
    if (error.status === 401) return terminal("STRAVA_REAUTH_REQUIRED");
    if (error.status === 429) {
      const providerRetryAt = error.retryAt && !Number.isNaN(Date.parse(error.retryAt))
        ? new Date(error.retryAt).toISOString()
        : nextQuarterHour(now);
      return retry("STRAVA_RATE_LIMITED", providerRetryAt);
    }
    if (error.status === null || error.status >= 500) {
      return retry("STRAVA_UNAVAILABLE", retryTime(now, attempt));
    }
    if (error.status === 404) return terminal("STRAVA_PAYLOAD_UNAVAILABLE");
    return terminal(error.status === 403 ? "STRAVA_ACCESS_DENIED" : "STRAVA_REQUEST_REJECTED");
  }
  return retry("STRAVA_UNAVAILABLE", retryTime(now, attempt));
}

function retryTime(now: Date, attempt: number) {
  const delaySeconds = Math.min(3_600, 60 * 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + delaySeconds * 1_000).toISOString();
}

function nextQuarterHour(now: Date) {
  const interval = 15 * 60 * 1_000;
  return new Date((Math.floor(now.getTime() / interval) + 1) * interval + 5_000).toISOString();
}

function invalidBatch(source: "backfill" | "reconciliation"): StravaBatchResult {
  return {
    source,
    pagesFetched: 0,
    activitiesDiscovered: 0,
    checkpoint: checkpointDto(initialCheckpoint()),
    outcomes: [],
    truncated: false,
    failure: terminal("STRAVA_WINDOW_INVALID"),
  };
}

type BatchCheckpoint = {
  version: 1;
  nextPage: number;
  pendingActivityIds: string[];
  seenActivityIds: Set<string>;
  completedActivityIds: Set<string>;
  pagesFetched: number;
  exhausted: boolean;
};

function initialCheckpoint(): BatchCheckpoint {
  return {
    version: 1,
    nextPage: 1,
    pendingActivityIds: [],
    seenActivityIds: new Set<string>(),
    completedActivityIds: new Set<string>(),
    pagesFetched: 0,
    exhausted: false,
  };
}

function readCheckpoint(input: StravaBatchCheckpoint | undefined, request: { maxPages: number; maxActivities: number }) {
  if (input === undefined) return initialCheckpoint();
  const parsed = stravaBatchCheckpointSchema.parse(input);
  if (parsed.nextPage > request.maxPages + 1 || parsed.pagesFetched !== parsed.nextPage - 1) {
    throw new Error("Strava batch checkpoint page state is invalid");
  }
  if (parsed.activitiesDiscovered !== parsed.seenActivityIds.length || parsed.activitiesDiscovered > request.maxActivities) {
    throw new Error("Strava batch checkpoint discovery state is invalid");
  }
  if (parsed.pendingActivityIds.length > 0 && parsed.exhausted && parsed.nextPage > request.maxPages + 1) {
    throw new Error("Strava batch checkpoint terminal state is invalid");
  }
  const seen = uniqueIdSet(parsed.seenActivityIds);
  const completed = uniqueIdSet(parsed.completedActivityIds);
  const pending = uniqueIdSet(parsed.pendingActivityIds);
  for (const id of [...completed, ...pending]) {
    if (!seen.has(id)) throw new Error("Strava batch checkpoint references an undiscovered activity");
  }
  for (const id of pending) {
    if (completed.has(id)) throw new Error("Strava batch checkpoint repeats a completed activity");
  }
  return {
    version: 1 as const,
    nextPage: parsed.nextPage,
    pendingActivityIds: [...parsed.pendingActivityIds],
    seenActivityIds: seen,
    completedActivityIds: completed,
    pagesFetched: parsed.pagesFetched,
    exhausted: parsed.exhausted,
  };
}

function uniqueIdSet(ids: readonly string[]) {
  const result = new Set(ids);
  if (result.size !== ids.length) throw new Error("Strava batch checkpoint contains duplicate activity IDs");
  return result;
}

function checkpointDto(checkpoint: BatchCheckpoint): StravaBatchCheckpoint {
  return stravaBatchCheckpointSchema.parse({
    version: checkpoint.version,
    nextPage: checkpoint.nextPage,
    pendingActivityIds: checkpoint.pendingActivityIds,
    seenActivityIds: [...checkpoint.seenActivityIds].sort((left, right) => left.localeCompare(right)),
    completedActivityIds: [...checkpoint.completedActivityIds].sort((left, right) => left.localeCompare(right)),
    pagesFetched: checkpoint.pagesFetched,
    activitiesDiscovered: checkpoint.seenActivityIds.size,
    exhausted: checkpoint.exhausted,
  });
}

function batchResult(
  source: "backfill" | "reconciliation",
  checkpoint: BatchCheckpoint,
  outcomes: readonly StravaIngestionOutcome[],
  failure: StravaIngestionFailure | StravaIngestionDeferred | null,
  truncated: boolean,
): StravaBatchResult {
  return {
    source,
    pagesFetched: checkpoint.pagesFetched,
    activitiesDiscovered: checkpoint.seenActivityIds.size,
    checkpoint: checkpointDto(checkpoint),
    outcomes,
    truncated,
    failure,
  };
}
