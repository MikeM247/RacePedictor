import { withSensitiveRoute } from "../../../../_security.ts";
import { handleStravaBackfillResume } from "../../handlers.ts";

export const dynamic = "force-dynamic";

export const POST = withSensitiveRoute(
  (security, request) => handleStravaBackfillResume(security, request),
  { cloudHandling: "actor-scoped" },
);
