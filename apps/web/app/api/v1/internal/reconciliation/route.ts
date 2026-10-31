import { withInternalRoute } from "../../../../../lib/server/internal-route-security.ts";
import { handleScheduledReconciliation } from "../../../../../lib/server/operational-handlers.ts";
import { cleanupCloudMilestoneImages } from "../../../../../lib/server/milestone-image-cleanup.ts";
export const dynamic = "force-dynamic";
// Vercel Cron invokes configured paths with GET. POST remains available for a
// deliberate operator-triggered recovery using the same bearer boundary.
export const GET = withInternalRoute(async (request) => {
  const response = await handleScheduledReconciliation(request);
  if (response.ok) await cleanupCloudMilestoneImages();
  return response;
});
export const POST = GET;
