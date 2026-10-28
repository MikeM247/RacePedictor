import { withSensitiveRoute } from "../../../../../../../../lib/server/route-security.ts";
import { handleCloudReflectionMutationRead } from "../../../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ activityId: string; requestId: string }> };
export const GET = withSensitiveRoute(async (security, _request: Request, context: Context) => {
  const params = await context.params;
  return handleCloudReflectionMutationRead(security, params.activityId, params.requestId);
}, { cloudHandling: "actor-scoped" });
