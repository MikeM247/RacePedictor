import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { GET as getActivities } from "../app/api/v1/activities/route.ts";
import { PUT as putCoachingProfile } from "../app/api/v1/coaching/profile/route.ts";
import { GET as getDashboardOverview } from "../app/api/v1/dashboard/overview/route.ts";
import { GET as health } from "../app/api/v1/health/route.ts";
import { POST as uploadActivity } from "../app/api/v1/imports/upload/route.ts";
import { GET as session } from "../app/api/v1/auth/session/route.ts";
import { createSyntheticTestActor } from "../lib/server/auth.ts";
import { readCloudEnvironment } from "../lib/server/cloud-environment.ts";
import {
  createSensitiveRouteWrapper,
  isDeviceAuthenticatedApiPath,
  isInternalAuthenticatedApiPath,
  sensitiveBoundaryDenial,
  type RouteSecurityDependencies,
} from "../lib/server/route-security.ts";
import { config as proxyConfig, proxy } from "../proxy.ts";

const environmentKeys = [
  "NODE_ENV",
  "RACEPREDICTOR_CLOUD_MODE",
  "RACEPREDICTOR_STRAVA_INGESTION_ENABLED",
  "RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED",
  "RACEPREDICTOR_OWNER_AUTH_CONFIGURED",
  "RACEPREDICTOR_ACTOR_ID",
] as const;

async function withEnvironment(overrides: Record<string, string | undefined>, action: () => Promise<void>) {
  const previous = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  try {
    for (const key of environmentKeys) {
      const value = overrides[key];
      if (value === undefined) delete mutableEnvironment[key];
      else mutableEnvironment[key] = value;
    }
    await action();
  } finally {
    for (const key of environmentKeys) {
      const value = previous.get(key);
      if (value === undefined) delete mutableEnvironment[key];
      else mutableEnvironment[key] = value;
    }
  }
}

async function assertUnauthenticated(response: Response) {
  assert.equal(response.status, 401);
  const envelope = await response.json();
  assert.equal(envelope.error.code, "UNAUTHENTICATED");
}

async function findRouteFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) return findRouteFiles(url);
    return entry.name === "route.ts" ? [url] : [];
  }));
  return nested.flat();
}

test("every current sensitive API handler uses the route-level security wrapper", async () => {
  const apiRoot = new URL("../app/api/v1/", import.meta.url);
  const publicRoutes = new Set([
    new URL("health/route.ts", apiRoot).href,
    new URL("auth/session/route.ts", apiRoot).href,
    new URL("providers/strava/webhook/route.ts", apiRoot).href,
  ]);
  const routeFiles = await findRouteFiles(apiRoot);
  const deviceRoutes = new Set([
    new URL("sync/device/changes/route.ts", apiRoot).href,
    new URL("sync/device/acknowledge/route.ts", apiRoot).href,
    new URL("sync/device/plans/route.ts", apiRoot).href,
    new URL("sync/device/failure/route.ts", apiRoot).href,
    new URL("second-brain-context/snapshots/route.ts", apiRoot).href,
  ]);
  const internalRoutes = new Set([new URL("internal/reconciliation/route.ts", apiRoot).href]);
  assert.equal(routeFiles.length, 43, "route inventory changed; classify every new route explicitly");

  for (const routeFile of routeFiles) {
    if (publicRoutes.has(routeFile.href)) continue;
    const source = await readFile(routeFile, "utf8");
    if (internalRoutes.has(routeFile.href)) {
      assert.match(source, /import \{ withInternalRoute \}/, `${routeFile.pathname} must import withInternalRoute`);
      assert.match(source, /export const (GET|POST) = withInternalRoute/, `${routeFile.pathname} must enforce its scheduler secret`);
      continue;
    }
    if (deviceRoutes.has(routeFile.href)) {
      assert.match(source, /import \{ withDeviceRoute \}/, `${routeFile.pathname} must import withDeviceRoute`);
      assert.match(
        source,
        /export const (GET|POST|PUT|PATCH|DELETE) = withDeviceRoute/,
        `${routeFile.pathname} must enforce its device credential`,
      );
      continue;
    }
    assert.match(source, /import \{ withSensitiveRoute \}/, `${routeFile.pathname} must import withSensitiveRoute`);
    assert.match(
      source,
      /export const (GET|POST|PUT|PATCH|DELETE) = withSensitiveRoute/,
      `${routeFile.pathname} must wrap its exported handler`,
    );
  }
});

