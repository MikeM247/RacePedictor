import { getActivities } from "../../../../lib/local-activities-data-source.ts";
import { withSensitiveRoute } from "../../../../lib/server/route-security.ts";
import { handleCloudActivities } from "../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: [] } }, { status });
}

async function getActivitiesRoute(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    return Response.json(getActivities({
      cursor: params.get("cursor"),
      limit: params.has("limit") ? Number(params.get("limit")) : undefined,
      sport: params.get("sport") as "run" | "trail_run" | "treadmill_run" | "other" | null,
      search: params.get("search"),
      from: params.get("from"),
      to: params.get("to"),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid activity filters";
    return errorResponse(400, "VALIDATION_ERROR", message);
  }
}

export const GET = withSensitiveRoute(
  (security, request) => security.mode === "authenticated"
    ? handleCloudActivities(security, request)
    : getActivitiesRoute(request),
  { cloudHandling: "actor-scoped" },
);
