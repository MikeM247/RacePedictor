import { todayQueryRequestSchema } from "../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../_security.ts";
import { withCoachingService } from "../_shared.ts";
import { handleCloudToday } from "../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getToday(request: Request) {
  const rawDate = new URL(request.url).searchParams.get("date");
  return withCoachingService((service) => {
    const query = todayQueryRequestSchema.parse({ date: rawDate ?? undefined });
    const overview = service.buildTodayOverview(query);
    const { brief, ...today } = overview;
    return {
      ...(brief ?? {
        athleteId: service.athleteId,
        date: today.date,
        sessionId: null,
        message: today.message,
        source: "fallback",
        generatedAt: today.generatedAt,
        idempotencyKey: `daily-brief:${service.athleteId}:${today.date}:no-plan`,
      }),
      ...today,
      status: today.state,
      planVersion: today.plan?.version ?? null,
    };
  });
}

export const GET = withSensitiveRoute(
  (security, request) => security.mode === "authenticated"
    ? handleCloudToday(security, request)
    : getToday(request),
  { cloudHandling: "actor-scoped" },
);
