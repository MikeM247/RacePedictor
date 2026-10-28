import { withCoachRoute } from "../../../../../../../../lib/server/coach-chat-handlers.ts";
import { handleRunReviewOutcome } from "../../../../../../../../lib/server/run-review-handlers.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ offerId: string }> };
export const POST = withCoachRoute(async (security, request: Request, context: Context) => handleRunReviewOutcome(security, request, (await context.params).offerId));
