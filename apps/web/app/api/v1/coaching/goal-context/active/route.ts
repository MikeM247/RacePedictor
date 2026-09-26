import { withSensitiveRoute } from "../../../_security.ts";
import { withCoachingService } from "../../_shared.ts";
import { handleCloudActiveGoalContext } from "../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getLocalGoalContext() {
  return withCoachingService((service) => ({ context: service.getActiveGoalContext() }));
}

export const GET = withSensitiveRoute(
  (security) => security.mode === "authenticated"
    ? handleCloudActiveGoalContext(security)
    : getLocalGoalContext(),
  { cloudHandling: "actor-scoped" },
);
