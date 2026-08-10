import assert from "node:assert/strict";
import test from "node:test";
import { createServerAuth } from "../lib/server/auth.ts";
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

  const session = projectOwnerSession({ user: { name: "Owner" } }, { authSubject: "github:59341274" }, configuredEnvironment);
  assert.equal((session.user as { id?: string }).id, "github:59341274");
  const rejectedSession = projectOwnerSession({ user: {} }, { authSubject: "github:999" }, configuredEnvironment);
  assert.equal((rejectedSession.user as { id?: string }).id, "");
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
    readSession: async () => ({ user: { id: "github:59341274" } }),
    readConfiguration: () => ({ authSubject: "github:59341274" }),
    requestId: () => "request_owner_auth",
  });

  const actor = await resolver(new Request("https://racepredicitor.example/dashboard"));
  assert.deepEqual(actor, {
    userId: "user_owner",
    permittedAthleteIds: ["athlete_001", "athlete_002"],
    activeAthleteId: "athlete_001",
    requestId: "request_owner_auth",
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
