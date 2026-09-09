import { calendarQueryRequestSchema, calendarRouteDataSchema } from "../../../../../../../packages/core/src/contracts/coaching.ts";
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
    const activePlan = service.getActivePlan();
    const sessions = service.listActiveCalendar()
      .filter((session) => session.effectiveDate >= from && session.effectiveDate <= to);
    const timezone = activePlan?.timezone ?? service.loadProfile()?.timezone ?? "Africa/Johannesburg";
    const activities = service.listCalendarActivities({ from, to })
      .map((activity) => ({
        ...activity,
        localDate: localDateForCalendar(activity.occurredAt, timezone),
      }))
      .filter((activity) => activity.localDate >= from && activity.localDate <= to);
    return calendarRouteDataSchema.parse({ from, to, sessions, historicalSessions: [], activities, activitiesReadStatus: "available" });
  });
}

function localDateForCalendar(occurredAt: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(occurredAt));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export const GET = withSensitiveRoute(
  (security, request) => security.mode === "authenticated"
    ? handleCloudCalendar(security, request)
    : getCalendar(request),
  { cloudHandling: "actor-scoped" },
);
