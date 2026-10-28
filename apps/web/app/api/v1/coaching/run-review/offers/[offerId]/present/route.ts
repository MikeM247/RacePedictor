import { withCoachRoute } from "../../../../../../../../lib/server/coach-chat-handlers.ts";
import { handleRunReviewPresent } from "../../../../../../../../lib/server/run-review-handlers.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ offerId: string }> };
export const POST = withCoachRoute(async (security, request: Request, context: Context) => handleRunReviewPresent(security, request, (await context.params).offerId));
