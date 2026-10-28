import assert from "node:assert/strict";
import test from "node:test";
import { createServerAuth } from "../lib/server/auth.ts";
import { getServerAuth } from "../lib/server/composition.ts";
import { readCloudEnvironment } from "../lib/server/cloud-environment.ts";
import { createOwnerActorResolver } from "../lib/server/github-owner-auth.ts";
import {
  githubSubjectFromAccount,
  isConfiguredOwnerAccount,
  projectOwnerSession,
  readOwnerAuthConfiguration,
  updateOwnerAuthToken,
} from "../lib/server/github-owner-configuration.ts";

const configuredEnvironment = {
  AUTH_SECRET: "test-auth-secret",
  AUTH_GITHUB_ID: "test-client-id",
  AUTH_GITHUB_SECRET: "test-client-secret",
  RACEPREDICTOR_OWNER_AUTH_SUBJECT: "github:59341274",
};

test("GitHub owner configuration requires every server secret and one stable numeric subject", () => {
  assert.deepEqual(readOwnerAuthConfiguration(configuredEnvironment), { authSubject: "github:59341274" });
  assert.equal(readOwnerAuthConfiguration({ ...configuredEnvironment, AUTH_SECRET: "" }), null);
  assert.equal(readOwnerAuthConfiguration({ ...configuredEnvironment, RACEPREDICTOR_OWNER_AUTH_SUBJECT: "github:attacker" }), null);
});

test("only the configured GitHub account survives sign-in, token, and session projection", () => {
  const ownerAccount = { provider: "github", providerAccountId: "59341274" };
  const otherAccount = { provider: "github", providerAccountId: "999" };
  assert.equal(githubSubjectFromAccount(ownerAccount), "github:59341274");
  assert.equal(githubSubjectFromAccount({ provider: "google", providerAccountId: "59341274" }), null);
  assert.equal(isConfiguredOwnerAccount(ownerAccount, configuredEnvironment), true);
  assert.equal(isConfiguredOwnerAccount(otherAccount, configuredEnvironment), false);

  const ownerToken = updateOwnerAuthToken({}, ownerAccount, configuredEnvironment);
  assert.deepEqual(ownerToken, { authSubject: "github:59341274" });
  assert.deepEqual(updateOwnerAuthToken(ownerToken, null, {
    ...configuredEnvironment,
    RACEPREDICTOR_OWNER_AUTH_SUBJECT: "github:999",
  }), {});

  const loginId = "457a2115-166f-4b2c-a0a4-21a8faffd4d3";
  const loginToken = { ...ownerToken, runReviewLoginId: loginId };
  assert.equal(updateOwnerAuthToken(loginToken, null, configuredEnvironment).runReviewLoginId, loginId);
  const session = projectOwnerSession({ user: { name: "Owner" } }, { ...loginToken, authSubject: "github:59341274" }, configuredEnvironment);
  assert.equal((session.user as { id?: string }).id, "github:59341274");
  assert.equal((session as { runReviewLoginId?: string }).runReviewLoginId, loginId);
  const rejectedSession = projectOwnerSession({ user: {} }, { authSubject: "github:999" }, configuredEnvironment);
  assert.equal((rejectedSession.user as { id?: string }).id, "");
  assert.equal((rejectedSession as { runReviewLoginId?: string }).runReviewLoginId, undefined);
});

