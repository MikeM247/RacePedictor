import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import type { AthleteScope } from "../../../packages/core/src/contracts/auth.ts";
import { buildActorContext } from "../../../packages/core/src/contracts/auth.ts";
import type { StravaConnectionService } from "../../../packages/core/src/use-cases/strava-connection.ts";
import { POST as defaultConnect } from "../app/api/v1/providers/strava/connect/route.ts";
import {
  handleStravaBackfill,
  handleStravaCallback,
  handleStravaConnect,
  handleStravaDisconnect,
  handleStravaStatus,
} from "../app/api/v1/providers/strava/handlers.ts";
import type { SensitiveRouteContext } from "../lib/server/route-security.ts";
import {
  readStravaConnectionConfiguration,
  StravaConfigurationError,
} from "../lib/server/strava/configuration.ts";
import {
  createStravaOAuthClient,
  StravaProviderRequestError,
  stravaOAuthEndpoints,
} from "../lib/server/strava/oauth-client.ts";

const redirectUri = "https://race.example/api/v1/providers/strava/callback";
const status = {
  athleteId: "athlete-a",
  provider: "strava" as const,
  status: "connected" as const,
  displayStatus: "connected" as const,
  connectedAt: "2026-08-10T12:00:00.000Z",
  lastSuccessfulProviderContactAt: "2026-08-10T12:00:00.000Z",
  lastSuccessfulSyncAt: null,
  lastEventReceivedAt: null,
  lastErrorCode: null,
  updatedAt: "2026-08-10T12:00:00.000Z",
};

function authenticated(): SensitiveRouteContext {
  return {
    mode: "authenticated",
    actor: buildActorContext({
      userId: "owner-a",
      permittedAthleteIds: ["athlete-a"],
      activeAthleteId: "athlete-a",
      requestId: "request-a",
      credentialKind: "session",
    }),
  };
}

function mockService(overrides: Partial<StravaConnectionService> = {}): StravaConnectionService {
  return {
    async start(_scope: AthleteScope) {
      return {
        authorizationUrl: "https://www.strava.com/oauth/authorize?state=opaque",
        expiresAt: "2026-08-10T12:10:00.000Z",
      };
    },
    async complete() { return { connection: status, returnTo: "/dashboard/settings" }; },
    async status() { return status; },
    async refresh() { return status; },
    async disconnect() { return { connection: { ...status, status: "disconnected", displayStatus: "disconnected" }, providerRevocationConfirmed: true }; },
    async deauthorize() { return { ...status, status: "revoked", displayStatus: "action_required" }; },
    ...overrides,
  };
}

test("Strava configuration validates the fixed callback and 32-byte encryption key", () => {
  const configuration = readStravaConnectionConfiguration({
    STRAVA_CLIENT_ID: "12345",
    STRAVA_CLIENT_SECRET: "synthetic-client-secret",
    STRAVA_REDIRECT_URI: redirectUri,
    RACEPREDICTOR_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    RACEPREDICTOR_TOKEN_ENCRYPTION_KEY_VERSION: "v2",
  });
  assert.equal(configuration.redirectUri, redirectUri);
  assert.equal(configuration.tokenEncryptionKeyVersion, "v2");

  const privateValue = "private-secret-value";
  assert.throws(
    () => readStravaConnectionConfiguration({
      STRAVA_CLIENT_ID: "12345",
      STRAVA_CLIENT_SECRET: privateValue,
      STRAVA_REDIRECT_URI: "https://attacker.example/callback",
      RACEPREDICTOR_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    }),
    (error: unknown) => {
      assert(error instanceof StravaConfigurationError);
      assert.doesNotMatch(error.message, new RegExp(privateValue, "u"));
      return true;
    },
  );
});

