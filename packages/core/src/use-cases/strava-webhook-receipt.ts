import { createHash } from "node:crypto";
import { athleteScopeFor, buildActorContext } from "../contracts/auth.ts";
import {
  stravaWebhookEventSchema,
  type StravaWebhookEvent,
} from "../contracts/strava-webhooks.ts";
import type { RawObjectStore } from "../ports/cloud-sync.ts";
import type {
  WebhookReceiptRepository,
  WebhookReceiptResult,
} from "../ports/strava-webhooks.ts";
import type { DurableWebhookJobScheduler } from "../ports/strava-ingestion-worker.ts";

export const MAX_STRAVA_WEBHOOK_BYTES = 64 * 1024;

export class StravaWebhookReceiptError extends Error {
  readonly code:
    | "INVALID_WEBHOOK"
    | "UNRESOLVED_CONNECTION"
    | "WEBHOOK_CONFLICT"
    | "WEBHOOK_UNAVAILABLE";

  constructor(
    code: StravaWebhookReceiptError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StravaWebhookReceiptError";
    this.code = code;
  }
}

export interface StravaWebhookReceiptDependencies {
  receiptRepository: WebhookReceiptRepository;
  rawObjectStore: RawObjectStore;
  expectedSubscriptionId?: number;
  now?: () => Date;
  jobScheduler?: DurableWebhookJobScheduler;
}

export type StravaWebhookReceipt = Readonly<WebhookReceiptResult & {
  providerEventKey: string;
  eventKind: "activity_create" | "activity_update" | "activity_delete" | "athlete_deauthorization";
}>;

export class StravaWebhookReceiptService {
  readonly #receiptRepository: WebhookReceiptRepository;
  readonly #rawObjectStore: RawObjectStore;
  readonly #expectedSubscriptionId: number | null;
  readonly #now: () => Date;
  readonly #jobScheduler: DurableWebhookJobScheduler | null;

  constructor({
    receiptRepository,
    rawObjectStore,
    expectedSubscriptionId,
    now = () => new Date(),
    jobScheduler,
  }: StravaWebhookReceiptDependencies) {
    this.#receiptRepository = receiptRepository;
    this.#rawObjectStore = rawObjectStore;
    if (expectedSubscriptionId !== undefined && (!Number.isSafeInteger(expectedSubscriptionId) || expectedSubscriptionId < 1)) {
      throw new Error("Expected Strava webhook subscription id is invalid");
    }
    this.#expectedSubscriptionId = expectedSubscriptionId ?? null;
    this.#now = now;
    this.#jobScheduler = jobScheduler ?? null;
  }

  async receive(rawBody: Uint8Array): Promise<StravaWebhookReceipt> {
    if (!(rawBody instanceof Uint8Array) || rawBody.byteLength === 0 || rawBody.byteLength > MAX_STRAVA_WEBHOOK_BYTES) {
      throw new StravaWebhookReceiptError("INVALID_WEBHOOK", "Webhook body is invalid");
    }

    const event = parseStravaWebhookEvent(rawBody);
    if (this.#expectedSubscriptionId !== null && event.subscription_id !== this.#expectedSubscriptionId) {
      throw new StravaWebhookReceiptError("INVALID_WEBHOOK", "Webhook event is not recognized");
    }
    const providerAthleteId = String(event.owner_id);
    const connection = await this.#receiptRepository.resolveStravaConnection(providerAthleteId);
    if (!connection || connection.providerAthleteId !== providerAthleteId) {
      throw new StravaWebhookReceiptError("UNRESOLVED_CONNECTION", "Webhook connection is not available");
    }

    const providerEventKey = createProviderEventKey(event);
    const payloadChecksumSha256 = sha256(rawBody);
    const actor = buildActorContext({
      userId: "provider:strava",
      permittedAthleteIds: [connection.athleteId],
      activeAthleteId: connection.athleteId,
      requestId: `strava:${providerEventKey.slice(0, 40)}`,
      credentialKind: "internal",
    });
    const scope = athleteScopeFor(actor);
    const occurredAt = new Date(event.event_time * 1000).toISOString();
    const capturedAt = this.#now().toISOString();
    const key = rawWebhookObjectKey(connection.athleteId, providerEventKey);
    const rawObject = {
      athleteId: connection.athleteId,
      provider: "strava" as const,
      key,
      checksumSha256: payloadChecksumSha256,
      contentType: "application/json",
      sizeBytes: rawBody.byteLength,
      capturedAt,
    };

    try {
      // The raw body is never stored in the structured database. A successful
      // acknowledgement is issued only after immutable storage and the durable
      // event/job transaction have both succeeded.
      const persistedRawObject = await this.#rawObjectStore.put(scope, { metadata: rawObject, body: rawBody });
      const result = await this.#receiptRepository.persistAndEnqueue(scope, {
        connection,
        event: {
          providerEventKey,
          payloadChecksumSha256,
          event,
          occurredAt,
        },
        rawObject: persistedRawObject,
      });
      try {
        // Registration is synchronous: a Next `after()`/Vercel `waitUntil`
        // adapter owns the promise. Durable polling remains authoritative.
        this.#jobScheduler?.schedule(result.jobId);
      } catch {
        // Scheduling is an acceleration only. The committed queued job must
        // still be acknowledged so a later worker can recover it.
      }
      return {
        ...result,
        providerEventKey,
        eventKind: eventKind(event),
      };
    } catch (error) {
      if (error instanceof StravaWebhookReceiptError) throw error;
      const message = error instanceof Error ? error.message : "";
      const code = /immutable|conflict|checksum/i.test(message)
        ? "WEBHOOK_CONFLICT"
        : "WEBHOOK_UNAVAILABLE";
      throw new StravaWebhookReceiptError(code, "Webhook could not be persisted", { cause: error });
    }
  }
}

export function parseStravaWebhookEvent(rawBody: Uint8Array): StravaWebhookEvent {
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch (error) {
    throw new StravaWebhookReceiptError("INVALID_WEBHOOK", "Webhook body is invalid", { cause: error });
  }

  const parsed = stravaWebhookEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new StravaWebhookReceiptError("INVALID_WEBHOOK", "Webhook event is not recognized");
  }
  return parsed.data;
}

/**
 * Strava does not provide a delivery id. This collision key intentionally
 * excludes update values, allowing a retry with altered content to be caught
 * by the immutable raw-object checksum instead of accepted as a new event.
 */
export function createProviderEventKey(event: StravaWebhookEvent) {
  const updateShape = Object.keys(event.updates).sort().join(",");
  return sha256(new TextEncoder().encode([
    event.subscription_id,
    event.owner_id,
    event.object_type,
    event.object_id,
    event.aspect_type,
    event.event_time,
    updateShape,
  ].join(":")));
}

export function rawWebhookObjectKey(athleteId: string, providerEventKey: string) {
  return `athletes/${athleteId}/providers/strava/webhooks/${providerEventKey}.json`;
}

function eventKind(event: StravaWebhookEvent): StravaWebhookReceipt["eventKind"] {
  if (event.object_type === "athlete") return "athlete_deauthorization";
  return `activity_${event.aspect_type}`;
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
