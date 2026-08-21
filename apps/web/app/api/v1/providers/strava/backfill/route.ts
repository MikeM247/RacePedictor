import { withSensitiveRoute } from "../../../_security.ts";
import { handleStravaBackfill } from "../handlers.ts";

export const POST = withSensitiveRoute(
  (security, request) => handleStravaBackfill(security, request),
  { cloudHandling: "actor-scoped" },
);
