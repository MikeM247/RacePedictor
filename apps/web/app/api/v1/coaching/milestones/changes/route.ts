import { withSensitiveRoute } from "../../../_security.ts";
import { mutateMilestones } from "../../../../../../lib/server/milestone-timeline.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = withSensitiveRoute(async (security, request) => Response.json({
  data: await mutateMilestones(security, await request.json().catch(() => null)),
}, { headers: { "Cache-Control": "private, no-store" } }), { cloudHandling: "actor-scoped" });
