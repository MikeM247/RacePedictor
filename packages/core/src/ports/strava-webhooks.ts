import type { AthleteScope } from "../contracts/auth.ts";
import type { StravaWebhookEvent } from "../contracts/strava-webhooks.ts";
import type { RawObjectMetadata } from "./cloud-sync.ts";

export type WebhookProviderConnection = Readonly<{
  id: string;
  athleteId: string;
  providerAthleteId: string;
  status: "connected" | "attention";
}>;

export type DurableWebhookEvent = Readonly<{
  providerEventKey: string;
  payloadChecksumSha256: string;
  event: StravaWebhookEvent;
  occurredAt: string;
}>;

export type WebhookReceiptResult = Readonly<{
  eventId: string;
  jobId: string;
  reused: boolean;
}>;

export interface WebhookConnectionResolver {
  resolveStravaConnection(providerAthleteId: string): Promise<WebhookProviderConnection | null>;
}
/** Persists the event, raw-object metadata, and one durable job atomically. */
export interface WebhookReceiptRepository extends WebhookConnectionResolver {
  persistAndEnqueue(
    scope: AthleteScope,
    input: {
      connection: WebhookProviderConnection;
      event: DurableWebhookEvent;
      rawObject: RawObjectMetadata;
    },
  ): Promise<WebhookReceiptResult>;
}
