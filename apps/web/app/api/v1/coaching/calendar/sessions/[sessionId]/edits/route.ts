import { calendarEditHttpRequestSchema } from "../../../../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../../../../_security.ts";
import { CoachingHttpError, readJson, withCoachingService } from "../../../../_shared.ts";
import { handleCloudSessionAmendment } from "../../../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };
async function editCalendarSession(request: Request, context: RouteContext) {
  const body = await readJson(request).catch((error) => error);
  const { sessionId: encoded } = await context.params;
  return withCoachingService(async (service) => {
    if (body instanceof Error) throw body;
    const sessionId = decodeURIComponent(encoded).trim();
    if (!sessionId) throw new CoachingHttpError(400, "VALIDATION_ERROR", "sessionId is required");
    const input = calendarEditHttpRequestSchema.parse(body);
    const active = service.getActivePlan();
    if (!active) throw new CoachingHttpError(404, "NOT_FOUND", "No active plan was found");
    const common = {
      planId: active.id,
      sessionId,
      expectedRevision: input.expectedRevision,
      actor: "user",
      reason: input.reason,
      requestedAt: new Date().toISOString(),
    };
    const session = input.operation === "amend"
      ? service.editCalendar({ ...common, operation: "amend", changes: input.changes })
      : input.operation === "reschedule"
        ? service.editCalendar({ ...common, operation: "reschedule", effectiveDate: input.date })
        : input.operation === "skip"
          ? service.editCalendar({ ...common, operation: "skip" })
          : service.editCalendar({ ...common, operation: "restore" });
    // Keep the generated coaching context aligned with the effective schedule
    // consumed by the daily reminder after any explicit calendar change.
    await service.publishCoachingContext();
    return { session, operation: input.operation };
  });
}

export const POST = withSensitiveRoute(async (security, request, context: RouteContext) => {
  if (security.mode === "authenticated") {
    const { sessionId } = await context.params;
    return handleCloudSessionAmendment(security, sessionId, request);
  }
  return editCalendarSession(request, context);
}, { cloudHandling: "actor-scoped" });
