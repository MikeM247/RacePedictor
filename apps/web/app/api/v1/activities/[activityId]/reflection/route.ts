import { withSensitiveRoute } from "../../../../../../lib/server/route-security.ts";
import { handleCloudActivityReflection, handleCloudSaveActivityReflection } from "../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ activityId: string }> };

export const GET = withSensitiveRoute(async (security, _request: Request, context: Context) => {
  const { activityId } = await context.params;
  return handleCloudActivityReflection(security, activityId);
}, { cloudHandling: "actor-scoped" });

export const PUT = withSensitiveRoute(async (security, request: Request, context: Context) => {
  const { activityId } = await context.params;
  return handleCloudSaveActivityReflection(security, request, activityId);
}, { cloudHandling: "actor-scoped" });
