import { withSensitiveRoute } from "../../../_security.ts";
import { handleStravaCallback } from "../handlers.ts";

export const GET = withSensitiveRoute(
  (security, request) => handleStravaCallback(security, request),
  { cloudHandling: "actor-scoped" },
);
