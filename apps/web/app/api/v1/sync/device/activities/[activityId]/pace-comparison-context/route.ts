import { withDeviceRoute } from "../../../../../../../../lib/server/device-route-security.ts";
import { readPaceContext } from "../../../../../../../../lib/server/pace-comparison-handlers.ts";
export const dynamic = "force-dynamic";
export const GET = withDeviceRoute(async (security, request, context: { params: Promise<{ activityId: string }> }) => {
  const { activityId } = await context.params;
  return readPaceContext(security, request, activityId);
});
