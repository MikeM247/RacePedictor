import { withSensitiveRoute } from "../../../_security.ts";
import { CoachingHttpError, withCoachingService } from "../../_shared.ts";
import { handleCloudActivePlan } from "../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getActivePlan() {
  return withCoachingService((service) => {
    const plan = service.getActivePlan();
    if (!plan) throw new CoachingHttpError(404, "NOT_FOUND", "No active plan was found");
    return plan;
  });
}

export const GET = withSensitiveRoute(
  (security, request) => security.mode === "authenticated"
    ? handleCloudActivePlan(security, request)
    : getActivePlan(),
  { cloudHandling: "actor-scoped" },
);
