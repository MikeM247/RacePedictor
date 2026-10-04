import { handleCloudLegacyActivityReviews } from "../../../../../../lib/server/cloud-read-handlers.ts";
import { withSensitiveRoute } from "../../../../../../lib/server/route-security.ts";

export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(async (security, _request: Request, context: { params: Promise<{ activityId: string }> }) => {
  const { activityId } = await context.params;
  return handleCloudLegacyActivityReviews(security, activityId);
}, { cloudHandling: "actor-scoped" });
