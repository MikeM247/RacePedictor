import { getActivity } from "../../../../../../lib/local-activities-data-source.ts";
import { withSensitiveRoute } from "../../../../../../lib/server/route-security.ts";
import { handleCloudActivitySplits } from "../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";

type ActivityRouteContext = {
  params: Promise<{ activityId: string }>;
};

async function getActivitySplitsRoute(_request: Request, context: ActivityRouteContext) {
  const { activityId } = await context.params;
  const decodedActivityId = decodeURIComponent(activityId);
  const activity = getActivity(decodedActivityId);
  if (!activity) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Activity not found", details: [] } },
      { status: 404 },
    );
  }
  return Response.json({ activityId: decodedActivityId, items: activity.splits });
}

export const GET = withSensitiveRoute(async (security, request, context: ActivityRouteContext) => {
  if (security.mode === "local") return getActivitySplitsRoute(request, context);
  const { activityId } = await context.params;
  return handleCloudActivitySplits(security, decodeURIComponent(activityId));
}, { cloudHandling: "actor-scoped" });
