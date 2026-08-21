import type { AthleteScope } from "../../../core/src/contracts/auth.ts";
import type {
  DurableWebhookEvent,
  WebhookProviderConnection,
  WebhookReceiptRepository,
  WebhookReceiptResult,
} from "../../../core/src/ports/strava-webhooks.ts";
import type { RawObjectMetadata } from "../../../core/src/ports/cloud-sync.ts";

export class InMemoryWebhookReceiptRepository implements WebhookReceiptRepository {
  constructor(options?: { connections?: readonly WebhookProviderConnection[] });
  addConnection(connection: WebhookProviderConnection): void;
  resolveStravaConnection(providerAthleteId: string): Promise<WebhookProviderConnection | null>;
  persistAndEnqueue(scope: AthleteScope, input: {
    connection: WebhookProviderConnection;
    event: DurableWebhookEvent;
    rawObject: RawObjectMetadata;
  }): Promise<WebhookReceiptResult>;
  inspectEvent(scope: AthleteScope, providerEventKey: string): Promise<unknown | null>;
  inspectJob(scope: AthleteScope, jobId: string): Promise<{
    id: string;
    athleteId: string;
    provider: "strava";
    providerEventId: string;
    attempt: number;
    status: string;
  } | null>;
}
