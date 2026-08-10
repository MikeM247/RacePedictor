import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { InMemoryRawObjectStore } from "../../../packages/db/src/cloud/in-memory-raw-object-store.js";
import { InMemoryWebhookReceiptRepository } from "../../../packages/db/src/cloud/in-memory-webhook-receipt-repository.js";
import {
  StravaWebhookReceiptError,
  StravaWebhookReceiptService,
} from "../../../packages/core/src/use-cases/strava-webhook-receipt.ts";
import { createStravaWebhookRoute } from "../lib/server/strava-webhook-route.ts";

const verifyToken = "synthetic-environment-verify-token";
const subscriptionId = 120_475;
const ownerId = 456_789;

test("GET validates the exact environment token and echoes only Strava's challenge", async () => {
  const route = createStravaWebhookRoute({
    getVerificationToken: () => verifyToken,
    receive: async () => { throw new Error("not used"); },
  });
  const valid = await route.GET(new Request(
    `http://localhost/api/v1/providers/strava/webhook?hub.mode=subscribe&hub.challenge=challenge-123&hub.verify_token=${verifyToken}`,
  ));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { "hub.challenge": "challenge-123" });
  assert.equal(valid.headers.get("cache-control"), "no-store");

  for (const url of [
    "http://localhost/api/v1/providers/strava/webhook?hub.mode=subscribe&hub.challenge=x&hub.verify_token=wrong",
    `http://localhost/api/v1/providers/strava/webhook?hub.mode=publish&hub.challenge=x&hub.verify_token=${verifyToken}`,
    `http://localhost/api/v1/providers/strava/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}`,
  ]) {
    const response = await route.GET(new Request(url));
    assert.equal(response.status, 403);
    assert.equal(JSON.stringify(await response.json()).includes(verifyToken), false);
  }
});

test("GET and POST fail closed with redacted responses when configuration or storage is unavailable", async () => {
  const route = createStravaWebhookRoute({
    getVerificationToken: () => { throw new Error("secret-value-was-not-set"); },
    receive: async () => {
      throw new StravaWebhookReceiptError("WEBHOOK_UNAVAILABLE", "private storage detail secret-value");
    },
  });
  const getResponse = await route.GET(new Request("http://localhost/api/v1/providers/strava/webhook"));
  const postResponse = await route.POST(jsonRequest(activityEvent("create")));
  assert.equal(getResponse.status, 503);
  assert.equal(postResponse.status, 503);
  const postEnvelope = await postResponse.json();
  assert.equal(postEnvelope.error.code, "WEBHOOK_RECEIPT_FAILED");
  const serialized = JSON.stringify(postEnvelope);
  assert.equal(serialized.includes("private storage detail"), false);
  assert.equal(serialized.includes("secret-value"), false);
});

test("POST durably accepts create, update, delete, deauthorization, and an exact retry within two seconds", async () => {
  const { route, repository, service } = makeIntegratedRoute();
  const startedAt = performance.now();
  for (const event of [
    activityEvent("create", { object_id: 101, event_time: 1_786_355_601 }),
    activityEvent("update", { object_id: 102, event_time: 1_786_355_602, updates: { title: "Synthetic" } }),
    activityEvent("delete", { object_id: 103, event_time: 1_786_355_603 }),
    deauthorizationEvent(),
  ]) {
    const response = await route.POST(jsonRequest(event));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {});
  }
  const duplicateBody = activityEvent("create", { object_id: 101, event_time: 1_786_355_601 });
  assert.equal((await route.POST(jsonRequest(duplicateBody))).status, 200);
  assert.ok(performance.now() - startedAt < 2_000, "synthetic durable receipt exceeded Strava's callback limit");

  const receipt = await service.receive(bytes(duplicateBody));
  assert.equal(receipt.reused, true);
  const job = await repository.inspectJob(internalScopeForInspection(repository, receipt), receipt.jobId);
  assert.ok(job);
  assert.equal(job.status, "queued");
});

