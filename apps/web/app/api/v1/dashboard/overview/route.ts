import { LocalDashboardDataSource } from "../../../../../lib/local-dashboard-data-source.ts";
import { withSensitiveRoute } from "../../../../../lib/server/route-security.ts";
import { handleCloudDashboard } from "../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";

async function getDashboardOverview() {
  const result = await new LocalDashboardDataSource().getDashboardData();
  return Response.json(result, { status: result.fetchStatus === "error" ? 503 : 200 });
}

export const GET = withSensitiveRoute(
  (security, request) => security.mode === "authenticated"
    ? handleCloudDashboard(security, request)
    : getDashboardOverview(),
  { cloudHandling: "actor-scoped" },
);
