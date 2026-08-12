import { withSensitiveRoute } from "../../../../_security.ts";
import { ApiHttpError } from "../../../../../../../lib/server/api-response.ts";
import { handleCloudPlanActivation } from "../../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ planId: string }> };

export const POST = withSensitiveRoute(async (security, request, context: RouteContext) => {
  if (security.mode !== "authenticated") {
    throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Plan selection is available after signing in online");
  }
  const { planId } = await context.params;
  return handleCloudPlanActivation(security, planId, request);
}, { cloudHandling: "actor-scoped" });