test("POST rejects altered retries, unknown connections, wrong subscription, malformed/unrecognized bodies, and media types", async () => {
  const { route } = makeIntegratedRoute();
  const original = activityEvent("update", { updates: { title: "First" } });
  assert.equal((await route.POST(jsonRequest(original))).status, 200);

  const altered = await route.POST(jsonRequest(activityEvent("update", { updates: { title: "Private changed title" } })));
  assert.equal(altered.status, 503);
  const alteredEnvelope = await altered.json();
  assert.equal(JSON.stringify(alteredEnvelope).includes("Private changed title"), false);

  const unknown = await route.POST(jsonRequest(activityEvent("create", { owner_id: 999_999 })));
  assert.equal(unknown.status, 503);
  assert.deepEqual(await unknown.json(), alteredEnvelope, "known and unknown receipt failures must be indistinguishable");
  assert.equal((await route.POST(jsonRequest(activityEvent("create", { subscription_id: 999 })))).status, 400);
  assert.equal((await route.POST(new Request("http://localhost/api/v1/providers/strava/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json",
  }))).status, 400);
  assert.equal((await route.POST(jsonRequest({ ...activityEvent("create"), object_type: "route" }))).status, 400);
  assert.equal((await route.POST(new Request("http://localhost/api/v1/providers/strava/webhook", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  }))).status, 400);
});

test("POST waits for durable receipt before acknowledging and performs no activity fetch in the handler", async () => {
  let persisted = false;
  let releasePersistence!: () => void;
  const persistence = new Promise<void>((resolve) => { releasePersistence = resolve; });
  const route = createStravaWebhookRoute({
    getVerificationToken: () => verifyToken,
    receive: async () => {
      await persistence;
      persisted = true;
      return {
        eventId: "event-1",
        jobId: "job-1",
        reused: false,
        providerEventKey: "a".repeat(64),
        eventKind: "activity_create",
      };
    },
  });

  const pendingResponse = route.POST(jsonRequest(activityEvent("create")));
  await Promise.resolve();
  assert.equal(persisted, false);
  releasePersistence();
  const response = await pendingResponse;
  assert.equal(persisted, true);
  assert.equal(response.status, 200);
  assert.equal("fetchActivity" in route, false);
});

function makeIntegratedRoute() {
  const repository = new InMemoryWebhookReceiptRepository({
    connections: [{
      id: "connection-a",
      athleteId: "athlete-a",
      providerAthleteId: String(ownerId),
      status: "connected",
    }],
  });
  const rawObjectStore = new InMemoryRawObjectStore();
  const service = new StravaWebhookReceiptService({
    receiptRepository: repository,
    rawObjectStore,
    expectedSubscriptionId: subscriptionId,
  });
  const route = createStravaWebhookRoute({
    getVerificationToken: () => verifyToken,
    receive: (rawBody) => service.receive(rawBody),
  });
  return { route, repository, service };
}

function activityEvent(
  aspect_type: "create" | "update" | "delete",
  overrides: Record<string, unknown> = {},
) {
  return {
    aspect_type,
    event_time: 1_786_355_600,
    object_id: 123_456,
    object_type: "activity",
    owner_id: ownerId,
    subscription_id: subscriptionId,
    updates: {},
    ...overrides,
  };
}

function deauthorizationEvent() {
  return {
    ...activityEvent("update"),
    event_time: 1_786_355_604,
    object_id: ownerId,
    object_type: "athlete",
    updates: { authorized: "false" },
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/v1/providers/strava/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function internalScopeForInspection(_repository: unknown, receipt: { providerEventKey: string }) {
  // Inspection is a test-only use of the same internal athlete identity the
  // receipt service creates. Keeping it local avoids exposing such a helper in
  // the production webhook API.
  return {
    actor: {
      userId: "provider:strava",
      permittedAthleteIds: ["athlete-a"],
      activeAthleteId: "athlete-a",
      requestId: `strava:${receipt.providerEventKey.slice(0, 40)}`,
      credentialKind: "internal",
    },
    athleteId: "athlete-a",
  } as const;
}
