import { z } from "zod";
import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import { runReviewStateResponseSchema } from "../../../../packages/core/src/contracts/athlete-journal.ts";
import { ApiHttpError, success } from "./api-response.ts";
import { getCloudReadComposition } from "./cloud-read-composition.ts";
import { readCloudEnvironment } from "./cloud-environment.ts";
import type { SensitiveRouteContext } from "./route-security.ts";

const tabIdSchema = z.string().uuid();
const reserveSchema = z.object({ tabId: tabIdSchema }).strict();
const presentSchema = z.object({ token: z.string().uuid(), tabId: tabIdSchema }).strict();
const outcomeSchema = z.object({ token: z.string().uuid(), tabId: tabIdSchema, outcome: z.enum(["shown", "deferred", "accepted"]) }).strict();

function scopeForCoach(security: SensitiveRouteContext) {
  if (security.mode !== "authenticated" || security.actor.credentialKind !== "session") throw new ApiHttpError(403, "FORBIDDEN", "A signed-in owner session is required");
  if (!readCloudEnvironment().features.coachUi) throw new ApiHttpError(503, "UNAVAILABLE", "Coach is not enabled");
  return athleteScopeFor(security.actor);
}

async function readBody(request: Request, maxBytes = 8192) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new ApiHttpError(413, "VALIDATION_ERROR", "Request is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ApiHttpError(413, "VALIDATION_ERROR", "Request is too large");
  try { return JSON.parse(text) as unknown; } catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON"); }
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new ApiHttpError(403, "FORBIDDEN", "A same-origin request is required");
}

export async function handleRunReviewGet(security: SensitiveRouteContext, request: Request) {
  const scope = scopeForCoach(security);
  const activityId = new URL(request.url).searchParams.get("activityId");
  if (activityId) {
    const [activity, journal, review] = await Promise.all([
      getCloudReadComposition().activities.findById(scope, activityId),
      getCloudReadComposition().journal.getRunReviewState(scope, activityId),
      getCloudReadComposition().activityReviews.get(scope, activityId),
    ]);
    if (!activity || !["run", "trail_run", "treadmill_run"].includes(activity.sport)) throw new ApiHttpError(404, "NOT_FOUND", "This run is not available");
    return success({ mode: "activity", activity, reflection: journal.reflection, state: journal.state, activityRevision: journal.activityRevision, review });
  }
  const reviews = getCloudReadComposition().runReviews;
  const [candidate, offer] = await Promise.all([
    reviews.getCandidate(scope),
    scope.actor.runReviewLoginId ? reviews.getOffer(scope, scope.actor.runReviewLoginId) : Promise.resolve(null),
  ]);
  return success({ mode: "entry", candidate, offer: offer?.consumedAt ? { status: "consumed", consumedAt: offer.consumedAt } : offer ? { status: offer.status } : null, automaticEnabled: readCloudEnvironment().features.coachRunReviewAuto });
}

export async function handleRunReviewReserve(security: SensitiveRouteContext, request: Request) {
  const scope = scopeForCoach(security);
  sameOrigin(request);
  if (!readCloudEnvironment().features.coachRunReviewAuto) return success({ status: "disabled", offer: null });
  const parsed = reserveSchema.safeParse(await readBody(request));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Offer reservation request is invalid", parsed.error.issues);
  return success(await getCloudReadComposition().runReviews.reserve(scope, parsed.data));
}

export async function handleRunReviewPresent(security: SensitiveRouteContext, request: Request, offerId: string) {
  const scope = scopeForCoach(security);
  sameOrigin(request);
  const parsed = presentSchema.safeParse(await readBody(request));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Offer presentation request is invalid", parsed.error.issues);
  const result = await getCloudReadComposition().runReviews.consume(scope, { offerId, ...parsed.data });
  return success(result);
}

export async function handleRunReviewOutcome(security: SensitiveRouteContext, request: Request, offerId: string) {
  const scope = scopeForCoach(security);
  sameOrigin(request);
  const parsed = outcomeSchema.safeParse(await readBody(request));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Offer outcome is invalid", parsed.error.issues);
  const result = await getCloudReadComposition().runReviews.recordOutcome(scope, { offerId, ...parsed.data });
  if (!result) throw new ApiHttpError(404, "NOT_FOUND", "The run-review offer was not found");
  return success({ id: result.id, outcome: result.outcome });
}

export async function handleRunReviewFeedbackGet(security: SensitiveRouteContext, activityId: string) {
  const scope = scopeForCoach(security);
  const [activity, journal] = await Promise.all([
    getCloudReadComposition().activities.findById(scope, activityId),
    getCloudReadComposition().journal.getRunReviewState(scope, activityId),
  ]);
  if (!activity || !["run", "trail_run", "treadmill_run"].includes(activity.sport)) throw new ApiHttpError(404, "NOT_FOUND", "This run is not available");
  return success(runReviewStateResponseSchema.parse({ data: { state: journal.state, reflection: journal.reflection, activityRevision: journal.activityRevision } }));
}
