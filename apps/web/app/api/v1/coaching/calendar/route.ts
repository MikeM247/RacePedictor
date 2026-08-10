import { calendarQueryRequestSchema } from "../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../_security.ts";
import { withCoachingService } from "../_shared.ts";
import { handleCloudCalendar } from "../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getCalendar(request: Request) {
  const params = new URL(request.url).searchParams;
  return withCoachingService((service) => {
    const { from, to } = calendarQueryRequestSchema.parse({
      from: params.get("from"),
      to: params.get("to"),
    });
    const sessions = service.listActiveCalendar()
      .filter((session) => session.effectiveDate >= from && session.effectiveDate <= to);
    return { from, to, sessions };
  });
}

export const GET = withSensitiveRoute(
  (security, request) => security.mode === "authenticated"
    ? handleCloudCalendar(security, request)
    : getCalendar(request),
  { cloudHandling: "actor-scoped" },
);
