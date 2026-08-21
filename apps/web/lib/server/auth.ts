import { ApiHttpError } from "./api-response.ts";
import type { CloudEnvironment } from "./cloud-environment.ts";
import { assertServerRuntime } from "./server-runtime.ts";
import { buildActorContext, type ActorContext } from "../../../../packages/core/src/contracts/auth.ts";

assertServerRuntime("auth");

export type { ActorContext } from "../../../../packages/core/src/contracts/auth.ts";

export interface SessionStatus {
  authenticated: boolean;
  actor: null | Pick<ActorContext, "userId" | "activeAthleteId" | "credentialKind">;
  reason: "authentication_not_configured" | "unauthenticated" | null;
}

export interface ServerAuth {
  getSessionStatus(request: Request): Promise<SessionStatus>;
  requireActor(request: Request): Promise<ActorContext>;
  requireAthleteAccess(actor: ActorContext, athleteId: string): void;
}

export interface ServerAuthOptions {
  environment: CloudEnvironment;
  productionActorResolver?: (request: Request) => ActorContext | null | Promise<ActorContext | null>;
  /**
   * Test/development composition may supply an actor resolver explicitly.
   * No resolver is read from a request header or environment variable.
   */
  syntheticActorResolver?: (request: Request) => ActorContext | null | Promise<ActorContext | null>;
}

function unauthenticated(reason: SessionStatus["reason"]): ApiHttpError {
  return new ApiHttpError(
    401,
    "UNAUTHENTICATED",
    reason === "authentication_not_configured"
      ? "Authentication is not configured"
      : "Authentication is required",
  );
}

export function createServerAuth({
  environment,
  productionActorResolver,
  syntheticActorResolver,
}: ServerAuthOptions): ServerAuth {
  const resolver = environment.runtime === "production"
    ? (environment.ownerAuthConfigured ? productionActorResolver : undefined)
    : syntheticActorResolver;

  async function resolveActor(request: Request) {
    if (!resolver) return null;
    return resolver(request);
  }

  return {
    async getSessionStatus(request) {
      const actor = await resolveActor(request);
      if (actor) {
        return {
          authenticated: true,
          actor: {
            userId: actor.userId,
            activeAthleteId: actor.activeAthleteId,
            credentialKind: actor.credentialKind,
          },
          reason: null,
        };
      }

      return {
        authenticated: false,
        actor: null,
        reason: environment.ownerAuthConfigured ? "unauthenticated" : "authentication_not_configured",
      };
    },
    async requireActor(request) {
      const actor = await resolveActor(request);
      if (actor) return actor;
      throw unauthenticated(environment.ownerAuthConfigured ? "unauthenticated" : "authentication_not_configured");
    },
    requireAthleteAccess(actor, athleteId) {
      if (!actor.permittedAthleteIds.includes(athleteId)) {
        throw new ApiHttpError(403, "FORBIDDEN", "You do not have access to this athlete");
      }
    },
  };
}

/**
 * Use only in isolated tests or explicitly injected development composition.
 * It is intentionally not derived from request input and is rejected in
 * production by createServerAuth.
 */
export function createSyntheticTestActor(subjectId: string, athleteIds: readonly string[]): ActorContext {
  const activeAthleteId = athleteIds[0];
  if (!activeAthleteId) throw new Error("A synthetic actor needs at least one permitted athlete");
  return buildActorContext({
    userId: subjectId,
    permittedAthleteIds: [...athleteIds],
    activeAthleteId,
    requestId: "synthetic-test-request",
    credentialKind: "internal",
  });
}
