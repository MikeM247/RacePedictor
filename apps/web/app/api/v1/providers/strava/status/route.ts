import { withSensitiveRoute } from "../../../_security.ts";
import { handleStravaStatus } from "../handlers.ts";

export const GET = withSensitiveRoute(
  (security, request) => handleStravaStatus(security, request),
  { cloudHandling: "actor-scoped" },
);
