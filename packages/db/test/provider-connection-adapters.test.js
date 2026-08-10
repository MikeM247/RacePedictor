import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import {
  CredentialEnvelopeCrypto,
  InMemoryProviderConnectionRepository,
  InMemoryProviderOAuthAttemptRepository,
} from "../src/cloud/index.js";

const occurredAt = "2026-08-10T12:00:00.000Z";
const expiresAt = "2026-08-10T18:00:00.000Z";

function actor(userId, athleteId) {
  return buildActorContext({
    userId,
    permittedAthleteIds: [athleteId],
    activeAthleteId: athleteId,
    requestId: `request-${userId}`,
    credentialKind: "session",
  });
}

function repositories() {
  const credentialCrypto = new CredentialEnvelopeCrypto({
    activeKeyVersion: "test-v1",
    keys: { "test-v1": randomBytes(32) },
  });
  return {
    connections: new InMemoryProviderConnectionRepository({ credentialCrypto }),
    attempts: new InMemoryProviderOAuthAttemptRepository(),
  };
}

test("provider credentials rotate atomically and status projections never expose secrets", async () => {
  const { connections } = repositories();
  const scope = athleteScopeFor(actor("owner-a", "athlete-a"));

  await connections.beginConnecting(scope, "strava", occurredAt);
  const connected = await connections.saveCredentials(scope, "strava", {
    providerAthleteId: "strava-athlete-a",
    accessToken: "synthetic-access-a",
    refreshToken: "synthetic-refresh-a",
    expiresAt,
    scopes: ["activity:read_all"],
    contactedAt: occurredAt,
  });
  assert.equal(connected.status, "connected");
  assert.equal(connected.displayStatus, "connected");
  assert.doesNotMatch(JSON.stringify(connected), /synthetic-(?:access|refresh)/u);

  await connections.rotateCredentials(scope, "strava", {
    accessToken: "rotated-access-a",
    refreshToken: "rotated-refresh-a",
    expiresAt: "2026-08-11T00:00:00.000Z",
    contactedAt: "2026-08-10T17:00:00.000Z",
  });
  const credentials = await connections.getCredentials(scope, "strava");
  assert.equal(credentials.accessToken, "rotated-access-a");
  assert.equal(credentials.refreshToken, "rotated-refresh-a");
  assert.equal(credentials.providerAthleteId, "strava-athlete-a");
});

test("provider identities and credential reads are athlete scoped", async () => {
  const { connections } = repositories();
  const scopeA = athleteScopeFor(actor("owner-a", "athlete-a"));
  const scopeB = athleteScopeFor(actor("owner-b", "athlete-b"));
  await connections.saveCredentials(scopeA, "strava", {
    providerAthleteId: "strava-shared",
    accessToken: "access-a",
    refreshToken: "refresh-a",
    expiresAt,
    scopes: ["activity:read_all"],
    contactedAt: occurredAt,
  });

  assert.equal(await connections.get(scopeB, "strava"), null);
  assert.equal(await connections.getCredentials(scopeB, "strava"), null);
  await assert.rejects(
    connections.get({ actor: scopeB.actor, athleteId: "athlete-a" }, "strava"),
    /not authorized/u,
  );
  await assert.rejects(
    connections.saveCredentials(scopeB, "strava", {
      providerAthleteId: "strava-shared",
      accessToken: "access-b",
      refreshToken: "refresh-b",
      expiresAt,
      scopes: ["activity:read_all"],
      contactedAt: occurredAt,
    }),
    /conflicts/u,
  );
});

test("disconnect and provider deauthorization clear credentials but retain truthful status", async () => {
  const { connections } = repositories();
  const scope = athleteScopeFor(actor("owner-a", "athlete-a"));
  await connections.saveCredentials(scope, "strava", {
    providerAthleteId: "strava-athlete-a",
    accessToken: "access-a",
    refreshToken: "refresh-a",
    expiresAt,
    scopes: ["activity:read_all"],
    contactedAt: occurredAt,
  });

  const disconnected = await connections.disconnect(scope, "strava", {
    occurredAt: "2026-08-10T12:05:00.000Z",
    diagnosticCode: "REMOTE_REVOCATION_FAILED",
  });
  assert.equal(disconnected.status, "disconnected");
  assert.equal(disconnected.displayStatus, "error");
  assert.equal(await connections.getCredentials(scope, "strava"), null);

  const revoked = await connections.revoke(scope, "strava", "2026-08-10T12:10:00.000Z");
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.displayStatus, "action_required");
  assert.equal(revoked.lastErrorCode, "PROVIDER_DEAUTHORIZED");
});

test("OAuth state is actor-bound, expires, and can be consumed only once", async () => {
  const { attempts } = repositories();
  const scopeA = athleteScopeFor(actor("owner-a", "athlete-a"));
  const scopeB = athleteScopeFor(actor("owner-b", "athlete-b"));
  await attempts.create(scopeA, {
    provider: "strava",
    stateHash: "a".repeat(64),
    redirectUri: "https://race.example/api/v1/providers/strava/callback",
    returnTo: "/dashboard/settings",
    expiresAt: "2026-08-10T12:10:00.000Z",
  });

  assert.equal((await attempts.consume(scopeB, {
    provider: "strava",
    stateHash: "a".repeat(64),
    now: "2026-08-10T12:01:00.000Z",
  })).outcome, "invalid");
  assert.equal((await attempts.consume(scopeA, {
    provider: "strava",
    stateHash: "a".repeat(64),
    now: "2026-08-10T12:01:00.000Z",
  })).outcome, "consumed");
  assert.equal((await attempts.consume(scopeA, {
    provider: "strava",
    stateHash: "a".repeat(64),
    now: "2026-08-10T12:02:00.000Z",
  })).outcome, "replayed");

  await attempts.create(scopeA, {
    provider: "strava",
    stateHash: "b".repeat(64),
    redirectUri: "https://race.example/api/v1/providers/strava/callback",
    returnTo: "/dashboard/settings",
    expiresAt: "2026-08-10T12:00:30.000Z",
  });
  assert.equal((await attempts.consume(scopeA, {
    provider: "strava",
    stateHash: "b".repeat(64),
    now: "2026-08-10T12:01:00.000Z",
  })).outcome, "expired");
});
