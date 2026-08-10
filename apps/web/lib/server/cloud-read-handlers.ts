import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import { syncChangesQuerySchema } from "../../../../packages/core/src/contracts/sync.ts";
import { projectOnlineStatus } from "../../../../packages/core/src/services/online-status.ts";
import { calendarQueryRequestSchema, todayQueryRequestSchema } from "../../../../packages/core/src/contracts/coaching.ts";
import { projectCloudCalendar, projectCloudToday } from "../../../../packages/core/src/services/cloud-coaching.ts";
import {
  CloudActivityCursorError,
  CloudCoachingProjectionError,
  CloudSyncCursorError,
} from "../../../../packages/db/src/cloud/index.js";
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

export async function handleCloudCalendar(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetCloudReadComposition = getCloudReadComposition,
) {
  const params = new URL(request.url).searchParams;
  const parsed = calendarQueryRequestSchema.safeParse({ from: params.get("from"), to: params.get("to") });
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Calendar date range is invalid");
  const scope = requireScope(security);
  const plan = await safelyReadCoaching(() => getComposition().coaching.getActivePlan(scope));
  return success(projectCloudCalendar({ plan, ...parsed.data }));
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
  return success(projectCloudToday({ athleteId: scope.athleteId, plan, date: parsed.data.date, generatedAt: now() }));
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
