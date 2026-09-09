import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import { syncChangesQuerySchema } from "../../../../packages/core/src/contracts/sync.ts";
import { projectOnlineStatus } from "../../../../packages/core/src/services/online-status.ts";
import {
  activatePlanRequestSchema,
  calendarEditHttpRequestSchema,
  calendarQueryRequestSchema,
  calendarRouteDataSchema,
  coachingReviewContextRouteDataSchema,
  plannedWorkoutSchema,
  todayRouteDataSchema,
  todayQueryRequestSchema,
} from "../../../../packages/core/src/contracts/coaching.ts";
import { projectCloudToday } from "../../../../packages/core/src/services/cloud-coaching.ts";
import {
  CloudActivityCursorError,
  CloudCoachingProjectionError,
  CloudSyncCursorError,
  CalendarSessionAmendmentError,
  TrainingPlanActivationError,
} from "../../../../packages/db/src/cloud/index.js";
import type { CloudCalendarSession } from "../../../../packages/db/src/cloud/index.js";
import { ApiHttpError, success } from "./api-response.ts";
import { getCloudReadComposition } from "./cloud-read-composition.ts";
import type { SensitiveRouteContext } from "./route-security.ts";

export type CloudReadComposition = ReturnType<typeof getCloudReadComposition>;
export type GetCloudReadComposition = () => CloudReadComposition;

export async function handleCloudActivities(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const params = new URL(request.url).searchParams;
  try {
    return success(await getComposition().activities.list(scope, {
      cursor: params.get("cursor"),
      limit: params.has("limit") ? Number(params.get("limit")) : undefined,
      sport: params.get("sport"),
      search: params.get("search"),
      from: params.get("from"),
      to: params.get("to"),
    }));
  } catch (error) {
    if (error instanceof CloudActivityCursorError) {
      throw new ApiHttpError(409, "CONFLICT", "The activity page cursor is invalid or no longer available");
    }
    if (error instanceof Error && /^Activity (limit|sport|date range|date filter)/u.test(error.message)) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "Activity filters are invalid");
    }
    throw error;
  }
}

export async function handleCloudDashboard(
  security: SensitiveRouteContext,
  _request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
  now: () => Date = () => new Date(),
) {
  const scope = requireScope(security);
  return Response.json(await getComposition().dashboard.getOverview(scope, now()));
}

export async function handleCloudActivity(
  security: SensitiveRouteContext,
  activityId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const activity = await getComposition().activities.findById(scope, activityId);
  if (!activity) throw new ApiHttpError(404, "NOT_FOUND", "Activity was not found");
  return success({ activity });
}

export async function handleCloudActivitySplits(
  security: SensitiveRouteContext,
  activityId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const activity = await getComposition().activities.findById(scope, activityId);
  if (!activity) throw new ApiHttpError(404, "NOT_FOUND", "Activity was not found");
  return success({ activityId, items: activity.splits });
}

export async function handleCloudSyncChanges(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const params = new URL(request.url).searchParams;
  const parsed = syncChangesQuerySchema.safeParse({
    after: params.get("after"),
    limit: params.has("limit") ? Number(params.get("limit")) : undefined,
  });
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Sync query is invalid");
  try {
    return success(await getComposition().changes.list(scope, parsed.data));
  } catch (error) {
    if (error instanceof CloudSyncCursorError) {
      throw new ApiHttpError(409, "CONFLICT", "The sync cursor is invalid or no longer available");
    }
    throw error;
  }
}

export async function handleCloudOnlineStatus(
  security: SensitiveRouteContext,
  _request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
  now: () => Date = () => new Date(),
) {
  const scope = requireScope(security);
  return success(projectOnlineStatus(await getComposition().status.getFacts(scope), now()));
}

export async function handleCloudActivePlan(
  security: SensitiveRouteContext,
  _request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const plan = await safelyReadCoaching(() => getComposition().coaching.getActivePlan(requireScope(security)));
  if (!plan) throw new ApiHttpError(404, "NOT_FOUND", "No active plan was found");
  return success(plan);
}

export async function handleCloudPlanHistory(
  security: SensitiveRouteContext,
  _request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const plans = await safelyReadCoaching(() => getComposition().coaching.listHistory(requireScope(security)));
  return success({ plans });
}

