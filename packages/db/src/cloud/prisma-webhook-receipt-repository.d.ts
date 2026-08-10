import type { AthleteScope } from "../../../core/src/contracts/auth.ts";
import type { RawObjectMetadata } from "../../../core/src/ports/cloud-sync.ts";
import type {
  DurableWebhookEvent,
  WebhookProviderConnection,
  WebhookReceiptRepository,
  WebhookReceiptResult,
} from "../../../core/src/ports/strava-webhooks.ts";

export class PrismaWebhookReceiptRepository implements WebhookReceiptRepository {
  constructor(options: { prisma: unknown });
  resolveStravaConnection(providerAthleteId: string): Promise<WebhookProviderConnection | null>;
  persistAndEnqueue(scope: AthleteScope, input: {
    connection: WebhookProviderConnection;
    event: DurableWebhookEvent;
    rawObject: RawObjectMetadata;
  }): Promise<WebhookReceiptResult>;
}
