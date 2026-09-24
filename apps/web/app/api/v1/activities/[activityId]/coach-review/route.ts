import { getLocalActivityReview, queueLocalActivityReview } from "../../../../../../lib/local-activity-review-data-source.ts";
import { withSensitiveRoute } from "../../../../../../lib/server/route-security.ts";
import { handleCloudActivityReview, handleCloudActivityReviewRequest } from "../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ activityId: string }> };

export const GET = withSensitiveRoute(async (security, _request: Request, context: Context) => {
  const { activityId } = await context.params;
  if (security.mode === "authenticated") return handleCloudActivityReview(security, activityId);
  return Response.json(getLocalActivityReview(decodeURIComponent(activityId)));
}, { cloudHandling: "actor-scoped" });

export const POST = withSensitiveRoute(async (security, _request: Request, context: Context) => {
  const { activityId } = await context.params;
  if (security.mode === "authenticated") return handleCloudActivityReviewRequest(security, activityId);
  return Response.json(queueLocalActivityReview(decodeURIComponent(activityId)), { status: 202 });
}, { cloudHandling: "actor-scoped" });
