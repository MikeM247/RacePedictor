import { withSensitiveRoute } from "../../../../_security.ts";
import { previewMilestoneResult, mutateMilestones } from "../../../../../../../lib/server/milestone-timeline.ts";
import { ApiHttpError } from "../../../../../../../lib/server/api-response.ts";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = withSensitiveRoute(async (security, request) => {
 const raw = await request.json().catch(() => null);
 if (!raw?.previewDigest) throw new ApiHttpError(400, "VALIDATION_ERROR", "Review this result before confirming.");
 return Response.json({ data: await mutateMilestones(security, raw) }, { headers: { "Cache-Control": "private, no-store" } });
}, { cloudHandling: "actor-scoped" });
