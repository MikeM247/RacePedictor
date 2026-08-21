import {
  getStravaWebhookReceiptService,
  getStravaWebhookVerificationToken,
} from "../../../../../../lib/server/strava-webhook-composition.ts";
import { createStravaWebhookRoute } from "../../../../../../lib/server/strava-webhook-route.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const route = createStravaWebhookRoute({
  getVerificationToken: getStravaWebhookVerificationToken,
  receive: (rawBody) => getStravaWebhookReceiptService().receive(rawBody),
});

export const GET = route.GET;
export const POST = route.POST;
