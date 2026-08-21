import { ZodError } from "zod";
import { athleteScopeFor, type AthleteScope } from "../../../../../../../packages/core/src/contracts/auth.ts";
import type { StravaBackfillRequest } from "../../../../../../../packages/core/src/contracts/strava.ts";
import {
  StravaConnectionError,
  type StravaConnectionService,
} from "../../../../../../../packages/core/src/use-cases/strava-connection.ts";
import { ApiHttpError, type ApiErrorCode } from "../../../../../lib/server/api-response.ts";
import type { SensitiveRouteContext } from "../../../../../lib/server/route-security.ts";
import { getStravaConnectionComposition } from "../../../../../lib/server/strava/composition.ts";
import { getStravaIngestionComposition } from "../../../../../lib/server/strava/ingestion-composition.ts";

export interface StravaRouteComposition {
  redirectUri: string;
  service: StravaConnectionService;
  enqueueBackfill?: (scope: AthleteScope, request: StravaBackfillRequest) => Promise<{ jobId: string; reused: boolean }>;
  enqueueInitialBackfill?: (scope: AthleteScope) => Promise<{ jobId: string; reused: boolean }>;
}

export type GetStravaRouteComposition = () => StravaRouteComposition;

export const defaultStravaRouteComposition: GetStravaRouteComposition = () => {
  const connection = getStravaConnectionComposition();
  return {
    ...connection,
    enqueueBackfill: (scope, request) => getStravaIngestionComposition().enqueueBackfill(scope, request),
    enqueueInitialBackfill: (scope) => getStravaIngestionComposition().enqueueInitialBackfill(scope),
  };
};

export function requireStravaAthleteScope(security: SensitiveRouteContext): AthleteScope {
  if (security.mode !== "authenticated") {
    throw new ApiHttpError(
      503,
      "CONFIGURATION_ERROR",
      "Strava connection is available only when cloud mode is enabled",
    );
  }
  return athleteScopeFor(security.actor);
}

export function translateStravaRouteError(error: unknown): never {
  if (error instanceof ApiHttpError) throw error;
  if (error instanceof ZodError) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Request validation failed", error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })));
  }
  if (error instanceof StravaConnectionError) {
    const publicCode: ApiErrorCode = error.code === "FORBIDDEN"
      ? "FORBIDDEN"
      : error.code === "VALIDATION_ERROR"
        ? "VALIDATION_ERROR"
        : error.code === "PROVIDER_CONNECTION_CONFLICT" || error.code === "PROVIDER_NOT_CONNECTED"
          ? "CONFLICT"
          : error.code === "OAUTH_EXCHANGE_FAILED" || error.code === "PROVIDER_REFRESH_FAILED"
            ? "UNAVAILABLE"
            : error.code;
    throw new ApiHttpError(error.status, publicCode, error.message);
  }
  throw error;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "A valid JSON request body is required");
  }
}
