import { withSensitiveRoute } from "../../_security.ts";
import { readMilestones } from "../../../../../lib/server/milestone-timeline.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = withSensitiveRoute(async (security, request) => {
  const view = await readMilestones(security);
  if (new URL(request.url).searchParams.get("includeRemoved") !== "true") view.removed = [];
  return Response.json({ data: view }, { headers: { "Cache-Control": "private, no-store" } });
}, { cloudHandling: "actor-scoped" });
