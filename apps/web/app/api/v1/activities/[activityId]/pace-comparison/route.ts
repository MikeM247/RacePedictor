import { withSensitiveRoute } from "../../../../../../lib/server/route-security.ts";
import { readPaceComparison } from "../../../../../../lib/server/pace-comparison-handlers.ts";
export const dynamic = "force-dynamic";
export const GET = withSensitiveRoute(async (security, _request, context: { params: Promise<{ activityId: string }> }) => {
  const { activityId } = await context.params;
  return readPaceComparison(security, activityId);
}, { cloudHandling: "actor-scoped" });
