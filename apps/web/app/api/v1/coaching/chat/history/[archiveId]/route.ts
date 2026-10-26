import { handleCoachHistoryMessages, withCoachRoute } from "../../../../../../../lib/server/coach-chat-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = withCoachRoute(async (security, request, context: { params: Promise<{ archiveId: string }> }) => {
  const { archiveId } = await context.params;
  return handleCoachHistoryMessages(security, request, archiveId);
});
