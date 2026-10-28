import { z } from "zod";
import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import { syncChangesQuerySchema } from "../../../../packages/core/src/contracts/sync.ts";
import { projectOnlineStatus } from "../../../../packages/core/src/services/online-status.ts";
import {
  activatePlanRequestSchema,
  calendarEditHttpRequestSchema,
  calendarQueryRequestSchema,
  calendarRouteDataSchema,
  coachingReviewContextRouteDataSchema,
  goalContextRouteDataSchema,
  plannedWorkoutSchema,
  todayRouteDataSchema,
  todayQueryRequestSchema,
} from "../../../../packages/core/src/contracts/coaching.ts";
import { ApiHttpError, success, type ApiErrorCode } from "./api-response.ts";
import { projectCloudToday } from "../../../../packages/core/src/services/cloud-coaching.ts";
import {
  CloudActivityCursorError,
  CloudCoachingProjectionError,
  CloudSyncCursorError,
  CalendarSessionAmendmentError,
  TrainingPlanActivationError,
  TrainingPlanGoalContextUnavailableError,
} from "../../../../packages/db/src/cloud/index.js";
import { activityFeedbackResponseDataSchema, activityReviewRequestIntentSchema } from "../../../../packages/core/src/contracts/activity-review.ts";
import {
  activityReflectionResponseSchema,
  saveActivityReflectionRequestSchema,
  savePostRunReflectionRequestSchema,
  postRunReflectionStateChangeSchema,
  saveDailyWellbeingRequestSchema,
  wellbeingRangeQuerySchema,
  dailyWellbeingListResponseSchema,
} from "../../../../packages/core/src/contracts/athlete-journal.ts";
import type { CloudCalendarSession } from "../../../../packages/db/src/cloud/index.js";
import { getCloudReadComposition } from "./cloud-read-composition.ts";
import type { SensitiveRouteContext } from "./route-security.ts";
import { after } from "next/server.js";
import { runCloudCoachFeedbackBatch } from "./activity-coach-worker.ts";
import { AthleteJournalConflictError, AthleteJournalDateError } from "../../../../packages/db/src/cloud/index.js";

export type CloudReadComposition = ReturnType<typeof getCloudReadComposition>;
export type GetCloudReadComposition = () => CloudReadComposition;

export async function handleCloudActivityReview(
  security: SensitiveRouteContext,
  activityId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const result = await getComposition().activityReviews.get(scope, decodeId(activityId));
  return success(result);
}

export async function handleCloudActivityFeedback(
  security: SensitiveRouteContext,
  activityId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const decodedActivityId = decodeId(activityId);
  const [coachFeedback, athleteFeedback, legacyReviews] = await Promise.all([
    getComposition().activityReviews.get(scope, decodedActivityId),
    getComposition().athleteFeedback.get(scope, decodedActivityId),
    getComposition().activityReviews.listForActivity(scope, decodedActivityId),
  ]);
  return success(activityFeedbackResponseDataSchema.parse({
    activityId: decodedActivityId,
    coachFeedback,
    athleteFeedback,
    legacyReviews,
  }));
}

export async function handleCloudActivityReflection(
  security: SensitiveRouteContext,
  activityId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const decodedActivityId = decodeId(activityId);
  const activity = await getComposition().activities.findById(scope, decodedActivityId);
  if (!activity) throw new ApiHttpError(404, "NOT_FOUND", "Activity was not found");
  return Response.json(activityReflectionResponseSchema.parse({ data: await getComposition().journal.getReflection(scope, decodedActivityId) }));
}

export async function handleCloudSaveActivityReflection(
  security: SensitiveRouteContext,
  request: Request,
  activityId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireOwnerScope(security);
  const parsed = saveActivityReflectionRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Activity reflection is invalid", parsed.error.issues);
  try {
    const reflection = await getComposition().journal.saveReflection(scope, decodeId(activityId), parsed.data);
    if (!reflection) throw new ApiHttpError(404, "NOT_FOUND", "Activity was not found");
    return success(reflection);
  } catch (error) {
    if (error instanceof AthleteJournalConflictError) throw new ApiHttpError(409, "CONFLICT", "The reflection changed; reload and review the latest values");
    throw error;
  }
}

/** Route v2 run reflections through their atomic completion transaction while
 * preserving the existing v1 journal endpoint for other sports and clients. */
export async function handleCloudSaveActivityReflectionVersioned(
  security: SensitiveRouteContext,
  request: Request,
  activityId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  let body: unknown;
  try { body = await request.clone().json(); }
  catch { return handleCloudSaveActivityReflection(security, request, activityId, getComposition); }
  if (body && typeof body === "object" && "answers" in body && body.answers && typeof body.answers === "object" && "postRun" in body.answers) {
    return handleCloudSavePostRunReflection(security, request, activityId, getComposition);
  }
  return handleCloudSaveActivityReflection(security, request, activityId, getComposition);
}