test("future-session amendment routes use authenticated actor-scoped cloud handling", async () => {
  const amendments = await readFile(
    new URL("../app/api/v1/coaching/calendar/sessions/[sessionId]/amendments/route.ts", import.meta.url),
    "utf8",
  );
  const legacyEdits = await readFile(
    new URL("../app/api/v1/coaching/calendar/sessions/[sessionId]/edits/route.ts", import.meta.url),
    "utf8",
  );

  for (const source of [amendments, legacyEdits]) {
    assert.match(source, /export const POST = withSensitiveRoute/u);
    assert.match(source, /handleCloudSessionAmendment/u);
    assert.match(source, /cloudHandling: "actor-scoped"/u);
  }
  assert.match(amendments, /export const GET = withSensitiveRoute/u);
  assert.match(amendments, /handleCloudSessionAmendmentHistory/u);
  assert.match(legacyEdits, /security\.mode === "authenticated"/u);
});

test("coaching review context uses the sensitive actor-scoped boundary", async () => {
  const source = await readFile(
    new URL("../app/api/v1/coaching/review-context/current/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /export const GET = withSensitiveRoute/u);
  assert.match(source, /handleCloudCoachingReviewContext/u);
  assert.match(source, /cloudHandling: "actor-scoped"/u);
});

test("representative sensitive reads and writes fail before local operations in production", { concurrency: false }, async () => {
  await withEnvironment({
    NODE_ENV: "production",
    RACEPREDICTOR_CLOUD_MODE: "enabled",
    RACEPREDICTOR_OWNER_AUTH_CONFIGURED: "false",
  }, async () => {
    await assertUnauthenticated(await getActivities(new Request("http://localhost/api/v1/activities")));
    await assertUnauthenticated(await getDashboardOverview(new Request("http://localhost/api/v1/dashboard/overview")));
    await assertUnauthenticated(await uploadActivity(new Request("http://localhost/api/v1/imports/upload", { method: "POST" })));
    await assertUnauthenticated(await putCoachingProfile(new Request("http://localhost/api/v1/coaching/profile", {
      method: "PUT",
      body: "not-json",
    })));
  });
});

test("cloud-enabled test mode also fails closed without an actor", { concurrency: false }, async () => {
  await withEnvironment({ NODE_ENV: "test", RACEPREDICTOR_CLOUD_MODE: "enabled" }, async () => {
    await assertUnauthenticated(await getActivities(new Request("http://localhost/api/v1/activities")));
  });
});

test("request headers and environment declarations cannot synthesize a production actor", { concurrency: false }, async () => {
  await withEnvironment({
    NODE_ENV: "production",
    RACEPREDICTOR_CLOUD_MODE: "enabled",
    RACEPREDICTOR_OWNER_AUTH_CONFIGURED: "true",
    RACEPREDICTOR_ACTOR_ID: "attacker-athlete",
  }, async () => {
    const request = new Request("http://localhost/api/v1/activities", {
      headers: {
        authorization: "Bearer attacker-controlled",
        "x-racepredictor-actor-id": "attacker-athlete",
        "x-racepredictor-development-actor": "attacker-athlete",
      },
    });
    await assertUnauthenticated(await getActivities(request));
  });
});

test("health and session stay public while proxy covers sensitive APIs and dashboard pages", { concurrency: false }, async () => {
  assert.deepEqual(proxyConfig.matcher, ["/dashboard/:path*", "/api/v1/:path*"]);

  await withEnvironment({ NODE_ENV: "production", RACEPREDICTOR_CLOUD_MODE: "enabled" }, async () => {
    const healthResponse = await health();
    assert.equal(healthResponse.status, 503, "public health truthfully reports degraded until owner auth is configured");
    assert.equal((await healthResponse.json()).data.status, "degraded");
    assert.equal((await session(new Request("http://localhost/api/v1/auth/session"))).status, 200);

    const healthBoundary = await proxy(new NextRequest("http://localhost/api/v1/health"));
    const sessionBoundary = await proxy(new NextRequest("http://localhost/api/v1/auth/session"));
    const webhookBoundary = await proxy(new NextRequest("http://localhost/api/v1/providers/strava/webhook"));
    const deviceBoundary = await proxy(new NextRequest("http://localhost/api/v1/sync/device/changes"));
    const internalBoundary = await proxy(new NextRequest("http://localhost/api/v1/internal/reconciliation"));
    assert.equal(healthBoundary.status, 200);
    assert.equal(sessionBoundary.status, 200);
    assert.equal(webhookBoundary.status, 200);
    assert.equal(deviceBoundary.status, 200);
    assert.equal(internalBoundary.status, 200);
    assert.equal(healthBoundary.headers.get("x-middleware-next"), "1");
    assert.equal(sessionBoundary.headers.get("x-middleware-next"), "1");
    assert.equal(webhookBoundary.headers.get("x-middleware-next"), "1");
    assert.equal(deviceBoundary.headers.get("x-middleware-next"), "1");
    assert.equal(internalBoundary.headers.get("x-middleware-next"), "1");

    await assertUnauthenticated(await proxy(new NextRequest("http://localhost/api/v1/activities")));
    await assertUnauthenticated(await proxy(new NextRequest("http://localhost/api/v1/providers/strava/webhook/probe")));
    const dashboardResponse = await proxy(new NextRequest("http://localhost/dashboard"));
    assert.equal(dashboardResponse.status, 307);
    assert.equal(dashboardResponse.headers.get("location"), "http://localhost/login");
  });
});

test("only exact self-authenticated device routes bypass the browser-session boundary", async () => {
  assert.equal(isDeviceAuthenticatedApiPath("/api/v1/sync/device/changes"), true);
  assert.equal(isDeviceAuthenticatedApiPath("/api/v1/sync/device/acknowledge"), true);
  assert.equal(isDeviceAuthenticatedApiPath("/api/v1/sync/device/plans"), true);
  assert.equal(isDeviceAuthenticatedApiPath("/api/v1/sync/device/failure"), true);
  assert.equal(isDeviceAuthenticatedApiPath("/api/v1/second-brain-context/snapshots"), true);
  assert.equal(isDeviceAuthenticatedApiPath("/api/v1/sync/device/changes/probe"), false);
  assert.equal(isDeviceAuthenticatedApiPath("/api/v1/sync/devices"), false);
  assert.equal(isInternalAuthenticatedApiPath("/api/v1/internal/reconciliation"), true);
  assert.equal(isInternalAuthenticatedApiPath("/api/v1/internal/reconciliation/probe"), false);
});

test("authenticated actors cannot execute legacy global handlers or infer another athlete resource", async () => {
  const actorA = createSyntheticTestActor("owner-a", ["athlete-a"]);
  const actorB = createSyntheticTestActor("owner-b", ["athlete-b"]);
  let operationCalls = 0;

  const makeDependencies = (actor: typeof actorA): RouteSecurityDependencies => ({
    readEnvironment: () => readCloudEnvironment({ NODE_ENV: "test", RACEPREDICTOR_CLOUD_MODE: "enabled" }),
    getAuth: () => ({ requireActor: async () => actor }),
  });
  const legacyHandler = async () => {
    operationCalls += 1;
    return Response.json({ exists: true, athleteId: "global-athlete" });
  };

  const responseA = await createSensitiveRouteWrapper(makeDependencies(actorA))(legacyHandler)(
    new Request("http://localhost/api/v1/activities/global-resource"),
  );
  const responseB = await createSensitiveRouteWrapper(makeDependencies(actorB))(legacyHandler)(
    new Request("http://localhost/api/v1/activities/global-resource"),
  );

  assert.equal(operationCalls, 0);
  assert.equal(responseA.status, 503);
  assert.equal(responseB.status, 503);
  assert.deepEqual(await responseA.json(), await responseB.json());
});

test("cloud-safe handlers receive the authenticated actor context for athlete-scoped operations", async () => {
  const actor = createSyntheticTestActor("owner-a", ["athlete-a"]);
  const dependencies: RouteSecurityDependencies = {
    readEnvironment: () => readCloudEnvironment({ NODE_ENV: "test", RACEPREDICTOR_CLOUD_MODE: "enabled" }),
    getAuth: () => ({ requireActor: async () => actor }),
  };
  const handler = createSensitiveRouteWrapper(dependencies)(
    (security) => {
      assert.equal(security.mode, "authenticated");
      return Response.json({ athleteId: security.actor.activeAthleteId });
    },
    { cloudHandling: "actor-scoped" },
  );

  const response = await handler(new Request("http://localhost/api/v1/cloud-safe"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { athleteId: "athlete-a" });
});

test("authenticated dashboard boundary proceeds to actor-scoped cloud pages", async () => {
  const actor = createSyntheticTestActor("owner-a", ["athlete-a"]);
  const dependencies: RouteSecurityDependencies = {
    readEnvironment: () => readCloudEnvironment({ NODE_ENV: "test", RACEPREDICTOR_CLOUD_MODE: "enabled" }),
    getAuth: () => ({ requireActor: async () => actor }),
  };

  const response = await sensitiveBoundaryDenial(new Request("http://localhost/dashboard"), dependencies);
  assert.equal(response, null);
});

test("cloud-disabled local mode preserves existing route behavior", { concurrency: false }, async () => {
  await withEnvironment({ NODE_ENV: "test", RACEPREDICTOR_CLOUD_MODE: "disabled" }, async () => {
    const activities = await getActivities(new Request("http://localhost/api/v1/activities?limit=1"));
    assert.notEqual(activities.status, 401);
    assert.notEqual(activities.status, 503);

    const invalidUpload = await uploadActivity(new Request("http://localhost/api/v1/imports/upload", { method: "POST" }));
    assert.equal(invalidUpload.status, 400);
  });
});
