import { handleCloudActivityFeedback } from "../../../../../../lib/server/cloud-read-handlers.ts";
import { withSensitiveRoute } from "../../../../../../lib/server/route-security.ts";
import { getLocalActivityReview } from "../../../../../../lib/local-activity-review-data-source.ts";
import { activityFeedbackResponseSchema } from "../../../../../../../../packages/core/src/contracts/activity-review.ts";

export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(async (security, _request: Request, context: { params: Promise<{ activityId: string }> }) => {
  const { activityId } = await context.params;
  if (security.mode === "local") {
    const decoded = decodeURIComponent(activityId);
    const coachFeedback = getLocalActivityReview(decoded);
    return Response.json(activityFeedbackResponseSchema.parse({ data: {
      activityId: decoded,
      coachFeedback,
      athleteFeedback: null,
      legacyReviews: coachFeedback.review ? [coachFeedback.review] : [],
    } }));
  }
  return handleCloudActivityFeedback(security, activityId);
}, { cloudHandling: "actor-scoped" });
