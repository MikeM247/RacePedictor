import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  athleteScopeFor,
  buildActorContext,
} from "../src/contracts/auth.ts";
import type {
  ProviderAdapter,
  ProviderTokenGrant,
  ProviderTokenRefreshGrant,
} from "../src/ports/cloud-sync.ts";
import {
  createStravaConnectionService,
  StravaConnectionError,
} from "../src/use-cases/strava-connection.ts";
import { CredentialEnvelopeCrypto } from "../../db/src/cloud/credential-envelope.js";
import { InMemoryProviderConnectionRepository } from "../../db/src/cloud/in-memory-provider-connection-repository.js";
import { InMemoryProviderOAuthAttemptRepository } from "../../db/src/cloud/in-memory-provider-oauth-attempt-repository.js";

const startTime = new Date("2026-08-10T12:00:00.000Z");

function scope(userId: string, athleteId: string) {
  return athleteScopeFor(buildActorContext({
    userId,
    permittedAthleteIds: [athleteId],
    activeAthleteId: athleteId,
    requestId: `request-${userId}`,
    credentialKind: "session",
  }));
}

class FakeStravaAdapter implements ProviderAdapter {
  readonly provider = "strava" as const;
  authorizationStates: string[] = [];
  exchangeCalls: string[] = [];
  refreshCalls: string[] = [];
  revokeCalls: string[] = [];
  exchangeGrant: ProviderTokenGrant = {
    providerAthleteId: "strava-athlete-a",
    accessToken: "synthetic-access",
    refreshToken: "synthetic-refresh",
    expiresAt: "2026-08-10T18:00:00.000Z",
    scopes: ["activity:read_all"],
  };
  refreshGrant: ProviderTokenRefreshGrant = {
    accessToken: "rotated-access",
    refreshToken: "rotated-refresh",
    expiresAt: "2026-08-11T00:00:00.000Z",
  };
  refreshFailure = false;
  revokeFailure = false;

  async createAuthorization(input: { state: string; redirectUri: string }) {
    this.authorizationStates.push(input.state);
    const url = new URL("https://www.strava.com/oauth/authorize");
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return { authorizationUrl: url.toString(), expiresAt: "2026-08-10T12:10:00.000Z" };
  }

  async exchangeAuthorizationCode(input: { code: string }) {
    this.exchangeCalls.push(input.code);
    return this.exchangeGrant;
  }

  async refreshAuthorization(refreshToken: string) {
    this.refreshCalls.push(refreshToken);
    if (this.refreshFailure) throw new Error("synthetic provider failure containing private details");
    return this.refreshGrant;
  }

  async revokeAuthorization(input: { token: string }) {
    this.revokeCalls.push(input.token);
    if (this.revokeFailure) throw new Error("synthetic revoke failure containing private details");
  }

  async verifyWebhook(): Promise<never> { throw new Error("outside connection test scope"); }
  async fetchActivity(): Promise<never> { throw new Error("outside connection test scope"); }
  async listRecentActivities(): Promise<never> { throw new Error("outside connection test scope"); }
}

function harness() {
  const provider = new FakeStravaAdapter();
  const credentialCrypto = new CredentialEnvelopeCrypto({
    activeKeyVersion: "test-v1",
    keys: { "test-v1": randomBytes(32) },
  });
  const connections = new InMemoryProviderConnectionRepository({ credentialCrypto });
  const attempts = new InMemoryProviderOAuthAttemptRepository();
  let now = new Date(startTime);
  let stateCounter = 0;
  const service = createStravaConnectionService({
    provider,
    connections,
    attempts,
    now: () => new Date(now),
    createOpaqueState: () => `state-${String(++stateCounter).padStart(40, "0")}`,
    hashState: (value) => createHash("sha256").update(value).digest("hex"),
  });
  return {
    provider,
    connections,
    service,
    setNow(value: string) { now = new Date(value); },
  };
}

async function start(h: ReturnType<typeof harness>, athleteScope = scope("owner-a", "athlete-a")) {
  const result = await h.service.start(athleteScope, {
    athleteId: athleteScope.athleteId,
    returnTo: "/dashboard/settings",
  }, "https://race.example/api/v1/providers/strava/callback");
  return { result, state: h.provider.authorizationStates.at(-1)! };
}

test("successful callback stores the grant without returning credentials", async () => {
  const h = harness();
  const athleteScope = scope("owner-a", "athlete-a");
  const { state } = await start(h, athleteScope);
  const completed = await h.service.complete(athleteScope, {
    state,
    code: "single-use-code",
    scope: "activity:read_all",
  }, "https://race.example/api/v1/providers/strava/callback");

  assert.equal(completed.connection.status, "connected");
  assert.equal(completed.returnTo, "/dashboard/settings");
  assert.equal(h.provider.exchangeCalls.length, 1);
  assert.doesNotMatch(JSON.stringify(completed), /synthetic-(?:access|refresh)/u);
  assert.equal((await h.connections.getCredentials(athleteScope, "strava")).refreshToken, "synthetic-refresh");
});

test("denied consent consumes state and replay is rejected without token exchange", async () => {
  const h = harness();
  const athleteScope = scope("owner-a", "athlete-a");
  const { state } = await start(h, athleteScope);
  await assert.rejects(
    h.service.complete(athleteScope, { state, error: "access_denied" }, "https://race.example/api/v1/providers/strava/callback"),
    (error: unknown) => error instanceof StravaConnectionError && error.code === "OAUTH_ACCESS_DENIED",
  );
  await assert.rejects(
    h.service.complete(athleteScope, { state, code: "code", scope: "activity:read_all" }, "https://race.example/api/v1/providers/strava/callback"),
    (error: unknown) => error instanceof StravaConnectionError && error.code === "OAUTH_STATE_REPLAYED",
  );
  assert.equal(h.provider.exchangeCalls.length, 0);
  assert.equal((await h.service.status(athleteScope)).displayStatus, "action_required");
});

