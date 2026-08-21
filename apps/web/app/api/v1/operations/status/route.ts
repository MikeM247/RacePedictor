import { withSensitiveRoute } from "../../_security.ts";
import { handleOperationalStatus } from "../../../../../lib/server/operational-handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(
  (security, request) => handleOperationalStatus(security, request),
  { cloudHandling: "actor-scoped" },
);
