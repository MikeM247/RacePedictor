import { withCoachRoute } from "../../../../../../lib/server/coach-chat-handlers.ts";
import { handleRunReviewReserve } from "../../../../../../lib/server/run-review-handlers.ts";

export const dynamic = "force-dynamic";
export const POST = withCoachRoute((security, request) => handleRunReviewReserve(security, request));
