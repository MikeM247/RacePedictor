import {
  providerAuthorizationCallbackSchema,
  providerAuthorizationRequestSchema,
} from "../../../../../../../packages/core/src/contracts/providers.ts";
import { stravaBackfillRequestSchema } from "../../../../../../../packages/core/src/contracts/strava.ts";
import { ApiHttpError, success } from "../../../../../lib/server/api-response.ts";
import type { SensitiveRouteContext } from "../../../../../lib/server/route-security.ts";
import {
  defaultStravaRouteComposition,
  readJsonBody,
  requireStravaAthleteScope,
  translateStravaRouteError,
  type GetStravaRouteComposition,
} from "./_shared.ts";

const callbackKeys = ["state", "code", "scope", "error"] as const;

function callbackInput(request: Request) {
  const parameters = new URL(request.url).searchParams;
  for (const key of callbackKeys) {
    if (parameters.getAll(key).length > 1) {
      return providerAuthorizationCallbackSchema.parse({});
    }
  }
  return providerAuthorizationCallbackSchema.parse(Object.fromEntries(
    callbackKeys.flatMap((key) => {
      const value = parameters.get(key);
      return value === null ? [] : [[key, value]];
    }),
  ));
}

export async function handleStravaConnect(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetStravaRouteComposition = defaultStravaRouteComposition,
) {
  try {
    const scope = requireStravaAthleteScope(security);
    const input = providerAuthorizationRequestSchema.parse(await readJsonBody(request));
    const composition = getComposition();
    return success(await composition.service.start(scope, input, composition.redirectUri), 201);
  } catch (error) {
    translateStravaRouteError(error);
  }
}

export async function handleStravaCallback(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetStravaRouteComposition = defaultStravaRouteComposition,
) {
  try {
    const scope = requireStravaAthleteScope(security);
    const composition = getComposition();
    const completed = await composition.service.complete(
      scope,
      callbackInput(request),
      composition.redirectUri,
    );
    let initialBackfill = "unavailable";
    try {
      const queued = await composition.enqueueInitialBackfill?.(scope);
      if (queued) initialBackfill = queued.reused ? "already_queued" : "queued";
    } catch {
      // The connection succeeded. Initial backfill is a separate recoverable
      // operation, but the return UI must make a failed queue visible.
    }
    const location = new URL(completed.returnTo, request.url);
    location.searchParams.set("provider", "strava");
    location.searchParams.set("connection", "connected");
    location.searchParams.set("backfill", initialBackfill);
    return Response.redirect(location, 303);
  } catch (error) {
    translateStravaRouteError(error);
  }
}

export async function handleStravaBackfill(
  security: SensitiveRouteContext,
  request: Request,
  getComposition: GetStravaRouteComposition = defaultStravaRouteComposition,
) {
  try {
    const scope = requireStravaAthleteScope(security);
    const input = stravaBackfillRequestSchema.parse(await readJsonBody(request));
    const enqueue = getComposition().enqueueBackfill;
    if (!enqueue) throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Strava ingestion is unavailable");
    const queued = await enqueue(scope, input);
    return success({ ...queued, status: "queued", bounds: input }, 202);
  } catch (error) {
    translateStravaRouteError(error);
  }
}

export async function handleStravaBackfillStatus(
  security: SensitiveRouteContext,
  _request: Request,
  getComposition: GetStravaRouteComposition = defaultStravaRouteComposition,
) {
  try {
    const scope = requireStravaAthleteScope(security);
    const list = getComposition().listRecentBackfills;
    if (!list) throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Strava import status is unavailable");
    return success({ jobs: await list(scope) });
  } catch (error) {
    translateStravaRouteError(error);
  }
}

export async function handleStravaStatus(
  security: SensitiveRouteContext,
  _request: Request,
  getComposition: GetStravaRouteComposition = defaultStravaRouteComposition,
) {
  try {
    const scope = requireStravaAthleteScope(security);
    return success({ connection: await getComposition().service.status(scope) });
  } catch (error) {
    translateStravaRouteError(error);
  }
}

export async function handleStravaDisconnect(
  security: SensitiveRouteContext,
  _request: Request,
  getComposition: GetStravaRouteComposition = defaultStravaRouteComposition,
) {
  try {
    const scope = requireStravaAthleteScope(security);
    return success(await getComposition().service.disconnect(scope));
  } catch (error) {
    translateStravaRouteError(error);
  }
}
