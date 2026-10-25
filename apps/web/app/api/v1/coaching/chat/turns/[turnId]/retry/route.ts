import { handleCoachRetry, withCoachRoute } from "../../../../../../../../lib/server/coach-chat-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

type RetryRouteContext = { params: Promise<{ turnId: string }> };

export const POST = withCoachRoute(async (security, request, context: RetryRouteContext) => {
  const { turnId } = await context.params;
  return handleCoachRetry(security, request, decodeURIComponent(turnId));
});