export async function handleCloudSavePostRunReflection(
  security: SensitiveRouteContext,
  request: Request,
  activityId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireOwnerScope(security);
  assertSameOriginRequest(request);
  const parsed = savePostRunReflectionRequestSchema.safeParse(await readBoundedJson(request, 24_000));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Run feedback is invalid", parsed.error.issues);
  try {
    const result = await getComposition().journal.savePostRunReflection(scope, decodeId(activityId), parsed.data);
    if (!result) throw new ApiHttpError(404, "NOT_FOUND", "This run is not available for feedback");
    return success({ ...result, operation: { requestId: result.operation.requestId, operation: result.operation.operation, appliedRevision: result.operation.appliedRevision, stateRevision: result.operation.appliedStateRevision } });
  } catch (error) { throw mapReflectionError(error); }
}

export async function handleCloudReflectionMutationRead(
  security: SensitiveRouteContext,
  activityId: string,
  requestId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const request = z.string().uuid().safeParse(requestId);
  if (!request.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Request identity is invalid");
  const result = await getComposition().journal.getReflectionMutation(scope, decodeId(activityId), request.data);
  if (!result) throw new ApiHttpError(404, "NOT_FOUND", "The feedback request was not found");
  return success(result);
}

export async function handleCloudReflectionStateChange(
  security: SensitiveRouteContext,
  request: Request,
  activityId: string,
  operation: "deleted" | "reopened",
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireOwnerScope(security);
  assertSameOriginRequest(request);
  const parsed = postRunReflectionStateChangeSchema.safeParse(await readBoundedJson(request, 1024));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Run feedback update is invalid", parsed.error.issues);
  try {
    const journal = getComposition().journal;
    const result = operation === "deleted"
      ? await journal.deletePostRunReflection(scope, decodeId(activityId), parsed.data)
      : await journal.reopenPostRunReflection(scope, decodeId(activityId), parsed.data);
    if (!result) throw new ApiHttpError(404, "NOT_FOUND", "This run is no longer available");
    return success({ ...result, operation: { requestId: result.operation.requestId, operation: result.operation.operation, appliedRevision: result.operation.appliedRevision, stateRevision: result.operation.appliedStateRevision } });
  } catch (error) { throw mapReflectionError(error); }
}

export async function handleCloudWellbeingList(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const params = new URL(request.url).searchParams;
  const parsed = wellbeingRangeQuerySchema.safeParse({ from: params.get("from"), to: params.get("to") });
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Wellbeing date range is invalid", parsed.error.issues);
  return Response.json(dailyWellbeingListResponseSchema.parse({ data: { items: await getComposition().journal.listWellbeing(scope, parsed.data.from, parsed.data.to) } }));
}

export async function handleCloudSaveWellbeing(
  security: SensitiveRouteContext,
  request: Request,
  localDate: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireOwnerScope(security);
  const parsed = saveDailyWellbeingRequestSchema.safeParse(await readJson(request));
  if (!parsed.success || !/^\d{4}-\d{2}-\d{2}$/u.test(localDate)) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Daily check-in is invalid", parsed.success ? [] : parsed.error.issues);
  }
  try {
    return success(await getComposition().journal.saveWellbeing(scope, localDate, parsed.data));
  } catch (error) {
    if (error instanceof AthleteJournalConflictError) throw new ApiHttpError(409, "CONFLICT", "The check-in changed; reload and review the latest values");
    if (error instanceof AthleteJournalDateError) throw new ApiHttpError(400, "VALIDATION_ERROR", "Daily check-ins can only be saved for today in the selected timezone");
    throw error;
  }
}

export async function handleCloudLegacyActivityReviews(
  security: SensitiveRouteContext,
  activityId: string,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  return success({ items: await getComposition().activityReviews.listForActivity(scope, decodeId(activityId)) });
}

export async function handleCloudActivityReviewRequest(
  security: SensitiveRouteContext,
  activityId: string,
  request?: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireOwnerScope(security);
  const decodedActivityId = decodeId(activityId);
  let intent = {};
  if (request) {
    const raw = await request.text();
    if (raw.trim()) {
      let body: unknown;
      try { body = JSON.parse(raw); } catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON"); }
      const parsed = activityReviewRequestIntentSchema.safeParse(body);
      if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Feedback request is invalid", parsed.error.issues);
      intent = parsed.data;
    }
  }
  let result;
  try { result = await (getComposition().activityReviews.queue as any)(scope, decodedActivityId, intent); }
  catch (error) { if (error instanceof Error && (error as any).code === "CONFLICT") throw new ApiHttpError(409, "CONFLICT", error.message); throw error; }
  if (!result) throw new ApiHttpError(404, "NOT_FOUND", "Activity was not found");
  if (!(result.reused && result.status === "processing")) after(async () => {
    try {
      await runCloudCoachFeedbackBatch({ athleteId: scope.athleteId, activityId: decodedActivityId, limit: 1 });
    } catch (error) {
      console.warn("Requested coach feedback could not be scheduled", error instanceof Error ? error.message : "unknown error");
    }
  });
  return success(result, 202);
}

