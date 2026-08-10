import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { AthleteScope } from "../src/contracts/auth.ts";
import type { StravaWebhookEvent } from "../src/contracts/strava-webhooks.ts";
import type { RawObjectMetadata, RawObjectStore } from "../src/ports/cloud-sync.ts";
import type {
  WebhookProviderConnection,
  WebhookReceiptRepository,
} from "../src/ports/strava-webhooks.ts";
import {
  createProviderEventKey,
  parseStravaWebhookEvent,
  StravaWebhookReceiptError,
  StravaWebhookReceiptService,
} from "../src/use-cases/strava-webhook-receipt.ts";

const createEvent = {
  aspect_type: "create",
  event_time: 1_786_355_600,
  object_id: 12_345_678_901,
  object_type: "activity",
  owner_id: 456_789,
  subscription_id: 120_475,
  updates: {},
} as const;

test("strict parser accepts documented activity lifecycle and athlete deauthorization events", () => {
  for (const aspect_type of ["create", "update", "delete"] as const) {
    const updates = aspect_type === "update" ? { title: "Synthetic run", private: "false" as const } : {};
    const parsed = parseStravaWebhookEvent(bytes({ ...createEvent, aspect_type, updates }));
    assert.equal(parsed.object_type, "activity");
    assert.equal(parsed.aspect_type, aspect_type);
  }

  const deauthorization = parseStravaWebhookEvent(bytes({
    ...createEvent,
    aspect_type: "update",
    object_id: createEvent.owner_id,
    object_type: "athlete",
    updates: { authorized: "false" },
  }));
  assert.equal(deauthorization.object_type, "athlete");
});

test("strict parser rejects malformed, unknown, oversized, and non-deauthorization athlete events without echoing input", async () => {
  for (const payload of [
    new TextEncoder().encode("not-json"),
    bytes({ ...createEvent, object_type: "route" }),
    bytes({ ...createEvent, unexpected: "private fixture text" }),
    bytes({ ...createEvent, object_type: "athlete", aspect_type: "update", updates: { authorized: "true" } }),
  ]) {
    assert.throws(
      () => parseStravaWebhookEvent(payload),
      (error: unknown) => error instanceof StravaWebhookReceiptError
        && error.code === "INVALID_WEBHOOK"
        && !error.message.includes("private fixture text"),
    );
  }

  const dependencies = createDependencies();
  const service = new StravaWebhookReceiptService(dependencies);
  await assert.rejects(
    service.receive(new Uint8Array(64 * 1024 + 1)),
    (error: unknown) => error instanceof StravaWebhookReceiptError && error.code === "INVALID_WEBHOOK",
  );
});

test("receipt stores durable work before non-blocking scheduling and safely reuses an exact duplicate", async () => {
  const dependencies = createDependencies();
  const service = new StravaWebhookReceiptService(dependencies);
  const rawBody = bytes(createEvent);

  const first = await service.receive(rawBody);
  const duplicate = await service.receive(rawBody);

  assert.equal(first.eventKind, "activity_create");
  assert.equal(first.reused, false);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.eventId, first.eventId);
  assert.equal(duplicate.jobId, first.jobId);
  assert.deepEqual(dependencies.operations, [
    "raw",
    "event_job",
    `schedule:${first.jobId}`,
    "raw",
    "event_job",
    `schedule:${first.jobId}`,
  ]);
  assert.equal(dependencies.rawBodies.size, 1);
  assert.equal(dependencies.events.size, 1);

  const failedSchedule = createDependencies({ schedulerThrows: true });
  const durable = await new StravaWebhookReceiptService(failedSchedule).receive(rawBody);
  assert.equal(durable.jobId, "job-athlete-a");
  assert.equal(failedSchedule.events.size, 1, "scheduler failure cannot roll back durable receipt");
});

