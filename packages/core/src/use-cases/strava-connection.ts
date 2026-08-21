import {
  providerAuthorizationCallbackSchema,
  providerAuthorizationRequestSchema,
  providerConnectionStatusSchema,
  stravaRequiredScopes,
  type ProviderAuthorizationCallback,
  type ProviderAuthorizationRequest,
  type ProviderAuthorizationResult,
  type ProviderConnectionStatus,
  type ProviderDisconnectResult,
} from "../contracts/providers.ts";
import type { AthleteScope } from "../contracts/auth.ts";
import type {
  ProviderAdapter,
  ProviderConnectionRepository,
  ProviderOAuthAttemptRepository,
  ProviderTokenGrant,
  ProviderTokenRefreshGrant,
} from "../ports/cloud-sync.ts";

export type StravaConnectionErrorCode =
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_STATE_EXPIRED"
  | "OAUTH_STATE_REPLAYED"
  | "OAUTH_ACCESS_DENIED"
  | "OAUTH_SCOPE_INSUFFICIENT"
  | "OAUTH_EXCHANGE_FAILED"
  | "PROVIDER_NOT_CONNECTED"
  | "PROVIDER_REFRESH_FAILED"
  | "PROVIDER_CONNECTION_CONFLICT";

export class StravaConnectionError extends Error {
  readonly code: StravaConnectionErrorCode;
  readonly status: number;

  constructor(status: number, code: StravaConnectionErrorCode, message: string) {
    super(message);
    this.name = "StravaConnectionError";
    this.status = status;
    this.code = code;
  }
}

export interface StravaConnectionServiceDependencies {
  provider: Pick<ProviderAdapter,
    | "provider"
    | "createAuthorization"
    | "exchangeAuthorizationCode"
    | "refreshAuthorization"
    | "revokeAuthorization">;
  connections: ProviderConnectionRepository;
  attempts: ProviderOAuthAttemptRepository;
  now(): Date;
  createOpaqueState(): string;
  hashState(state: string): string;
  stateTtlSeconds?: number;
}

export interface CompleteAuthorizationResult {
  connection: ProviderConnectionStatus;
  returnTo: string;
}

export interface StravaConnectionService {
  start(scope: AthleteScope, request: ProviderAuthorizationRequest, redirectUri: string): Promise<ProviderAuthorizationResult>;
  complete(scope: AthleteScope, callback: ProviderAuthorizationCallback, redirectUri: string): Promise<CompleteAuthorizationResult>;
  status(scope: AthleteScope): Promise<ProviderConnectionStatus>;
  refresh(scope: AthleteScope): Promise<ProviderConnectionStatus>;
  disconnect(scope: AthleteScope): Promise<ProviderDisconnectResult>;
  deauthorize(scope: AthleteScope): Promise<ProviderConnectionStatus>;
}

const PROVIDER = "strava" as const;
const DEFAULT_RETURN_TO = "/dashboard/settings";
const DEFAULT_STATE_TTL_SECONDS = 10 * 60;

function statusForDisconnected(athleteId: string, now: string): ProviderConnectionStatus {
  return providerConnectionStatusSchema.parse({
    athleteId,
    provider: PROVIDER,
    status: "disconnected",
    displayStatus: "disconnected",
    connectedAt: null,
    lastSuccessfulProviderContactAt: null,
    lastSuccessfulSyncAt: null,
    lastEventReceivedAt: null,
    lastErrorCode: null,
    updatedAt: now,
  });
}

function parseGrantedScopes(value: string | undefined): readonly string[] {
  if (!value) return [];
  return [...new Set(value.split(/[\s,]+/u).map((scope) => scope.trim()).filter(Boolean))];
}

function hasRequiredScopes(scopes: readonly string[]) {
  const granted = new Set(scopes);
  return stravaRequiredScopes.every((scope) => granted.has(scope));
}

function validateGrant(grant: ProviderTokenGrant, now: Date): void {
  if (!grant.providerAthleteId.trim()
      || !grant.accessToken
      || !grant.refreshToken
      || !hasRequiredScopes(grant.scopes)
      || !Number.isFinite(Date.parse(grant.expiresAt))
      || Date.parse(grant.expiresAt) <= now.getTime()) {
    throw new StravaConnectionError(
      400,
      "OAUTH_SCOPE_INSUFFICIENT",
      "Strava did not grant the activity access RacePredictor needs",
    );
  }
}

