import assert from "node:assert/strict";
import test from "node:test";
import { GET as health } from "../app/api/v1/health/route.ts";
import { GET as session } from "../app/api/v1/auth/session/route.ts";
import { ApiHttpError, failure } from "../lib/server/api-response.ts";
import {
  CloudEnvironmentError,
  publicCloudEnvironmentStatus,
  readCloudEnvironment,
} from "../lib/server/cloud-environment.ts";
import { createServerAuth, createSyntheticTestActor } from "../lib/server/auth.ts";

const cloudEnvironmentKeys = [
  "NODE_ENV",
  "RACEPREDICTOR_CLOUD_MODE",
  "RACEPREDICTOR_STRAVA_INGESTION_ENABLED",
  "RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED",
  "RACEPREDICTOR_OWNER_AUTH_CONFIGURED",
  "VERCEL_GIT_COMMIT_SHA",
  "RACEPREDICTOR_RELEASE",
  "DATABASE_URL",
  "RACEPREDICTOR_AUTH_CLIENT_SECRET",
] as const;

async function withEnvironment(overrides: Record<string, string | undefined>, action: () => Promise<void> | void) {
  const previous = new Map(cloudEnvironmentKeys.map((key) => [key, process.env[key]]));
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  try {
    for (const key of cloudEnvironmentKeys) {
      const value = overrides[key];
      if (value === undefined) delete mutableEnvironment[key];
      else mutableEnvironment[key] = value;
    }
    await action();
  } finally {
    for (const key of cloudEnvironmentKeys) {
      const value = previous.get(key);
      if (value === undefined) delete mutableEnvironment[key];
      else mutableEnvironment[key] = value;
    }
  }
}

test("health is non-sensitive and redacts configuration secrets", { concurrency: false }, async () => {
  await withEnvironment({
    NODE_ENV: "test",
    RACEPREDICTOR_CLOUD_MODE: "enabled",
    RACEPREDICTOR_STRAVA_INGESTION_ENABLED: "true",
    RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED: "false",
    RACEPREDICTOR_OWNER_AUTH_CONFIGURED: "false",
    VERCEL_GIT_COMMIT_SHA: "release-123",
    DATABASE_URL: "postgres://private:private@private.example/private",
    RACEPREDICTOR_AUTH_CLIENT_SECRET: "never-return-this",
  }, async () => {
    const response = await health();
    assert.equal(response.status, 200);
    const envelope = await response.json();
    assert.deepEqual(envelope, {
      data: {
        status: "ok",
        runtime: "test",
        cloudMode: "enabled",
        features: { stravaIngestion: true, secondBrainSync: false },
        ownerAuthConfigured: false,
        release: "release-123",
      },
    });
    const serialized = JSON.stringify(envelope);
    assert.equal(serialized.includes("postgres://"), false);
    assert.equal(serialized.includes("never-return-this"), false);
  });
});

test("session endpoint reports a safe unauthenticated state while owner auth is pending", { concurrency: false }, async () => {
  await withEnvironment({ NODE_ENV: "production", RACEPREDICTOR_OWNER_AUTH_CONFIGURED: "false" }, async () => {
    const response = await session(new Request("http://localhost/api/v1/auth/session"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: { authenticated: false, actor: null, reason: "authentication_not_configured" },
    });
  });
});

test("health reports invalid feature configuration without echoing its value", { concurrency: false }, async () => {
  await withEnvironment({ NODE_ENV: "production", RACEPREDICTOR_CLOUD_MODE: "not-a-mode" }, async () => {
    const response = await health();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: "CONFIGURATION_ERROR", message: "Server configuration is invalid", details: [] },
    });
  });
});

test("authentication and authorization use standard unauthenticated and forbidden envelopes", async () => {
  const unauthenticated = failure(new ApiHttpError(401, "UNAUTHENTICATED", "Authentication is required"));
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), {
    error: { code: "UNAUTHENTICATED", message: "Authentication is required", details: [] },
  });

  const forbidden = failure(new ApiHttpError(403, "FORBIDDEN", "You do not have access to this athlete"));
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), {
    error: { code: "FORBIDDEN", message: "You do not have access to this athlete", details: [] },
  });
});

test("an explicit synthetic actor remains constrained to its permitted athlete", async () => {
  const actor = createSyntheticTestActor("test-owner", ["athlete-a"]);
  const auth = createServerAuth({
    environment: readCloudEnvironment({ NODE_ENV: "test" }),
    syntheticActorResolver: () => actor,
  });
  const request = new Request("http://localhost/api/v1/testing");

  assert.equal((await auth.requireActor(request)).userId, "test-owner");
  auth.requireAthleteAccess(actor, "athlete-a");
  assert.throws(
    () => auth.requireAthleteAccess(actor, "athlete-b"),
    (error: unknown) => error instanceof ApiHttpError && error.status === 403 && error.code === "FORBIDDEN",
  );
});

test("production never enables a synthetic actor, even when owner auth is declared", async () => {
  const syntheticActor = createSyntheticTestActor("test-owner", ["athlete-a"]);
  const auth = createServerAuth({
    environment: readCloudEnvironment({ NODE_ENV: "production", RACEPREDICTOR_OWNER_AUTH_CONFIGURED: "true" }),
    syntheticActorResolver: () => syntheticActor,
  });

  const request = new Request("http://localhost/api/v1/testing", {
    headers: { "x-racepredictor-development-actor": "attacker-controlled" },
  });
  const status = await auth.getSessionStatus(request);
  assert.deepEqual(status, { authenticated: false, actor: null, reason: "unauthenticated" });
  await assert.rejects(
    () => auth.requireActor(request),
    (error: unknown) => error instanceof ApiHttpError && error.status === 401 && error.code === "UNAUTHENTICATED",
  );
});

test("environment validation rejects invalid flags and public projection never adds secrets", () => {
  assert.throws(
    () => readCloudEnvironment({ RACEPREDICTOR_CLOUD_MODE: "sometimes" }),
    (error: unknown) => error instanceof CloudEnvironmentError,
  );
  assert.throws(
    () => readCloudEnvironment({ RACEPREDICTOR_CLOUD_MODE: "enabled", RACEPREDICTOR_STRAVA_INGESTION_ENABLED: "yes" }),
    (error: unknown) => error instanceof CloudEnvironmentError,
  );

  const environment = readCloudEnvironment({
    NODE_ENV: "test",
    RACEPREDICTOR_CLOUD_MODE: "enabled",
    RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED: "true",
    RACEPREDICTOR_RELEASE: "safe-release",
    DATABASE_URL: "should-not-be-in-the-projection",
  });
  assert.deepEqual(publicCloudEnvironmentStatus(environment), {
    runtime: "test",
    cloudMode: "enabled",
    features: { stravaIngestion: false, secondBrainSync: true },
    ownerAuthConfigured: false,
    release: "safe-release",
  });
});
