import { withSensitiveRoute } from "../../../_security.ts";
import { handleStravaDisconnect } from "../handlers.ts";

export const POST = withSensitiveRoute(
  (security, request) => handleStravaDisconnect(security, request),
  { cloudHandling: "actor-scoped" },
);
