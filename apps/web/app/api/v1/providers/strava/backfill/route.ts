import { withSensitiveRoute } from "../../../_security.ts";
import { handleStravaBackfill, handleStravaBackfillStatus } from "../handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(
  (security, request) => handleStravaBackfillStatus(security, request),
  { cloudHandling: "actor-scoped" },
);

export const POST = withSensitiveRoute(
  (security, request) => handleStravaBackfill(security, request),
  { cloudHandling: "actor-scoped" },
);