function validateRefreshGrant(grant: ProviderTokenRefreshGrant, now: Date): void {
  if (!grant.accessToken
      || !grant.refreshToken
      || !Number.isFinite(Date.parse(grant.expiresAt))
      || Date.parse(grant.expiresAt) <= now.getTime()) {
    throw new Error("Invalid provider refresh response");
  }
}

export function createStravaConnectionService(
  dependencies: StravaConnectionServiceDependencies,
): StravaConnectionService {
  if (dependencies.provider.provider !== PROVIDER) {
    throw new Error("The Strava connection service requires the Strava provider adapter");
  }
  const stateTtlSeconds = dependencies.stateTtlSeconds ?? DEFAULT_STATE_TTL_SECONDS;
  if (!Number.isInteger(stateTtlSeconds) || stateTtlSeconds < 60 || stateTtlSeconds > 30 * 60) {
    throw new Error("OAuth state lifetime must be between 60 and 1800 seconds");
  }

  return {
    async start(scope, request, redirectUri) {
      const input = providerAuthorizationRequestSchema.parse(request);
      if (input.athleteId !== scope.athleteId) {
        throw new StravaConnectionError(403, "FORBIDDEN", "You do not have access to this athlete");
      }

      const now = dependencies.now();
      const occurredAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + stateTtlSeconds * 1000).toISOString();
      const state = dependencies.createOpaqueState();
      if (state.length < 32) throw new Error("OAuth state generator returned insufficient entropy");
      const stateHash = dependencies.hashState(state);

      await dependencies.connections.beginConnecting(scope, PROVIDER, occurredAt);
      await dependencies.attempts.create(scope, {
        provider: PROVIDER,
        stateHash,
        redirectUri,
        returnTo: input.returnTo ?? DEFAULT_RETURN_TO,
        expiresAt,
      });

      try {
        const authorization = await dependencies.provider.createAuthorization({ state, redirectUri });
        return { authorizationUrl: authorization.authorizationUrl, expiresAt };
      } catch {
        await dependencies.connections.recordFailure(scope, PROVIDER, {
          diagnosticCode: "OAUTH_START_FAILED",
          occurredAt,
        });
        throw new StravaConnectionError(503, "OAUTH_EXCHANGE_FAILED", "Strava connection is temporarily unavailable");
      }
    },

    async complete(scope, callback, redirectUri) {
      const input = providerAuthorizationCallbackSchema.parse(callback);
      const now = dependencies.now();
      const occurredAt = now.toISOString();
      const consumed = await dependencies.attempts.consume(scope, {
        provider: PROVIDER,
        stateHash: dependencies.hashState(input.state),
        now: occurredAt,
      });

      if (consumed.outcome !== "consumed") {
        const code = consumed.outcome === "expired"
          ? "OAUTH_STATE_EXPIRED"
          : consumed.outcome === "replayed"
            ? "OAUTH_STATE_REPLAYED"
            : "OAUTH_STATE_INVALID";
        throw new StravaConnectionError(400, code, "The Strava connection request is invalid or has expired");
      }
      if (consumed.attempt.redirectUri !== redirectUri) {
        await dependencies.connections.recordFailure(scope, PROVIDER, {
          diagnosticCode: "OAUTH_REDIRECT_MISMATCH",
          occurredAt,
        });
        throw new StravaConnectionError(400, "OAUTH_STATE_INVALID", "The Strava connection request is invalid or has expired");
      }

      if (input.error) {
        await dependencies.connections.recordFailure(scope, PROVIDER, {
          diagnosticCode: input.error === "access_denied" ? "OAUTH_ACCESS_DENIED" : "OAUTH_CALLBACK_ERROR",
          occurredAt,
        });
        throw new StravaConnectionError(400, "OAUTH_ACCESS_DENIED", "Strava access was not granted");
      }

      const callbackScopes = parseGrantedScopes(input.scope);
      if (!input.code || !hasRequiredScopes(callbackScopes)) {
        await dependencies.connections.recordFailure(scope, PROVIDER, {
          diagnosticCode: input.code ? "OAUTH_SCOPE_INSUFFICIENT" : "OAUTH_CODE_MISSING",
          occurredAt,
        });
        throw new StravaConnectionError(
          400,
          input.code ? "OAUTH_SCOPE_INSUFFICIENT" : "VALIDATION_ERROR",
          input.code
            ? "Strava did not grant the activity access RacePredictor needs"
            : "The Strava authorization code is missing",
        );
      }

      let grant: ProviderTokenGrant | null = null;
      try {
        grant = await dependencies.provider.exchangeAuthorizationCode({ code: input.code, redirectUri });
        validateGrant(grant, now);
      } catch (error) {
        if (error instanceof StravaConnectionError && grant) {
          try {
            await dependencies.provider.revokeAuthorization({
              token: grant.refreshToken,
              tokenTypeHint: "refresh_token",
            });
          } catch {
            // The unusable grant is never persisted. Remote cleanup is best effort.
          }
        }
        await dependencies.connections.recordFailure(scope, PROVIDER, {
          diagnosticCode: error instanceof StravaConnectionError
            ? error.code
            : "OAUTH_EXCHANGE_FAILED",
          occurredAt,
        });
        if (error instanceof StravaConnectionError) throw error;
        throw new StravaConnectionError(503, "OAUTH_EXCHANGE_FAILED", "Strava connection is temporarily unavailable");
      }

      if (!grant) throw new Error("Provider grant was not created");

      try {
        const connection = await dependencies.connections.saveCredentials(scope, PROVIDER, {
          ...grant,
          contactedAt: occurredAt,
        });
        return { connection, returnTo: consumed.attempt.returnTo };
      } catch {
        throw new StravaConnectionError(
          409,
          "PROVIDER_CONNECTION_CONFLICT",
          "This Strava account is already linked",
        );
      }
    },

    async status(scope) {
      return await dependencies.connections.get(scope, PROVIDER)
        ?? statusForDisconnected(scope.athleteId, dependencies.now().toISOString());
    },

    async refresh(scope) {
      const current = await dependencies.connections.getCredentials(scope, PROVIDER);
      if (!current) {
        throw new StravaConnectionError(409, "PROVIDER_NOT_CONNECTED", "Strava is not connected");
      }
      const now = dependencies.now();
      try {
        const refreshed = await dependencies.provider.refreshAuthorization(current.refreshToken);
        validateRefreshGrant(refreshed, now);
        return await dependencies.connections.rotateCredentials(scope, PROVIDER, {
          ...refreshed,
          contactedAt: now.toISOString(),
        });
      } catch {
        await dependencies.connections.recordFailure(scope, PROVIDER, {
          diagnosticCode: "PROVIDER_REFRESH_FAILED",
          occurredAt: now.toISOString(),
        });
        throw new StravaConnectionError(503, "PROVIDER_REFRESH_FAILED", "Strava access needs attention");
      }
    },

    async disconnect(scope) {
      const now = dependencies.now().toISOString();
      const current = await dependencies.connections.getCredentials(scope, PROVIDER);
      if (!current) {
        return {
          connection: await dependencies.connections.disconnect(scope, PROVIDER, { occurredAt: now }),
          providerRevocationConfirmed: true,
        };
      }

      try {
        await dependencies.provider.revokeAuthorization({
          token: current.refreshToken,
          tokenTypeHint: "refresh_token",
        });
        return {
          connection: await dependencies.connections.disconnect(scope, PROVIDER, { occurredAt: now }),
          providerRevocationConfirmed: true,
        };
      } catch {
        return {
          connection: await dependencies.connections.disconnect(scope, PROVIDER, {
            occurredAt: now,
            diagnosticCode: "REMOTE_REVOCATION_FAILED",
          }),
          providerRevocationConfirmed: false,
        };
      }
    },

    async deauthorize(scope) {
      return dependencies.connections.revoke(scope, PROVIDER, dependencies.now().toISOString());
    },
  };
}