test("owner sessions resolve through persisted athlete access and carry every permitted scope", async () => {
  let lookupCount = 0;
  const resolver = createOwnerActorResolver({
    identities: {
      async findByAuthSubject(authSubject) {
        lookupCount += 1;
        assert.equal(authSubject, "github:59341274");
        return { userId: "user_owner", permittedAthleteIds: ["athlete_001", "athlete_002"] };
      },
    },
    readSession: async () => ({ user: { id: "github:59341274" }, runReviewLoginId: "457a2115-166f-4b2c-a0a4-21a8faffd4d3" }),
    readConfiguration: () => ({ authSubject: "github:59341274" }),
    requestId: () => "request_owner_auth",
  });

  const actor = await resolver(new Request("https://racepredicitor.example/dashboard"));
  assert.deepEqual(actor, {
    userId: "user_owner",
    permittedAthleteIds: ["athlete_001", "athlete_002"],
    activeAthleteId: "athlete_001",
    requestId: "request_owner_auth",
    runReviewLoginId: "457a2115-166f-4b2c-a0a4-21a8faffd4d3",
    credentialKind: "session",
  });
  assert.equal(lookupCount, 1);
});

test("wrong or unprovisioned sessions fail closed without revealing athlete existence", async () => {
  let lookupCount = 0;
  const wrongSessionResolver = createOwnerActorResolver({
    identities: { findByAuthSubject: async () => { lookupCount += 1; return null; } },
    readSession: async () => ({ user: { id: "github:999" } }),
    readConfiguration: () => ({ authSubject: "github:59341274" }),
  });
  assert.equal(await wrongSessionResolver(new Request("https://racepredictor.example/dashboard")), null);
  assert.equal(lookupCount, 0);

  const missingAccessResolver = createOwnerActorResolver({
    identities: { findByAuthSubject: async () => null },
    readSession: async () => ({ user: { id: "github:59341274" } }),
    readConfiguration: () => ({ authSubject: "github:59341274" }),
  });
  assert.equal(await missingAccessResolver(new Request("https://racepredictor.example/dashboard")), null);
});

test("online-fixture browser auth is explicit and cannot synthesize a production actor", async () => {
  const names = ["NODE_ENV", "RACEPREDICTOR_CLOUD_MODE", "RACEPREDICTOR_DATA_SOURCE", "RACEPREDICTOR_E2E_OWNER_AUTH_ENABLED", "RACEPREDICTOR_OWNER_AUTH_CONFIGURED", "RACEPREDICTOR_OWNER_AUTH_SUBJECT"] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    Reflect.set(process.env, "NODE_ENV", "test");
    delete process.env.RACEPREDICTOR_OWNER_AUTH_CONFIGURED;
    delete process.env.RACEPREDICTOR_OWNER_AUTH_SUBJECT;
    process.env.RACEPREDICTOR_CLOUD_MODE = "enabled";
    process.env.RACEPREDICTOR_DATA_SOURCE = "online-fixture";
    process.env.RACEPREDICTOR_E2E_OWNER_AUTH_ENABLED = "true";
    const testSession = await getServerAuth().getSessionStatus(new Request("http://localhost/api/v1/auth/session"));
    assert.equal(testSession.authenticated, true);
    assert.equal(testSession.actor?.credentialKind, "session");
    assert.equal(testSession.actor?.activeAthleteId, "racepredictor-e2e-athlete");

    Reflect.set(process.env, "NODE_ENV", "production");
    const productionSession = await getServerAuth().getSessionStatus(new Request("http://localhost/api/v1/auth/session"));
    assert.deepEqual(productionSession, { authenticated: false, actor: null, reason: "authentication_not_configured" });
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else Reflect.set(process.env, name, value);
    }
  }
});

test("production accepts only the real resolver while still rejecting a synthetic actor", async () => {
  const productionActor = {
    userId: "user_owner",
    permittedAthleteIds: ["athlete_001"],
    activeAthleteId: "athlete_001",
    requestId: "request_owner_auth",
    credentialKind: "session" as const,
  };
  const auth = createServerAuth({
    environment: readCloudEnvironment({ NODE_ENV: "production", RACEPREDICTOR_OWNER_AUTH_CONFIGURED: "true" }),
    productionActorResolver: async () => productionActor,
    syntheticActorResolver: async () => ({ ...productionActor, userId: "synthetic" }),
  });
  assert.deepEqual(await auth.requireActor(new Request("https://racepredictor.example/dashboard")), productionActor);
});
