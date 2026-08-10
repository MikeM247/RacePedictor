import { withSensitiveRoute } from "../../../_security.ts";
import { CoachingHttpError, withCoachingService } from "../../_shared.ts";
import { handleCloudPlan } from "../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ planId: string }> };

async function getPlan(_request: Request, context: RouteContext) {
  const { planId: encoded } = await context.params;
  return withCoachingService((service) => {
    const planId = decodeURIComponent(encoded).trim();
    if (!planId) throw new CoachingHttpError(400, "VALIDATION_ERROR", "planId is required");
    const plan = service.getPlanVersion(planId);
    if (!plan) throw new CoachingHttpError(404, "NOT_FOUND", "Approved plan version was not found");
    return { plan };
  });
}

export const GET = withSensitiveRoute(async (security, request, context: RouteContext) => {
  if (security.mode === "authenticated") {
    const { planId } = await context.params;
    return handleCloudPlan(security, planId);
  }
  return getPlan(request, context);
}, { cloudHandling: "actor-scoped" });
