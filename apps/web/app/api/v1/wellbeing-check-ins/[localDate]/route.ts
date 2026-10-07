import { withSensitiveRoute } from "../../../../../lib/server/route-security.ts";
import { handleCloudSaveWellbeing } from "../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ localDate: string }> };

export const PUT = withSensitiveRoute(async (security, request: Request, context: Context) => {
  const { localDate } = await context.params;
  return handleCloudSaveWellbeing(security, request, localDate);
}, { cloudHandling: "actor-scoped" });
