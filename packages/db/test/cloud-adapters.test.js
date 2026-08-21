import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  athleteScopeFor,
  buildActorContext,
} from "../../core/src/contracts/auth.ts";
import { canonicalSecondBrainHashInput } from "../../core/src/contracts/second-brain-context.ts";
import {
  CredentialEnvelopeCrypto,
  InMemoryDurableJobQueue,
  InMemoryRawObjectStore,
  InMemorySecondBrainSnapshotRepository,
  InMemorySyncRepository,
  rawObjectKeyPrefix,
} from "../src/cloud/index.js";

const athleteA = "athlete_001";
const athleteB = "athlete_002";
const actorA = buildActorContext({
  userId: "user_001",
  permittedAthleteIds: [athleteA],
  activeAthleteId: athleteA,
  requestId: "request_001",
  credentialKind: "internal",
});
const actorB = buildActorContext({
  userId: "user_002",
  permittedAthleteIds: [athleteB],
  activeAthleteId: athleteB,
  requestId: "request_002",
  credentialKind: "internal",
});
const scopeA = athleteScopeFor(actorA);
const scopeB = athleteScopeFor(actorB);
const forgedScopeB = { actor: actorA, athleteId: athleteB };

test("credential envelopes authenticate ciphertext, key version, and athlete/provider binding", () => {
  const keyV1 = randomBytes(32);
  const keyV2 = randomBytes(32);
  const crypto = new CredentialEnvelopeCrypto({
    activeKeyVersion: "v2",
    keys: { v1: keyV1, v2: keyV2 },
  });
  const credentials = {
    accessToken: "private-access-token",
    refreshToken: "private-refresh-token",
    expiresAt: "2026-08-10T12:00:00.000Z",
  };
  const binding = { athleteId: athleteA, provider: "strava" };

  const envelope = crypto.seal(credentials, binding);
  assert.equal(envelope.credentialKeyVersion, "v2");
  assert.deepEqual(crypto.open(envelope, binding), credentials);
  assert.doesNotMatch(JSON.stringify(envelope), /private-(access|refresh)-token/);

  const tamperedBytes = Buffer.from(envelope.credentialCiphertext, "base64url");
  tamperedBytes[0] ^= 0x01;
  const tampered = {
    ...envelope,
    credentialCiphertext: tamperedBytes.toString("base64url"),
  };
  assert.throws(() => crypto.open(tampered, binding), /authentication failed/);
  assert.throws(
    () => crypto.open(envelope, { ...binding, athleteId: athleteB }),
    /authentication failed/,
  );

  const wrongKey = new CredentialEnvelopeCrypto({
    activeKeyVersion: "v2",
    keys: { v2: randomBytes(32) },
  });
  assert.throws(() => wrongKey.open(envelope, binding), /authentication failed/);
});

test("raw object store enforces checksum, immutable replay, key prefix, and tenant access", async () => {
  const now = new Date("2026-08-10T10:00:00.000Z");
  const store = new InMemoryRawObjectStore({ now: () => now });
  const body = Buffer.from('{"id":123,"type":"Run"}', "utf8");
  const key = `${rawObjectKeyPrefix(athleteA, "strava")}activities/123.json`;
  const metadata = {
    athleteId: athleteA,
    provider: "strava",
    key,
    checksumSha256: sha256(body),
    contentType: "application/json",
    sizeBytes: body.byteLength,
    capturedAt: now.toISOString(),
  };

  assert.deepEqual(await store.put(scopeA, { metadata, body }), metadata);
  assert.deepEqual(await store.put(scopeA, { metadata, body }), metadata);
  assert.deepEqual(await store.head(scopeA, key), metadata);
  assert.deepEqual(Buffer.from(await store.readImmutableForReplay(scopeA, key)), body);
  assert.match(await store.createPresignedGet(scopeA, { key, expiresInSeconds: 60 }), /expires=1786356060$/);

  await assert.rejects(
    store.put(scopeA, {
      metadata: { ...metadata, checksumSha256: "0".repeat(64) },
      body,
    }),
    /checksum does not match/,
  );
  const changedBody = Buffer.from("changed", "utf8");
  await assert.rejects(
    store.put(scopeA, {
      metadata: {
        ...metadata,
        checksumSha256: sha256(changedBody),
        sizeBytes: changedBody.byteLength,
      },
      body: changedBody,
    }),
    /immutable/,
  );
  await assert.rejects(store.head(scopeB, key), /not authorized/);
  await assert.rejects(store.readImmutableForReplay(forgedScopeB, key), /not authorized/);
  await assert.rejects(
    store.put(scopeA, {
      metadata: { ...metadata, key: `${rawObjectKeyPrefix(athleteB, "strava")}activities/123.json` },
      body,
    }),
    /not authorized/,
  );
});

test("durable job queue is idempotent, athlete-scoped, and preserves retry and terminal states", async () => {
  let now = new Date("2026-08-10T10:00:00.000Z");
  const queue = new InMemoryDurableJobQueue({ now: () => now });
  const input = { provider: "strava", providerEventId: "event_123" };
  const queuedA = await queue.enqueue(scopeA, input);
  const duplicateA = await queue.enqueue(scopeA, input);
  const queuedB = await queue.enqueue(scopeB, input);

  assert.deepEqual(duplicateA, queuedA);
  assert.notEqual(queuedB.id, queuedA.id);
  const claimedA = await queue.claim(scopeA, "worker_001");
  assert.equal(claimedA.id, queuedA.id);
  assert.equal(claimedA.attempt, 1);
  await assert.rejects(queue.complete(scopeB, queuedA.id), /not authorized/);

  await queue.retry(scopeA, {
    jobId: queuedA.id,
    diagnosticCode: "STRAVA_TEMPORARY",
    retryAt: "2026-08-10T11:00:00.000Z",
  });
  assert.equal(await queue.claim(scopeA, "worker_001"), null);
  now = new Date("2026-08-10T11:00:01.000Z");
  const retriedA = await queue.claim(scopeA, "worker_002");
  assert.equal(retriedA.attempt, 2);
  await queue.complete(scopeA, retriedA.id);
  assert.equal((await queue.inspect(scopeA, retriedA.id)).status, "completed");
  assert.equal(await queue.claim(scopeA, "worker_003"), null);

  const claimedB = await queue.claim(scopeB, "worker_004");
  await queue.fail(scopeB, { jobId: claimedB.id, diagnosticCode: "INVALID_EVENT" });
  assert.equal((await queue.inspect(scopeB, claimedB.id)).status, "failed");
  assert.deepEqual(await queue.enqueue(scopeB, input), { ...claimedB, attempt: 1 });
  assert.equal(await queue.claim(scopeB, "worker_005"), null);
});

