import { getActivity } from "../../../../../lib/local-activities-data-source.ts";
import { withSensitiveRoute } from "../../../../../lib/server/route-security.ts";
import { handleCloudActivity } from "../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";

type ActivityRouteContext = {
  params: Promise<{ activityId: string }>;
};

async function getActivityRoute(_request: Request, context: ActivityRouteContext) {
  try {
    const { activityId } = await context.params;
    const activity = getActivity(decodeURIComponent(activityId));
    if (!activity) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Activity not found", details: [] } },
        { status: 404 },
      );
    }
    return Response.json({ activity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load activity";
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message, details: [] } },
      { status: 500 },
    );
  }
}

export const GET = withSensitiveRoute(async (security, request, context: ActivityRouteContext) => {
  if (security.mode === "local") return getActivityRoute(request, context);
  const { activityId } = await context.params;
  return handleCloudActivity(security, decodeURIComponent(activityId));
}, { cloudHandling: "actor-scoped" });
