import { createHash, timingSafeEqual } from "node:crypto";
import { ApiHttpError, failure } from "./api-response.ts";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("internal-route-security");

export interface InternalRouteDependencies {
  readSecret(): string | undefined;
}

const defaults: InternalRouteDependencies = { readSecret: () => process.env.CRON_SECRET };

export function createInternalRouteWrapper(dependencies: InternalRouteDependencies = defaults) {
  return function withInternalRoute(handler: (request: Request) => Response | Promise<Response>) {
    return async (request: Request) => {
      try {
        const expected = dependencies.readSecret()?.trim();
        if (!expected || expected.length < 32 || expected.length > 512) {
          throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Scheduled recovery is not configured");
        }
        const authorization = request.headers.get("authorization");
        const actual = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!safeEqual(actual, expected)) throw new ApiHttpError(401, "UNAUTHENTICATED", "Internal authentication failed");
        return await handler(request);
      } catch (error) {
        return failure(error);
      }
    };
  };
}

export const withInternalRoute = createInternalRouteWrapper();

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
