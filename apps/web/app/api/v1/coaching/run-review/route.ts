import { withCoachRoute } from "../../../../../lib/server/coach-chat-handlers.ts";
import { handleRunReviewGet } from "../../../../../lib/server/run-review-handlers.ts";

export const dynamic = "force-dynamic";
export const GET = withCoachRoute((security, request) => handleRunReviewGet(security, request));
