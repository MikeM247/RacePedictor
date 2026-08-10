import { createHash, timingSafeEqual } from "node:crypto";
import {
  MAX_STRAVA_WEBHOOK_BYTES,
  StravaWebhookReceiptError,
  type StravaWebhookReceipt,
} from "../../../../packages/core/src/use-cases/strava-webhook-receipt.ts";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("strava-webhook-route");

export interface StravaWebhookRouteDependencies {
  getVerificationToken(): string;
  receive(rawBody: Uint8Array): Promise<StravaWebhookReceipt>;
}

export function createStravaWebhookRoute(dependencies: StravaWebhookRouteDependencies) {
  return {
    async GET(request: Request) {
      let expectedToken: string;
      try {
        expectedToken = dependencies.getVerificationToken();
      } catch {
        return webhookFailure(503, "WEBHOOK_UNAVAILABLE");
      }
      const query = new URL(request.url).searchParams;
      const mode = query.get("hub.mode");
      const challenge = query.get("hub.challenge");
      const providedToken = query.get("hub.verify_token");
      if (
        mode !== "subscribe"
        || !challenge
        || challenge.length > 512
        || !providedToken
        || !constantTimeEqual(providedToken, expectedToken)
      ) {
        return webhookFailure(403, "WEBHOOK_VERIFICATION_FAILED");
      }
      return Response.json({ "hub.challenge": challenge }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    },

    async POST(request: Request) {
      const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
      const declaredLength = Number(request.headers.get("content-length"));
      if (
        !/^application\/json(?:\s*;|$)/.test(contentType)
        || (Number.isFinite(declaredLength) && declaredLength > MAX_STRAVA_WEBHOOK_BYTES)
      ) {
        return webhookFailure(400, "INVALID_WEBHOOK");
      }

      try {
        const rawBody = new Uint8Array(await request.arrayBuffer());
        await dependencies.receive(rawBody);
        return Response.json({}, { status: 200, headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        if (error instanceof StravaWebhookReceiptError) {
          if (error.code === "INVALID_WEBHOOK") return webhookFailure(400, error.code);
          // A validly-shaped event never reveals whether a provider athlete,
          // event key, or storage object exists. Strava will retry this single
          // receipt-failure response while internal diagnostics retain cause.
          return webhookFailure(503, "WEBHOOK_RECEIPT_FAILED");
        }
        return webhookFailure(503, "WEBHOOK_UNAVAILABLE");
      }
    },
  };
}

function constantTimeEqual(provided: string, expected: string) {
  if (!expected || expected.length > 512) return false;
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function webhookFailure(status: number, code: string) {
  return Response.json({ error: { code, message: "Webhook request was not accepted", details: [] } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