test("sync cursors and acknowledgements are independent for each athlete", async () => {
  const repository = new InMemorySyncRepository();
  const base = {
    entityType: "activity",
    entityRevision: 1,
    operation: "upsert",
    changedAt: "2026-08-10T10:00:00.000Z",
    payload: { distanceM: 5_000 },
  };
  const a1 = await repository.append(scopeA, { ...base, entityId: "activity_a1" });
  const a2 = await repository.append(scopeA, { ...base, entityId: "activity_a2" });
  const b1 = await repository.append(scopeB, { ...base, entityId: "activity_b1" });

  assert.equal(a1.cursor, "1");
  assert.equal(a2.cursor, "2");
  assert.equal(b1.cursor, "1");
  assert.deepEqual((await repository.listAfter(scopeA, { cursor: "1", limit: 10 })).map((item) => item.entityId), ["activity_a2"]);
  assert.deepEqual((await repository.listAfter(scopeB, { cursor: null, limit: 10 })).map((item) => item.entityId), ["activity_b1"]);

  await repository.acknowledge(scopeA, { deviceId: "device_shared_name", cursor: "2" });
  await repository.acknowledge(scopeB, { deviceId: "device_shared_name", cursor: "1" });
  assert.equal(await repository.acknowledgedCursor(scopeA, "device_shared_name"), "2");
  assert.equal(await repository.acknowledgedCursor(scopeB, "device_shared_name"), "1");
  await assert.rejects(
    repository.acknowledge(scopeA, { deviceId: "device_shared_name", cursor: "1" }),
    /cannot move backwards/,
  );
  await assert.rejects(
    repository.listAfter(scopeB, { cursor: "2", limit: 10 }),
    /not valid for this athlete/,
  );
  await assert.rejects(repository.listAfter(forgedScopeB, { cursor: null, limit: 10 }), /not authorized/);
});

test("Second Brain snapshots validate strict content, hashes, athlete scope, and immutable revisions", async () => {
  const repository = new InMemorySecondBrainSnapshotRepository();
  const snapshotA1 = makeSnapshot({ athleteId: athleteA, revision: 1, weeklyMinutesBudget: 300 });
  const snapshotB1 = makeSnapshot({ athleteId: athleteB, revision: 1, weeklyMinutesBudget: 240 });

  assert.equal((await repository.storeImmutable(scopeA, snapshotA1)).reused, false);
  assert.equal((await repository.storeImmutable(scopeA, snapshotA1)).reused, true);
  assert.equal((await repository.storeImmutable(scopeB, snapshotB1)).reused, false);
  assert.equal((await repository.latest(scopeA)).athleteId, athleteA);
  assert.equal((await repository.latest(scopeB)).athleteId, athleteB);
  await assert.rejects(repository.storeImmutable(scopeA, snapshotB1), /not authorized/);
  await assert.rejects(repository.latest(forgedScopeB), /not authorized/);

  await assert.rejects(
    repository.storeImmutable(scopeA, { ...snapshotA1, contentHash: "0".repeat(64) }),
    /content hash does not match/,
  );
  await assert.rejects(
    repository.storeImmutable(scopeA, { ...snapshotA1, unexpectedNote: "private text" }),
    /unrecognized key/i,
  );

  const conflictingA1 = makeSnapshot({ athleteId: athleteA, revision: 1, weeklyMinutesBudget: 301 });
  await assert.rejects(repository.storeImmutable(scopeA, conflictingA1), /revision conflicts/);

  const snapshotA2 = makeSnapshot({ athleteId: athleteA, revision: 2, weeklyMinutesBudget: 320 });
  assert.equal((await repository.storeImmutable(scopeA, snapshotA2)).reused, false);
  await assert.rejects(repository.storeImmutable(scopeA, conflictingA1), /revision is stale/);

  const duplicateContentA3 = makeSnapshot({ athleteId: athleteA, revision: 3, weeklyMinutesBudget: 320 });
  await assert.rejects(repository.storeImmutable(scopeA, duplicateContentA3), /content already exists/);
  const skippedA4 = makeSnapshot({ athleteId: athleteA, revision: 4, weeklyMinutesBudget: 340 });
  await assert.rejects(repository.storeImmutable(scopeA, skippedA4), /next monotonic revision/);
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function makeSnapshot({ athleteId, revision, weeklyMinutesBudget }) {
  const snapshot = {
    schemaVersion: "second-brain-context.v1",
    athleteId,
    revision,
    publishedAt: `2026-08-10T10:0${revision}:00.000Z`,
    contentHash: "0".repeat(64),
    selectedFields: ["availability"],
    context: { availability: { weeklyMinutesBudget } },
  };
  return {
    ...snapshot,
    contentHash: sha256(canonicalSecondBrainHashInput(snapshot)),
  };
}
