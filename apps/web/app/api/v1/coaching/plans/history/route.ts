import { withSensitiveRoute } from "../../../_security.ts";
import { withCoachingService } from "../../_shared.ts";
import { handleCloudPlanHistory } from "../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getPlanHistory() {
  return withCoachingService((service) => ({ plans: service.listPlanHistory() }));
}

export const GET = withSensitiveRoute(
  (security, request) => security.mode === "authenticated"
    ? handleCloudPlanHistory(security, request)
    : getPlanHistory(),
  { cloudHandling: "actor-scoped" },
);