export async function handleCloudLatestActivityReviews(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const scope = requireScope(security);
  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 40) throw new ApiHttpError(400, "VALIDATION_ERROR", "Review limit is invalid");
  return success({ items: await getComposition().activityReviews.listLatest(scope, limit) });
}

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

export async function handleCloudActiveGoalContext(
  security: SensitiveRouteContext,
  getComposition: () => {
    coaching: Pick<CloudReadComposition["coaching"], "getActivePlan">;
    goalContexts: Pick<CloudReadComposition["goalContexts"], "findForPlan">;
  } = getCloudReadComposition,
) {
  const scope = requireScope(security);
  let plan;
  try {
    plan = await getComposition().coaching.getActivePlan(scope);
  } catch {
    return success({ context: goalContextRouteDataSchema.parse({
      state: "unavailable", plan: null, goal: null, milestones: null, projection: null,
    }) });
  }
  if (!plan) {
    return success({ context: goalContextRouteDataSchema.parse({
      state: "no_active_plan", plan: null, goal: null, milestones: null, projection: null,
    }) });
  }
  const planReference = {
    id: plan.id,
    version: plan.version,
    revision: plan.revision,
    startsOn: plan.startsOn,
    endsOn: plan.endsOn,
    timezone: plan.timezone,
    approvalContentHash: plan.approval.contentHash,
  };
  try {
    const context = await getComposition().goalContexts.findForPlan(scope, plan);
    if (!context) {
      return success({ context: goalContextRouteDataSchema.parse({
        state: "projection_pending", plan: planReference, goal: null, milestones: null, projection: null,
      }) });
    }
    return success({ context: goalContextRouteDataSchema.parse({
      state: "ready",
      plan: planReference,
      goal: context.goal,
      milestones: context.milestones,
      projection: { contextHash: context.contextHash, publishedAt: context.publishedAt },
    }) });
  } catch (error) {
    if (error instanceof TrainingPlanGoalContextUnavailableError) {
      return success({ context: goalContextRouteDataSchema.parse({
        state: "unavailable", plan: planReference, goal: null, milestones: null, projection: null,
      }) });
    }
    throw error;
  }
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
    return success(calendarRouteDataSchema.parse({ ...parsed.data, sessions, historicalSessions: [], activities: activityRead.activities, activitiesReadStatus: activityRead.status, timezone }));
  } catch (error) {
    reportCalendarSupplementFailure("calendar response projection", error);
    return success(calendarRouteDataSchema.parse({
      ...parsed.data,
      sessions: await approvedPlanCalendarSessions(composition, scope, parsed.data),
      historicalSessions: [],
      activities: [],
      activitiesReadStatus: "unavailable",
      timezone,
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
  const nextWorkout = allSessions
    .filter((session: CloudCalendarSession) => session.effectiveDate > projected.date && session.kind !== "rest" && session.status !== "skipped")
    .sort((left: CloudCalendarSession, right: CloudCalendarSession) => left.effectiveDate.localeCompare(right.effectiveDate) || left.id.localeCompare(right.id))[0];
  const scheduleKind = !effectiveSession
    ? "unscheduled" as const
    : effectiveSession.kind === "rest" ? "prescribed_rest" as const : "prescribed_session" as const;
  if (!effectiveSession) return success(todayRouteDataSchema.parse({
    ...projected,
    todayScheduleKind: scheduleKind,
    nextWorkout: nextWorkout ? toEffectiveWorkout(nextWorkout) : null,
  }));
  const state = effectiveSession.status === "skipped"
    ? "skipped"
    : projected.state;
  return success(todayRouteDataSchema.parse({
    ...projected,
    session: effectiveSession,
    sessionId: effectiveSession.id,
    todayScheduleKind: scheduleKind,
    nextWorkout: nextWorkout ? toEffectiveWorkout(nextWorkout) : null,
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

async function readBoundedJson(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ApiHttpError(413, "VALIDATION_ERROR", "Request body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ApiHttpError(413, "VALIDATION_ERROR", "Request body is too large");
  try { return JSON.parse(text) as unknown; } catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON"); }
}

function assertSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new ApiHttpError(403, "FORBIDDEN", "A same-origin request is required");
}

function mapReflectionError(error: unknown) {
  if (!(error instanceof AthleteJournalConflictError)) return error;
  const messages: Record<string, string> = {
    ACTIVITY_CHANGED: "The run changed; refresh its details before saving.",
    REFLECTION_VERSION_CHANGED: "This feedback changed in another session. Refresh before saving.",
    IDEMPOTENCY_CONFLICT: "This request identity was used for different feedback.",
    REFLECTION_EXISTS: "Delete the saved feedback before reopening this review.",
  };
  const structuredCodes = new Set<ApiErrorCode>(["ACTIVITY_CHANGED", "REFLECTION_CHANGED", "REFLECTION_VERSION_CHANGED", "REFLECTION_EXISTS", "IDEMPOTENCY_CONFLICT"]);
  return new ApiHttpError(409, structuredCodes.has(error.code as ApiErrorCode) ? error.code as ApiErrorCode : "CONFLICT", messages[error.code] ?? "The feedback changed. Refresh before saving.");
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