export async function handleCloudPlan(
  security: SensitiveRouteContext,
  planId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const normalizedPlanId = decodeURIComponent(planId).trim();
  if (!normalizedPlanId) throw new ApiHttpError(400, "VALIDATION_ERROR", "planId is required");
  const plan = await safelyReadCoaching(() => getComposition().coaching.findPlan(requireScope(security), normalizedPlanId));
  if (!plan) throw new ApiHttpError(404, "NOT_FOUND", "Approved plan version was not found");
  return success({ plan });
}

export async function handleCloudPlanActivation(
  security: SensitiveRouteContext,
  planId: string,
  request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  if (scope.actor.credentialKind !== "session") {
    throw new ApiHttpError(403, "FORBIDDEN", "A signed-in owner session is required");
  }
  let normalizedPlanId;
  try {
    normalizedPlanId = decodeURIComponent(planId).trim();
  } catch {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "planId is invalid");
  }
  if (!normalizedPlanId) throw new ApiHttpError(400, "VALIDATION_ERROR", "planId is required");

  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON");
  }
  const parsed = activatePlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Plan activation request is invalid", parsed.error.issues.map((issue) => ({
      path: issue.path.map(String),
      message: issue.message,
    })));
  }

  try {
    return success(await getComposition().planActivation.activate(
      scope,
      normalizedPlanId,
      parsed.data.expectedActivePlanId,
    ));
  } catch (error) {
    if (error instanceof TrainingPlanActivationError) {
      if (error.code === "PLAN_NOT_FOUND") {
        throw new ApiHttpError(404, "NOT_FOUND", "Approved plan version was not found");
      }
      if (error.code === "SESSION_REQUIRED" || error.code === "PLAN_NOT_APPROVED") {
        throw new ApiHttpError(403, "FORBIDDEN", "Only an approved plan can be selected by its signed-in owner");
      }
      if (error.code === "PLAN_ACTIVATION_CONFLICT") {
        throw new ApiHttpError(409, "CONFLICT", "The active plan changed; reload before choosing again");
      }
      if (error.code === "INCONSISTENT_PROJECTION") {
        throw new ApiHttpError(503, "UNAVAILABLE", "The approved plan projection is temporarily unavailable");
      }
    }
    throw error;
  }
}

export async function handleCloudCalendar(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const params = new URL(request.url).searchParams;
  const parsed = calendarQueryRequestSchema.safeParse({ from: params.get("from"), to: params.get("to") });
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Calendar date range is invalid");
  const scope = requireScope(security);
  const composition = getComposition();
  const sessions = await listCloudActiveCalendarSafely(composition, scope, parsed.data);
  const { timezone } = await listCloudCalendarPlanContext(composition, scope);
  const activityRead = await listCloudCalendarActivitiesSafely(composition, scope, parsed.data, timezone);
  try {
    return success(calendarRouteDataSchema.parse({ ...parsed.data, sessions, historicalSessions: [], activities: activityRead.activities, activitiesReadStatus: activityRead.status }));
  } catch (error) {
    reportCalendarSupplementFailure("calendar response projection", error);
    return success(calendarRouteDataSchema.parse({
      ...parsed.data,
      sessions: await approvedPlanCalendarSessions(composition, scope, parsed.data),
      historicalSessions: [],
      activities: [],
      activitiesReadStatus: "unavailable",
    }));
  }
}

async function listCloudActiveCalendarSafely(
  composition: CloudReadComposition,
  scope: ReturnType<typeof athleteScopeFor>,
  range: { from: string; to: string },
) {
  try {
    return await safelyReadCoaching(() => composition.calendarSessions.listActiveCalendar(scope, range));
  } catch (error) {
    reportCalendarSupplementFailure("effective session projection", error);
    return approvedPlanCalendarSessions(composition, scope, range);
  }
}

