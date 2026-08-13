import { withSensitiveRoute } from "../../../../../_security.ts";
import { ApiHttpError } from "../../../../../../../../lib/server/api-response.ts";
import {
  handleCloudSessionAmendment,
  handleCloudSessionAmendmentHistory,
} from "../../../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };

export const POST = withSensitiveRoute(async (security, request, context: RouteContext) => {
  if (security.mode !== "authenticated") {
    throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Online session amendments require owner sign-in");
  }
  const { sessionId } = await context.params;
  return handleCloudSessionAmendment(security, sessionId, request);
}, { cloudHandling: "actor-scoped" });

export const GET = withSensitiveRoute(async (security, _request, context: RouteContext) => {
  if (security.mode !== "authenticated") {
    throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Online session amendment history requires owner sign-in");
  }
  const { sessionId } = await context.params;
  return handleCloudSessionAmendmentHistory(security, sessionId);
}, { cloudHandling: "actor-scoped" });
