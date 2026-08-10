import { randomUUID } from "node:crypto";
import { PairedDeviceError, type AuthenticatedDevice } from "../../../../packages/core/src/use-cases/paired-device.ts";
import { ApiHttpError, failure } from "./api-response.ts";
import { getDeviceSyncComposition } from "./device-sync-composition.ts";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("device-route-security");

type MaybePromise<T> = T | Promise<T>;
type DeviceAuthenticator = Pick<ReturnType<typeof getDeviceSyncComposition>["deviceService"], "authenticate">;

export interface DeviceRouteDependencies {
  getAuthenticator(): DeviceAuthenticator;
  requestId(): string;
}

const defaultDependencies: DeviceRouteDependencies = {
  getAuthenticator: () => getDeviceSyncComposition().deviceService,
  requestId: () => randomUUID(),
};

export function createDeviceRouteWrapper(dependencies: DeviceRouteDependencies = defaultDependencies) {
  return function withDeviceRoute<TRest extends unknown[]>(
    handler: (
      security: AuthenticatedDevice,
      request: Request,
      ...rest: TRest
    ) => MaybePromise<Response>,
  ) {
    return async (request: Request, ...rest: TRest): Promise<Response> => {
      try {
        const authorization = request.headers.get("authorization");
        const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
        const security = await dependencies.getAuthenticator().authenticate(token, dependencies.requestId());
        return await handler(security, request, ...rest);
      } catch (error) {
        if (error instanceof PairedDeviceError) {
          return failure(new ApiHttpError(401, "UNAUTHENTICATED", "Device authentication failed"));
        }
        return failure(error);
      }
    };
  };
}

export const withDeviceRoute = createDeviceRouteWrapper();
