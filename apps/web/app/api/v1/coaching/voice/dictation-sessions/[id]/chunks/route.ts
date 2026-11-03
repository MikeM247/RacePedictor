import { handleCoachProgressiveChunk, withCoachRoute } from "../../../../../../../../lib/server/coach-voice-handlers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 75;
type RouteContext = { params: Promise<{ id: string }> };
export const POST = withCoachRoute(async (security, request, context: RouteContext) => handleCoachProgressiveChunk(security, request, (await context.params).id));
