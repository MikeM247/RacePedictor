import { withSensitiveRoute } from "../../../../../../../lib/server/route-security.ts";
import { handleRunReviewFeedbackGet } from "../../../../../../../lib/server/run-review-handlers.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ activityId: string }> };
export const GET = withSensitiveRoute(async (security, _request: Request, context: Context) => handleRunReviewFeedbackGet(security, (await context.params).activityId), { cloudHandling: "actor-scoped" });
