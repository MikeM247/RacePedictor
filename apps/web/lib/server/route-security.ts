import type { ActorContext } from "./auth.ts";
import type { CloudEnvironment } from "./cloud-environment.ts";
import { ApiHttpError, failure } from "./api-response.ts";
import { readCloudEnvironment } from "./cloud-environment.ts";
import { getServerAuth } from "./composition.ts";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("route-security");

export type SensitiveRouteContext =
  | { mode: "local"; actor: null }
  | { mode: "authenticated"; actor: ActorContext };

type MaybePromise<T> = T | Promise<T>;
type ActorRequirement = Pick<ReturnType<typeof getServerAuth>, "requireActor">;

export interface RouteSecurityDependencies {
  readEnvironment(): CloudEnvironment;
  getAuth(): ActorRequirement;
}

export interface SensitiveRouteOptions {
  /**
   * Opt in only after the handler uses security.actor.activeAthleteId for all
   * reads and writes. Legacy local/global handlers remain unavailable in cloud.
   */
  cloudHandling?: "actor-scoped";
}

const defaultDependencies: RouteSecurityDependencies = {
  readEnvironment: readCloudEnvironment,
  getAuth: getServerAuth,
};

export function requiresAuthenticatedActor(environment: CloudEnvironment) {
  return environment.runtime === "production" || environment.cloudMode === "enabled";
}

export function isPublicApiPath(pathname: string) {
  return pathname === "/api/v1/health"
    || pathname === "/api/v1/auth/session"
    || pathname === "/api/v1/providers/strava/webhook";
}

export function isDeviceAuthenticatedApiPath(pathname: string) {
  return pathname === "/api/v1/sync/device/changes"
    || pathname === "/api/v1/sync/device/acknowledge"
    || pathname === "/api/v1/sync/device/plans"
    || pathname === "/api/v1/sync/device/failure"
    || pathname === "/api/v1/second-brain-context/snapshots";
}

export function isInternalAuthenticatedApiPath(pathname: string) {
  return pathname === "/api/v1/internal/reconciliation";
}

function cloudUnavailable() {
  return new ApiHttpError(
    503,
    "CONFIGURATION_ERROR",
    "This operation is not available in cloud mode",
  );
}

async function resolveSensitiveRouteContext(
  request: Request,
  dependencies: RouteSecurityDependencies,
): Promise<SensitiveRouteContext> {
  const environment = dependencies.readEnvironment();
  if (!requiresAuthenticatedActor(environment)) {
    return { mode: "local", actor: null };
  }

  const actor = await dependencies.getAuth().requireActor(request);
  return { mode: "authenticated", actor };
}

export function createSensitiveRouteWrapper(dependencies: RouteSecurityDependencies = defaultDependencies) {
  return function withSensitiveRoute<TRest extends unknown[]>(
    handler: (
      security: SensitiveRouteContext,
      request: Request,
      ...rest: TRest
    ) => MaybePromise<Response>,
    options: SensitiveRouteOptions = {},
  ) {
    return async (request: Request, ...rest: TRest): Promise<Response> => {
      try {
        const security = await resolveSensitiveRouteContext(request, dependencies);
        if (security.mode === "authenticated" && options.cloudHandling !== "actor-scoped") {
          throw cloudUnavailable();
        }
        return await handler(security, request, ...rest);
      } catch (error) {
        return failure(error);
      }
    };
  };
}

export const withSensitiveRoute = createSensitiveRouteWrapper();

/**
 * Front-door check for protected pages and APIs. Route handlers still use
 * withSensitiveRoute so this optimistic boundary is never the only defense.
 */
export async function sensitiveBoundaryDenial(
  request: Request,
  dependencies: RouteSecurityDependencies = defaultDependencies,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (isPublicApiPath(pathname) || isDeviceAuthenticatedApiPath(pathname) || isInternalAuthenticatedApiPath(pathname)) return null;

  try {
    await resolveSensitiveRouteContext(request, dependencies);
    return null;
  } catch (error) {
    return failure(error);
  }
}