test("authorization URL asks only for complete activity read access", async () => {
  const client = createStravaOAuthClient({
    clientId: "12345",
    clientSecret: "synthetic-client-secret",
  }, { now: () => new Date("2026-08-10T12:00:00.000Z") });
  const result = await client.createAuthorization({ state: "s".repeat(43), redirectUri });
  const url = new URL(result.authorizationUrl);
  assert.equal(url.origin + url.pathname, stravaOAuthEndpoints.authorize);
  assert.equal(url.searchParams.get("scope"), "activity:read_all");
  assert.equal(url.searchParams.get("approval_prompt"), "auto");
  assert.equal(url.searchParams.get("state"), "s".repeat(43));
  assert.equal(result.expiresAt, "2026-08-10T12:10:00.000Z");
});

test("token exchange and refresh use form posts and keep provider secrets out of results", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const responses = [
    Response.json({
      access_token: "initial-access",
      refresh_token: "initial-refresh",
      expires_at: 1786384800,
      scope: "activity:read_all",
      athlete: { id: 123 },
    }),
    Response.json({
      access_token: "rotated-access",
      refresh_token: "rotated-refresh",
      expires_at: 1786406400,
    }),
  ];
  const client = createStravaOAuthClient({
    clientId: "12345",
    clientSecret: "synthetic-client-secret",
  }, {
    fetch: (async (input, init) => {
      calls.push({ input: String(input), init });
      return responses.shift()!;
    }) as typeof fetch,
  });

  const initial = await client.exchangeAuthorizationCode({ code: "single-use-code", redirectUri });
  const refreshed = await client.refreshAuthorization(initial.refreshToken);
  assert.equal(initial.providerAthleteId, "123");
  assert.deepEqual(initial.scopes, ["activity:read_all"]);
  assert.equal(refreshed.refreshToken, "rotated-refresh");
  assert.equal(calls[0].input, stravaOAuthEndpoints.token);
  assert.equal(calls[1].input, stravaOAuthEndpoints.token);
  assert.match(String(calls[0].init?.body), /grant_type=authorization_code/u);
  assert.match(String(calls[1].init?.body), /grant_type=refresh_token/u);
  assert.doesNotMatch(JSON.stringify(initial), /synthetic-client-secret/u);
});

test("disconnect uses Strava's current revoke endpoint with Basic authentication", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const client = createStravaOAuthClient({
    clientId: "12345",
    clientSecret: "synthetic-client-secret",
  }, {
    fetch: (async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });
  await client.revokeAuthorization({ token: "synthetic-refresh", tokenTypeHint: "refresh_token" });
  assert.equal(calls[0].input, "https://www.strava.com/oauth/revoke");
  assert.notEqual(calls[0].input, "https://www.strava.com/oauth/deauthorize");
  assert.match(String((calls[0].init?.headers as Record<string, string>).authorization), /^Basic /u);
  assert.equal(new URLSearchParams(String(calls[0].init?.body)).get("token_type_hint"), "refresh_token");
});

test("provider failures expose only stable safe errors", async () => {
  const privateBody = "private-response-body-with-token";
  const client = createStravaOAuthClient({
    clientId: "12345",
    clientSecret: "synthetic-client-secret",
  }, {
    fetch: (async () => new Response(privateBody, { status: 503 })) as typeof fetch,
  });
  await assert.rejects(
    client.refreshAuthorization("private-refresh-token"),
    (error: unknown) => {
      assert(error instanceof StravaProviderRequestError);
      assert.equal(error.retryable, true);
      assert.doesNotMatch(error.message, /private-response|private-refresh|synthetic-client-secret/u);
      return true;
    },
  );
});