async function approvedPlanCalendarSessions(
  composition: CloudReadComposition,
  scope: ReturnType<typeof athleteScopeFor>,
  range: { from: string; to: string },
) {
  const activePlan = await safelyReadCoaching(() => composition.coaching.getActivePlan(scope));
  if (!activePlan) return [];
  return activePlan.workouts
    .filter((workout) => workout.scheduledDate >= range.from && workout.scheduledDate <= range.to)
    .map((workout) => ({
      ...workout,
      prescribedDate: workout.scheduledDate,
      effectiveDate: workout.scheduledDate,
      originalDate: workout.scheduledDate,
      status: "upcoming" as const,
      revision: activePlan.revision,
      warnings: ["The effective calendar projection is temporarily unavailable. Showing the approved plan source."],
      original: workout,
      amendments: [],
    }));
}

async function listCloudCalendarPlanContext(
  composition: CloudReadComposition,
  scope: ReturnType<typeof athleteScopeFor>,
) {
  try {
    const plans = await safelyReadCoaching(() => composition.coaching.listHistory(scope));
    return {
      timezone: plans.find((plan) => plan.status === "active")?.timezone ?? "Africa/Johannesburg",
    };
  } catch (error) {
    reportCalendarSupplementFailure("plan history", error);
    return { timezone: "Africa/Johannesburg" };
  }
}

async function listCloudCalendarActivitiesSafely(
  composition: CloudReadComposition,
  scope: ReturnType<typeof athleteScopeFor>,
  range: { from: string; to: string },
  timezone: string,
) {
  try {
    return { activities: await listCloudCalendarActivities(composition, scope, range, timezone), status: "available" as const };
  } catch (error) {
    reportCalendarSupplementFailure("recorded activities", error);
    return { activities: [], status: "unavailable" as const };
  }
}

function reportCalendarSupplementFailure(supplement: string, error: unknown) {
  const details = error instanceof ApiHttpError
    ? { status: error.status, code: error.code }
    : error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "Unknown error" };
  console.warn("Calendar supplemental data could not be loaded", { supplement, ...details });
}

async function listCloudCalendarActivities(
  composition: CloudReadComposition,
  scope: ReturnType<typeof athleteScopeFor>,
  range: { from: string; to: string },
  timezone: string,
) {
  const from = shiftCalendarDate(range.from, -1);
  const to = shiftCalendarDate(range.to, 1);
  const items = [];
  let cursor: string | null | undefined;
  do {
    const page = await composition.activities.list(scope, { from, to, cursor, limit: 100 });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items
    .filter((activity) => ["run", "trail_run", "treadmill_run"].includes(activity.sport))
    .map((activity) => ({ ...activity, localDate: localDateForCalendar(activity.occurredAt, timezone) }))
    .filter((activity) => activity.localDate >= range.from && activity.localDate <= range.to);
}

function shiftCalendarDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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

export async function handleCloudToday(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
  now: () => Date = () => new Date(),
) {
  const rawDate = new URL(request.url).searchParams.get("date");
  const parsed = todayQueryRequestSchema.safeParse({ date: rawDate ?? undefined });
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Today date is invalid");
  const scope = requireScope(security);
  const plan = await safelyReadCoaching(() => getComposition().coaching.getActivePlan(scope));
  if (!plan) return success(projectCloudToday({ athleteId: scope.athleteId, plan, date: parsed.data.date, generatedAt: now() }));
  const allSessions = await safelyReadCoaching(() => getComposition().calendarSessions.listActiveCalendar(scope, {
    from: plan.startsOn,
    to: plan.endsOn,
  }));
  const effectivePlan = {
    ...plan,
    workouts: allSessions.map(toEffectiveWorkout),
  };
  const projected = projectCloudToday({ athleteId: scope.athleteId, plan: effectivePlan, date: parsed.data.date, generatedAt: now() });
  const effectiveSession = allSessions.find((session: { effectiveDate: string }) => session.effectiveDate === projected.date) ?? null;
  if (!effectiveSession) return success(projected);
  const state = effectiveSession.status === "skipped"
    ? "skipped"
    : projected.state;
  return success(todayRouteDataSchema.parse({
    ...projected,
    session: effectiveSession,
    sessionId: effectiveSession.id,
    state,
    status: state,
    message: state === "skipped"
      ? `${effectiveSession.title} is explicitly skipped. Its approved prescription remains unchanged.`
      : effectiveSession.amendments.length > 0
        ? "Follow the latest athlete-approved effective session; the approved source prescription remains available for review."
        : projected.message,
    localCue: effectiveSession.amendments.length > 0
      ? "This session reflects a reasoned manual change and has not been reviewed or adapted by AI."
      : projected.localCue,
  }));
}

export async function handleCloudSessionAmendment(
  security: SensitiveRouteContext,
  sessionId: string,
  request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireOwnerScope(security);
  const body = await readJson(request);
  const parsed = calendarEditHttpRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Session amendment request is invalid", parsed.error.issues.map((issue) => ({
      path: issue.path.map(String), message: issue.message,
    })));
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || scope.actor.requestId;
  const input = {
    operation: parsed.data.operation,
    expectedRevision: parsed.data.expectedRevision,
    reason: parsed.data.reason,
    idempotencyKey,
    changes: parsed.data.operation === "amend"
      ? parsed.data.changes
      : parsed.data.operation === "reschedule" ? { effectiveDate: parsed.data.date } : {},
  };
  try {
    return success(await getComposition().calendarSessions.amend(scope, decodeId(sessionId), input), 201);
  } catch (error) {
    throw mapAmendmentError(error);
  }
}