test("altered duplicate, unknown connection, and cross-athlete resolution fail without leaking identifiers", async () => {
  const dependencies = createDependencies();
  const service = new StravaWebhookReceiptService(dependencies);
  await service.receive(bytes({ ...createEvent, aspect_type: "update", updates: { title: "First" } }));

  await assert.rejects(
    service.receive(bytes({ ...createEvent, aspect_type: "update", updates: { title: "Altered private title" } })),
    (error: unknown) => error instanceof StravaWebhookReceiptError
      && error.code === "WEBHOOK_CONFLICT"
      && !error.message.includes("Altered private title"),
  );

  await assert.rejects(
    service.receive(bytes({ ...createEvent, owner_id: 999_999 })),
    (error: unknown) => error instanceof StravaWebhookReceiptError
      && error.code === "UNRESOLVED_CONNECTION"
      && !error.message.includes("999999"),
  );
  assert.equal(dependencies.rawBodies.size, 1);

  dependencies.connections.set("777777", {
    id: "connection-b",
    athleteId: "athlete-b",
    providerAthleteId: "777777",
    status: "connected",
  });
  const athleteB = await service.receive(bytes({ ...createEvent, owner_id: 777_777, object_id: 777_001 }));
  assert.notEqual(athleteB.eventId, "event-athlete-a");
  assert.match([...dependencies.rawBodies.keys()].find((key) => key.includes("athlete-b")) ?? "", /^athletes\/athlete-b\//);
});

test("provider event identity is deterministic and distinguishes lifecycle/update shapes", () => {
  const parsed = parseStravaWebhookEvent(bytes(createEvent));
  assert.equal(createProviderEventKey(parsed), createProviderEventKey(parsed));
  const update = parseStravaWebhookEvent(bytes({ ...createEvent, aspect_type: "update", updates: { type: "Run" } }));
  assert.notEqual(createProviderEventKey(parsed), createProviderEventKey(update));
});

function createDependencies({ schedulerThrows = false } = {}) {
  const operations: string[] = [];
  const rawBodies = new Map<string, { metadata: RawObjectMetadata; body: Uint8Array }>();
  const events = new Map<string, { checksum: string; event: StravaWebhookEvent; eventId: string; jobId: string }>();
  const connections = new Map<string, WebhookProviderConnection>([["456789", {
    id: "connection-a",
    athleteId: "athlete-a",
    providerAthleteId: "456789",
    status: "connected",
  }]]);

  const rawObjectStore: RawObjectStore = {
    async put(scope, { metadata, body }) {
      operations.push("raw");
      assert.equal(scope.athleteId, metadata.athleteId);
      assert.equal(metadata.checksumSha256, sha256(body));
      const existing = rawBodies.get(metadata.key);
      if (existing) {
        if (existing.metadata.checksumSha256 !== metadata.checksumSha256) throw new Error("Raw object keys are immutable");
        return existing.metadata;
      }
      rawBodies.set(metadata.key, { metadata, body: new Uint8Array(body) });
      return metadata;
    },
    async head(scope, key) {
      const value = rawBodies.get(key)?.metadata ?? null;
      if (value && value.athleteId !== scope.athleteId) throw new Error("not authorized");
      return value;
    },
    async createPresignedGet() {
      throw new Error("not needed by webhook receipt");
    },
  };

  const receiptRepository: WebhookReceiptRepository = {
    async resolveStravaConnection(providerAthleteId) {
      return connections.get(providerAthleteId) ?? null;
    },
    async persistAndEnqueue(scope: AthleteScope, input) {
      operations.push("event_job");
      assert.equal(scope.athleteId, input.connection.athleteId);
      assert.equal(input.rawObject.athleteId, scope.athleteId);
      const mapKey = `${scope.athleteId}:${input.event.providerEventKey}`;
      const existing = events.get(mapKey);
      if (existing) {
        if (existing.checksum !== input.event.payloadChecksumSha256) throw new Error("Webhook event conflict");
        return { eventId: existing.eventId, jobId: existing.jobId, reused: true };
      }
      const record = {
        checksum: input.event.payloadChecksumSha256,
        event: input.event.event,
        eventId: `event-${scope.athleteId}`,
        jobId: `job-${scope.athleteId}`,
      };
      events.set(mapKey, record);
      return { eventId: record.eventId, jobId: record.jobId, reused: false };
    },
  };

  const jobScheduler = {
    schedule(jobId: string) {
      operations.push(`schedule:${jobId}`);
      if (schedulerThrows) throw new Error("synthetic background scheduler failure");
    },
  };

  return { receiptRepository, rawObjectStore, jobScheduler, operations, rawBodies, events, connections };
}

function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
