import { withSensitiveRoute } from "../../_security.ts";
import { handleCloudOnlineStatus } from "../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(
  (security, request) => handleCloudOnlineStatus(security, request),
  { cloudHandling: "actor-scoped" },
);
