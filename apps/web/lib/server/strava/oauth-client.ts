import { z } from "zod";
import { stravaRequiredScopes } from "../../../../../packages/core/src/contracts/providers.ts";
import type {
  ProviderTokenGrant,
  ProviderTokenRefreshGrant,
} from "../../../../../packages/core/src/ports/cloud-sync.ts";
import { assertServerRuntime } from "../server-runtime.ts";

assertServerRuntime("strava/oauth-client");

const AUTHORIZE_ENDPOINT = "https://www.strava.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://www.strava.com/oauth/token";
const REVOKE_ENDPOINT = "https://www.strava.com/oauth/revoke";

const initialGrantSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().int().positive(),
  scope: z.string().min(1),
  athlete: z.object({ id: z.union([z.string().min(1), z.number().int().positive()]) }).passthrough(),
}).passthrough();

const refreshGrantSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().int().positive(),
}).passthrough();

export class StravaProviderRequestError extends Error {
  readonly code: "STRAVA_INVALID_RESPONSE" | "STRAVA_REQUEST_FAILED";
  readonly providerStatus: number | null;
  readonly retryable: boolean;

  constructor(
    code: "STRAVA_INVALID_RESPONSE" | "STRAVA_REQUEST_FAILED",
    providerStatus: number | null,
    retryable: boolean,
  ) {
    super(code === "STRAVA_INVALID_RESPONSE"
      ? "Strava returned an invalid response"
      : "Strava request failed");
    this.name = "StravaProviderRequestError";
    this.code = code;
    this.providerStatus = providerStatus;
    this.retryable = retryable;
  }
}

export interface StravaOAuthClientConfiguration {
  clientId: string;
  clientSecret: string;
}

export interface StravaOAuthClientDependencies {
  fetch?: typeof fetch;
  now?: () => Date;
}

function expiration(epochSeconds: number) {
  return new Date(epochSeconds * 1000).toISOString();
}

function parseScopes(value: string) {
  return [...new Set(value.split(/[\s,]+/u).filter(Boolean))];
}

async function responseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new StravaProviderRequestError("STRAVA_INVALID_RESPONSE", response.status, false);
  }
}

function failedResponse(response: Response): never {
  throw new StravaProviderRequestError(
    "STRAVA_REQUEST_FAILED",
    response.status,
    response.status === 429 || response.status >= 500,
  );
}

export function createStravaOAuthClient(
  configuration: StravaOAuthClientConfiguration,
  dependencies: StravaOAuthClientDependencies = {},
) {
  const fetchImplementation = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date());

  return {
    provider: "strava" as const,

    async createAuthorization(input: { state: string; redirectUri: string }) {
      const url = new URL(AUTHORIZE_ENDPOINT);
      url.searchParams.set("client_id", configuration.clientId);
      url.searchParams.set("redirect_uri", input.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("approval_prompt", "auto");
      url.searchParams.set("scope", stravaRequiredScopes.join(","));
      url.searchParams.set("state", input.state);
      return {
        authorizationUrl: url.toString(),
        expiresAt: new Date(now().getTime() + 10 * 60 * 1000).toISOString(),
      };
    },

    async exchangeAuthorizationCode(input: { code: string; redirectUri: string }): Promise<ProviderTokenGrant> {
      const body = new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        code: input.code,
        grant_type: "authorization_code",
      });
      const response = await fetchImplementation(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) failedResponse(response);
      const parsed = initialGrantSchema.safeParse(await responseJson(response));
      if (!parsed.success) {
        throw new StravaProviderRequestError("STRAVA_INVALID_RESPONSE", response.status, false);
      }
      return Object.freeze({
        providerAthleteId: String(parsed.data.athlete.id),
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token,
        expiresAt: expiration(parsed.data.expires_at),
        scopes: Object.freeze(parseScopes(parsed.data.scope)),
      });
    },

    async refreshAuthorization(refreshToken: string): Promise<ProviderTokenRefreshGrant> {
      const body = new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
      const response = await fetchImplementation(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) failedResponse(response);
      const parsed = refreshGrantSchema.safeParse(await responseJson(response));
      if (!parsed.success) {
        throw new StravaProviderRequestError("STRAVA_INVALID_RESPONSE", response.status, false);
      }
      return Object.freeze({
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token,
        expiresAt: expiration(parsed.data.expires_at),
      });
    },

    async revokeAuthorization(input: {
      token: string;
      tokenTypeHint: "access_token" | "refresh_token";
    }): Promise<void> {
      const authorization = Buffer.from(
        `${configuration.clientId}:${configuration.clientSecret}`,
        "utf8",
      ).toString("base64");
      const response = await fetchImplementation(REVOKE_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Basic ${authorization}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token: input.token, token_type_hint: input.tokenTypeHint }),
      });
      if (!response.ok) failedResponse(response);
    },
  };
}

export const stravaOAuthEndpoints = Object.freeze({
  authorize: AUTHORIZE_ENDPOINT,
  token: TOKEN_ENDPOINT,
  revoke: REVOKE_ENDPOINT,
});
