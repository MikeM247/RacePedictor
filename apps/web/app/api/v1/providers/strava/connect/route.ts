import { withSensitiveRoute } from "../../../_security.ts";
import { handleStravaConnect } from "../handlers.ts";

export const POST = withSensitiveRoute(
  (security, request) => handleStravaConnect(security, request),
  { cloudHandling: "actor-scoped" },
);