test("insufficient accepted scope fails before exchanging a code", async () => {
  const h = harness();
  const athleteScope = scope("owner-a", "athlete-a");
  const { state } = await start(h, athleteScope);
  await assert.rejects(
    h.service.complete(athleteScope, { state, code: "code", scope: "activity:read" }, "https://race.example/api/v1/providers/strava/callback"),
    (error: unknown) => error instanceof StravaConnectionError && error.code === "OAUTH_SCOPE_INSUFFICIENT",
  );
  assert.equal(h.provider.exchangeCalls.length, 0);
});

test("an insufficient token grant is revoked and never persisted", async () => {
  const h = harness();
  const athleteScope = scope("owner-a", "athlete-a");
  h.provider.exchangeGrant = { ...h.provider.exchangeGrant, scopes: ["activity:read"] };
  const { state } = await start(h, athleteScope);
  await assert.rejects(
    h.service.complete(athleteScope, { state, code: "code", scope: "activity:read_all" }, "https://race.example/api/v1/providers/strava/callback"),
    (error: unknown) => error instanceof StravaConnectionError && error.code === "OAUTH_SCOPE_INSUFFICIENT",
  );
  assert.deepEqual(h.provider.revokeCalls, ["synthetic-refresh"]);
  assert.equal(await h.connections.getCredentials(athleteScope, "strava"), null);
});

test("OAuth state cannot be used by a second athlete", async () => {
  const h = harness();
  const scopeA = scope("owner-a", "athlete-a");
  const scopeB = scope("owner-b", "athlete-b");
  const { state } = await start(h, scopeA);
  await assert.rejects(
    h.service.complete(scopeB, { state, code: "code", scope: "activity:read_all" }, "https://race.example/api/v1/providers/strava/callback"),
    (error: unknown) => error instanceof StravaConnectionError && error.code === "OAUTH_STATE_INVALID",
  );
  assert.equal(h.provider.exchangeCalls.length, 0);
});

test("authorization rejects cross-origin and backslash redirect targets", async () => {
  const h = harness();
  const athleteScope = scope("owner-a", "athlete-a");
  await assert.rejects(h.service.start(athleteScope, {
    athleteId: "athlete-a",
    returnTo: "/\\attacker.example",
  }, "https://race.example/api/v1/providers/strava/callback"));
  assert.equal(h.provider.authorizationStates.length, 0);
});

test("refresh persists the newest refresh token and failure becomes a safe attention state", async () => {
  const h = harness();
  const athleteScope = scope("owner-a", "athlete-a");
  const { state } = await start(h, athleteScope);
  await h.service.complete(athleteScope, {
    state,
    code: "code",
    scope: "activity:read_all",
  }, "https://race.example/api/v1/providers/strava/callback");

  h.setNow("2026-08-10T17:00:00.000Z");
  const refreshed = await h.service.refresh(athleteScope);
  assert.equal(refreshed.lastSuccessfulProviderContactAt, "2026-08-10T17:00:00.000Z");
  assert.equal((await h.connections.getCredentials(athleteScope, "strava")).refreshToken, "rotated-refresh");
  assert.deepEqual(h.provider.refreshCalls, ["synthetic-refresh"]);

  h.provider.refreshFailure = true;
  await assert.rejects(
    h.service.refresh(athleteScope),
    (error: unknown) => {
      assert(error instanceof StravaConnectionError);
      assert.equal(error.code, "PROVIDER_REFRESH_FAILED");
      assert.doesNotMatch(error.message, /rotated-refresh|private details/u);
      return true;
    },
  );
  assert.equal((await h.service.status(athleteScope)).displayStatus, "error");
});

test("disconnect uses the refresh token, clears local credentials, and reports remote failure truthfully", async () => {
  const h = harness();
  const athleteScope = scope("owner-a", "athlete-a");
  let authorization = await start(h, athleteScope);
  await h.service.complete(athleteScope, {
    state: authorization.state,
    code: "code",
    scope: "activity:read_all",
  }, "https://race.example/api/v1/providers/strava/callback");
  const disconnected = await h.service.disconnect(athleteScope);
  assert.equal(disconnected.providerRevocationConfirmed, true);
  assert.deepEqual(h.provider.revokeCalls, ["synthetic-refresh"]);
  assert.equal(await h.connections.getCredentials(athleteScope, "strava"), null);

  authorization = await start(h, athleteScope);
  await h.service.complete(athleteScope, {
    state: authorization.state,
    code: "code-2",
    scope: "activity:read_all",
  }, "https://race.example/api/v1/providers/strava/callback");
  h.provider.revokeFailure = true;
  const failedRemote = await h.service.disconnect(athleteScope);
  assert.equal(failedRemote.providerRevocationConfirmed, false);
  assert.equal(failedRemote.connection.status, "disconnected");
  assert.equal(failedRemote.connection.displayStatus, "error");
  assert.equal(await h.connections.getCredentials(athleteScope, "strava"), null);
});

test("provider deauthorization clears credentials and exposes an actionable revoked state", async () => {
  const h = harness();
  const athleteScope = scope("owner-a", "athlete-a");
  const { state } = await start(h, athleteScope);
  await h.service.complete(athleteScope, {
    state,
    code: "code",
    scope: "activity:read_all",
  }, "https://race.example/api/v1/providers/strava/callback");
  const revoked = await h.service.deauthorize(athleteScope);
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.lastErrorCode, "PROVIDER_DEAUTHORIZED");
  assert.equal(await h.connections.getCredentials(athleteScope, "strava"), null);
});
