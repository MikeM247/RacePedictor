import { handleCoachProgressiveHeartbeat, withCoachRoute } from "../../../../../../../../lib/server/coach-voice-handlers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
export const POST = withCoachRoute(async (security, request, context: RouteContext) => handleCoachProgressiveHeartbeat(security, request, (await context.params).id));
