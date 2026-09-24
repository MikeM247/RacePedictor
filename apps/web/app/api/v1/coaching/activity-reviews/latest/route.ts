import { listLocalActivityReviews } from "../../../../../../lib/local-activity-review-data-source.ts";
import { withSensitiveRoute } from "../../../../../../lib/server/route-security.ts";
import { handleCloudLatestActivityReviews } from "../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(async (security, request) => {
  if (security.mode === "authenticated") return handleCloudLatestActivityReviews(security, request);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 10);
  return Response.json({ items: listLocalActivityReviews(limit) });
}, { cloudHandling: "actor-scoped" });
