import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import {
  InMemoryWebhookReceiptRepository,
  PrismaWebhookReceiptRepository,
  R2RawObjectStore,
} from "../src/cloud/index.js";

const athleteA = "athlete-a";
const athleteB = "athlete-b";
const scopeA = athleteScopeFor(buildActorContext({
  userId: "provider:strava",
  permittedAthleteIds: [athleteA],
  activeAthleteId: athleteA,
  requestId: "request-a",
  credentialKind: "internal",
}));
const scopeB = athleteScopeFor(buildActorContext({
  userId: "provider:strava",
  permittedAthleteIds: [athleteB],
  activeAthleteId: athleteB,
  requestId: "request-b",
  credentialKind: "internal",
}));

test("R2 adapter uses an atomic private write and verifies checksum, replay, and signed access", async () => {
  const client = new FakeS3Client();
  const store = makeStore(client);
  const body = Buffer.from('{"synthetic":"webhook"}', "utf8");
  const metadata = rawMetadata(athleteA, body);

  assert.deepEqual(await store.put(scopeA, { metadata, body }), metadata);
  assert.deepEqual(await store.put(scopeA, { metadata, body }), metadata);
  assert.equal(client.commandCounts.get("PutObjectCommand"), 1);
  assert.equal(client.putInputs[0].IfNoneMatch, "*");
  assert.equal(client.putInputs[0].ACL, undefined);
  assert.equal(client.putInputs[0].Metadata["racepredictor-checksum-sha256"], metadata.checksumSha256);
  assert.deepEqual(Buffer.from(await store.readImmutableForReplay(scopeA, metadata.key)), body);

  const signed = await store.createPresignedGet(scopeA, { key: metadata.key, expiresInSeconds: 60 });
  assert.match(signed, /^https:\/\/synthetic-account\.r2\.cloudflarestorage\.com\//);
  assert.match(signed, /X-Amz-Signature=synthetic/);
  await assert.rejects(store.head(scopeB, metadata.key), /not authorized/);
  await assert.rejects(
    store.createPresignedGet(scopeA, { key: metadata.key, expiresInSeconds: 901 }),
    /between 1 and 900/,
  );
});

test("R2 adapter denies altered keys, corrupted replay, unsigned URLs, and non-R2 endpoints", async () => {
  const client = new FakeS3Client();
  const store = makeStore(client);
  const body = Buffer.from("original", "utf8");
  const metadata = rawMetadata(athleteA, body);
  await store.put(scopeA, { metadata, body });

  const changed = Buffer.from("altered", "utf8");
  await assert.rejects(
    store.put(scopeA, {
      metadata: { ...metadata, checksumSha256: sha256(changed), sizeBytes: changed.byteLength },
      body: changed,
    }),
    /immutable/,
  );
  client.objects.get(metadata.key).body[0] ^= 1;
  await assert.rejects(store.readImmutableForReplay(scopeA, metadata.key), /checksum verification failed/);

  const unsignedStore = makeStore(client, async () => "https://synthetic-account.r2.cloudflarestorage.com/raw.json");
  await assert.rejects(
    unsignedStore.createPresignedGet(scopeA, { key: metadata.key, expiresInSeconds: 30 }),
    /private short-lived URL/,
  );
  assert.throws(
    () => new R2RawObjectStore({
      bucket: "racepredictor-raw",
      endpoint: "https://public.example/raw",
      client,
      presign: signedUrl,
    }),
    /endpoint is invalid/,
  );
});

test("R2 conditional-write race reuses identical content and rejects an altered winner", async () => {
  const client = new FakeS3Client();
  const store = makeStore(client);
  const original = Buffer.from("original", "utf8");
  const metadata = rawMetadata(athleteA, original);
  client.onBeforeFirstPut = (input) => {
    client.objects.set(input.Key, {
      body: Buffer.from(original),
      contentType: input.ContentType,
      metadata: input.Metadata,
    });
  };
  assert.deepEqual(await store.put(scopeA, { metadata, body: original }), metadata);

  const clientWithAlteredWinner = new FakeS3Client();
  const storeWithAlteredWinner = makeStore(clientWithAlteredWinner);
  clientWithAlteredWinner.onBeforeFirstPut = (input) => {
    const changed = Buffer.from("other", "utf8");
    clientWithAlteredWinner.objects.set(input.Key, {
      body: changed,
      contentType: input.ContentType,
      metadata: {
        ...input.Metadata,
        "racepredictor-checksum-sha256": sha256(changed),
      },
    });
  };
  await assert.rejects(
    storeWithAlteredWinner.put(scopeA, { metadata, body: original }),
    /integrity verification failed/,
  );
});

test("webhook repository resolves connections without cross-athlete access and records one retry-safe event/job", async () => {
  const repository = new InMemoryWebhookReceiptRepository({
    connections: [
      { id: "connection-a", athleteId: athleteA, providerAthleteId: "111", status: "connected" },
      { id: "connection-b", athleteId: athleteB, providerAthleteId: "222", status: "attention" },
    ],
  });
  const connectionA = await repository.resolveStravaConnection("111");
  const input = receiptInput(connectionA);

  const first = await repository.persistAndEnqueue(scopeA, input);
  const replay = await repository.persistAndEnqueue(scopeA, input);
  assert.equal(first.reused, false);
  assert.deepEqual(replay, { ...first, reused: true });
  assert.equal((await repository.inspectEvent(scopeA, input.event.providerEventKey)).rawObject.key, input.rawObject.key);
  assert.equal((await repository.inspectJob(scopeA, first.jobId)).status, "queued");
  await assert.rejects(repository.persistAndEnqueue(scopeB, input), /not authorized/);
  await assert.rejects(repository.inspectJob(scopeB, first.jobId), /not authorized/);

  await assert.rejects(
    repository.persistAndEnqueue(scopeA, {
      ...input,
      event: { ...input.event, payloadChecksumSha256: "b".repeat(64) },
    }),
    /conflicts/,
  );
  assert.equal(await repository.resolveStravaConnection("missing"), null);
});

test("Prisma webhook repository requests one transaction, rolls back partial failure, and is idempotent", async () => {
  const prisma = new FakePrisma();
  prisma.connections.set("connection-a", {
    id: "connection-a",
    athleteId: athleteA,
    provider: "strava",
    providerAthleteId: "111",
    status: "connected",
  });
  const repository = new PrismaWebhookReceiptRepository({ prisma });
  const connection = await repository.resolveStravaConnection("111");
  const input = receiptInput(connection);

  prisma.failNextJob = true;
  await assert.rejects(repository.persistAndEnqueue(scopeA, input), /synthetic job failure/);
  assert.equal(prisma.rawObjects.size, 0);
  assert.equal(prisma.events.size, 0);
  assert.equal(prisma.jobs.size, 0);

  const first = await repository.persistAndEnqueue(scopeA, input);
  const replay = await repository.persistAndEnqueue(scopeA, input);
  assert.equal(first.reused, false);
  assert.deepEqual(replay, { ...first, reused: true });
  assert.equal(prisma.rawObjects.size, 1);
  assert.equal(prisma.events.size, 1);
  assert.equal(prisma.jobs.size, 1);
  assert.equal(JSON.stringify([...prisma.rawObjects.values()]).includes("synthetic webhook body"), false);

  await assert.rejects(
    repository.persistAndEnqueue(scopeB, input),
    /not authorized/,
  );
  await assert.rejects(
    repository.persistAndEnqueue(scopeA, {
      ...input,
      rawObject: { ...input.rawObject, checksumSha256: "b".repeat(64) },
    }),
    /metadata conflicts/,
  );
});

function makeStore(client, presign = signedUrl) {
  return new R2RawObjectStore({
    bucket: "racepredictor-raw",
    endpoint: "https://synthetic-account.r2.cloudflarestorage.com",
    client,
    presign,
  });
}

function rawMetadata(athleteId, body) {
  return {
    athleteId,
    provider: "strava",
    key: `athletes/${athleteId}/providers/strava/webhooks/${"a".repeat(64)}.json`,
    checksumSha256: sha256(body),
    contentType: "application/json",
    sizeBytes: body.byteLength,
    capturedAt: "2026-08-10T10:00:00.000Z",
  };
}

function receiptInput(connection) {
  const body = Buffer.from("{}", "utf8");
  return {
    connection,
    event: {
      providerEventKey: "a".repeat(64),
      payloadChecksumSha256: sha256(body),
      event: {
        aspect_type: "create",
        event_time: 1_786_355_600,
        object_id: 999,
        object_type: "activity",
        owner_id: Number(connection.providerAthleteId),
        subscription_id: 123,
        updates: {},
      },
      occurredAt: "2026-08-10T10:00:00.000Z",
    },
    rawObject: rawMetadata(connection.athleteId, body),
  };
}

async function signedUrl(_client, command, { expiresIn }) {
  return `https://synthetic-account.r2.cloudflarestorage.com/${command.input.Bucket}/${command.input.Key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=synthetic`;
}

class FakeS3Client {
  objects = new Map();
  commandCounts = new Map();
  putInputs = [];
  onBeforeFirstPut = null;

  async send(command) {
    const name = command.constructor.name;
    this.commandCounts.set(name, (this.commandCounts.get(name) ?? 0) + 1);
    if (command instanceof HeadObjectCommand) {
      const object = this.objects.get(command.input.Key);
      if (!object) throw Object.assign(new Error("not found"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
      return {
        ContentLength: object.body.byteLength,
        ContentType: object.contentType,
        Metadata: object.metadata,
      };
    }
    if (command instanceof PutObjectCommand) {
      this.putInputs.push(command.input);
      if (this.onBeforeFirstPut) {
        const action = this.onBeforeFirstPut;
        this.onBeforeFirstPut = null;
        action(command.input);
      }
      if (command.input.IfNoneMatch === "*" && this.objects.has(command.input.Key)) {
        throw Object.assign(new Error("precondition"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
      }
      this.objects.set(command.input.Key, {
        body: Buffer.from(command.input.Body),
        contentType: command.input.ContentType,
        metadata: command.input.Metadata,
      });
      return { ETag: "synthetic" };
    }
    if (command instanceof GetObjectCommand) {
      const object = this.objects.get(command.input.Key);
      if (!object) throw Object.assign(new Error("not found"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
      return { Body: new Uint8Array(object.body) };
    }
    throw new Error(`Unexpected command ${name}`);
  }
}

class FakePrisma {
  connections = new Map();
  rawObjects = new Map();
  events = new Map();
  jobs = new Map();
  failNextJob = false;

  providerConnection = {
    findUnique: async ({ where }) => {
      if (where.provider_providerAthleteId) {
        return [...this.connections.values()].find((connection) => (
          connection.provider === where.provider_providerAthleteId.provider
          && connection.providerAthleteId === where.provider_providerAthleteId.providerAthleteId
        )) ?? null;
      }
      const connection = this.connections.get(where.id_athleteId.id);
      return connection?.athleteId === where.id_athleteId.athleteId ? connection : null;
    },
  };

  rawObject = {
    upsert: async ({ where, create }) => {
      const unique = where.athleteId_provider_kind_providerObjectId_objectVersion;
      const key = `${unique.athleteId}:${unique.provider}:${unique.kind}:${unique.providerObjectId}:${unique.objectVersion}`;
      const existing = this.rawObjects.get(key);
      if (existing) return existing;
      const record = { id: `raw-${this.rawObjects.size + 1}`, ...create };
      this.rawObjects.set(key, record);
      return record;
    },
  };

  providerWebhookEvent = {
    findUnique: async ({ where }) => this.events.get(eventMapKey(where)) ?? null,
    upsert: async ({ where, create }) => {
      const key = eventMapKey(where);
      const existing = this.events.get(key);
      if (existing) return existing;
      const record = { id: `event-${this.events.size + 1}`, ...create };
      this.events.set(key, record);
      return record;
    },
  };

  ingestionJob = {
    upsert: async ({ where, create }) => {
      if (this.failNextJob) {
        this.failNextJob = false;
        throw new Error("synthetic job failure");
      }
      const unique = where.athleteId_idempotencyKey;
      const key = `${unique.athleteId}:${unique.idempotencyKey}`;
      const existing = this.jobs.get(key);
      if (existing) return existing;
      const record = { id: `job-${this.jobs.size + 1}`, ...create };
      this.jobs.set(key, record);
      return record;
    },
  };

  async $transaction(action) {
    const snapshot = {
      rawObjects: new Map(this.rawObjects),
      events: new Map(this.events),
      jobs: new Map(this.jobs),
    };
    try {
      return await action(this);
    } catch (error) {
      this.rawObjects = snapshot.rawObjects;
      this.events = snapshot.events;
      this.jobs = snapshot.jobs;
      throw error;
    }
  }
}

function eventMapKey(where) {
  const unique = where.athleteId_provider_providerEventKey;
  return `${unique.athleteId}:${unique.provider}:${unique.providerEventKey}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
