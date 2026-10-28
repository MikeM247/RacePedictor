import { withSensitiveRoute } from "../../../../../../../lib/server/route-security.ts";
import { handleCloudReflectionStateChange } from "../../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const POST = withSensitiveRoute(async (security, request: Request, context: { params: Promise<{ activityId: string }> }) => handleCloudReflectionStateChange(security, request, (await context.params).activityId, "reopened"), { cloudHandling: "actor-scoped" });