test("actor-scoped provider routes use only the authenticated athlete and return no credentials", async () => {
  let receivedAthlete: string | null = null;
  const service = mockService({
    async start(scope) {
      receivedAthlete = scope.athleteId;
      return {
        authorizationUrl: "https://www.strava.com/oauth/authorize?state=opaque",
        expiresAt: "2026-08-10T12:10:00.000Z",
      };
    },
  });
  const response = await handleStravaConnect(
    authenticated(),
    new Request("https://race.example/api/v1/providers/strava/connect", {
      method: "POST",
      body: JSON.stringify({ athleteId: "athlete-a", returnTo: "/dashboard/settings" }),
    }),
    () => ({ redirectUri, service }),
  );
  assert.equal(response.status, 201);
  assert.equal(receivedAthlete, "athlete-a");
  assert.doesNotMatch(JSON.stringify(await response.json()), /accessToken|refreshToken|client-secret/u);

  const statusResponse = await handleStravaStatus(
    authenticated(),
    new Request("https://race.example/api/v1/providers/strava/status"),
    () => ({ redirectUri, service }),
  );
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).data.connection.athleteId, "athlete-a");
});

test("callback redirects only to the stored same-origin target and disconnect is truthful", async () => {
  const service = mockService();
  let initialBackfillAthlete: string | null = null;
  const callback = await handleStravaCallback(
    authenticated(),
    new Request(`https://race.example/api/v1/providers/strava/callback?state=${"s".repeat(43)}&code=code&scope=activity%3Aread_all`),
    () => ({
      redirectUri,
      service,
      async enqueueInitialBackfill(scope) {
        initialBackfillAthlete = scope.athleteId;
        return { jobId: "initial-job", reused: false };
      },
    }),
  );
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get("location"), "https://race.example/dashboard/settings?provider=strava&connection=connected");
  assert.equal(initialBackfillAthlete, "athlete-a");

  const disconnected = await handleStravaDisconnect(
    authenticated(),
    new Request("https://race.example/api/v1/providers/strava/disconnect", { method: "POST" }),
    () => ({ redirectUri, service }),
  );
  const body = await disconnected.json();
  assert.equal(body.data.connection.status, "disconnected");
  assert.equal(body.data.providerRevocationConfirmed, true);
});

test("owner can queue only a bounded athlete-scoped backfill", async () => {
  const service = mockService();
  let receivedAthlete: string | null = null;
  let receivedAfter: string | null = null;
  const request = {
    after: "2026-07-01T00:00:00.000Z",
    before: "2026-08-01T00:00:00.000Z",
    pageSize: 30,
    maxPages: 5,
    maxActivities: 150,
  };
  const response = await handleStravaBackfill(
    authenticated(),
    new Request("https://race.example/api/v1/providers/strava/backfill", {
      method: "POST",
      body: JSON.stringify(request),
    }),
    () => ({
      redirectUri,
      service,
      async enqueueBackfill(scope, input) {
        receivedAthlete = scope.athleteId;
        receivedAfter = input.after;
        return { jobId: "backfill-job", reused: false };
      },
    }),
  );
  assert.equal(response.status, 202);
  assert.equal(receivedAthlete, "athlete-a");
  assert.equal(receivedAfter, request.after);
  assert.deepEqual((await response.json()).data, {
    jobId: "backfill-job",
    reused: false,
    status: "queued",
    bounds: request,
  });

  await assert.rejects(
    handleStravaBackfill(
      authenticated(),
      new Request("https://race.example/api/v1/providers/strava/backfill", {
        method: "POST",
        body: JSON.stringify({ ...request, before: "2027-08-01T00:00:00.000Z" }),
      }),
      () => ({ redirectUri, service }),
    ),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 400);
      assert.equal((error as { code?: string }).code, "VALIDATION_ERROR");
      return true;
    },
  );
});

test("cloud-disabled local mode never initializes Strava provider configuration", { concurrency: false }, async () => {
  const prior = process.env.RACEPREDICTOR_CLOUD_MODE;
  try {
    process.env.RACEPREDICTOR_CLOUD_MODE = "disabled";
    const response = await defaultConnect(new Request("http://localhost/api/v1/providers/strava/connect", {
      method: "POST",
      body: JSON.stringify({ athleteId: "athlete-a" }),
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "CONFIGURATION_ERROR");
  } finally {
    if (prior === undefined) delete process.env.RACEPREDICTOR_CLOUD_MODE;
    else process.env.RACEPREDICTOR_CLOUD_MODE = prior;
  }
});