export async function handleCloudSessionAmendmentHistory(
  security: SensitiveRouteContext,
  sessionId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireOwnerScope(security);
  try {
    return success({ amendments: await getComposition().calendarSessions.listHistory(scope, decodeId(sessionId)) });
  } catch (error) {
    throw mapAmendmentError(error);
  }
}

export async function handleCloudCoachingReviewContext(
  security: SensitiveRouteContext,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireOwnerScope(security);
  try {
    const context = await getComposition().calendarSessions.getReviewContext(scope);
    return success(coachingReviewContextRouteDataSchema.parse({ context }));
  } catch (error) {
    throw mapAmendmentError(error);
  }
}

async function safelyReadCoaching<T>(read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    if (error instanceof CloudCoachingProjectionError) {
      throw new ApiHttpError(503, "UNAVAILABLE", "The approved plan projection is temporarily unavailable");
    }
    throw error;
  }
}

function requireScope(security: SensitiveRouteContext) {
  if (security.mode !== "authenticated") {
    throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Cloud data is unavailable in local mode");
  }
  return athleteScopeFor(security.actor);
}

function requireOwnerScope(security: SensitiveRouteContext) {
  const scope = requireScope(security);
  if (scope.actor.credentialKind !== "session") {
    throw new ApiHttpError(403, "FORBIDDEN", "A signed-in owner session is required");
  }
  return scope;
}

function decodeId(value: string) {
  try {
    const decoded = decodeURIComponent(value).trim();
    if (!decoded) throw new Error();
    return decoded;
  } catch {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "sessionId is invalid");
  }
}

async function readJson(request: Request) {
  try { return await request.json(); }
  catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON"); }
}

function mapAmendmentError(error: unknown) {
  if (!(error instanceof CalendarSessionAmendmentError)) return error;
  if (error.code === "SESSION_NOT_FOUND") return new ApiHttpError(404, "NOT_FOUND", "Active plan session was not found");
  if (["REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(error.code)) {
    return new ApiHttpError(409, "CONFLICT", "The session changed; reload and review the latest values");
  }
  if (error.code === "SESSION_REQUIRED") return new ApiHttpError(403, "FORBIDDEN", "A signed-in owner session is required");
  if (error.code === "INCONSISTENT_PROJECTION") return new ApiHttpError(503, "UNAVAILABLE", "The active calendar projection is unavailable");
  return new ApiHttpError(400, "VALIDATION_ERROR", error.message);
}

function toEffectiveWorkout(session: CloudCalendarSession) {
  return plannedWorkoutSchema.parse({
    id: session.id,
    kind: session.kind,
    scheduledDate: session.effectiveDate,
    ...(session.startTime === undefined ? {} : { startTime: session.startTime }),
    title: session.title,
    purpose: session.purpose,
    prescription: session.prescription,
    cautions: session.cautions,
    durationMinutes: session.durationMinutes,
    ...(session.distanceMeters === undefined ? {} : { distanceMeters: session.distanceMeters }),
    ...(session.intensityRpe === undefined ? {} : { intensityRpe: session.intensityRpe }),
  });
}
