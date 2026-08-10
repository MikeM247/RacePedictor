import { withSensitiveRoute } from "../../_security.ts";
import { handleCloudSyncChanges } from "../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(
  (security, request) => handleCloudSyncChanges(security, request),
  { cloudHandling: "actor-scoped" },
);
