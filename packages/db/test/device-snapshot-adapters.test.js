import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import { buildSelectedSecondBrainSnapshot } from "../../core/src/services/second-brain-publisher.ts";
import {
  PrismaPairedDeviceRepository,
  PrismaSecondBrainSnapshotRepository,
  SecondBrainSnapshotConflictError,
} from "../src/cloud/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const scopeA = scope("athlete-a", "owner-a");
const scopeB = scope("athlete-b", "owner-b");

test("Prisma paired device enrollment is one-time, revokes the predecessor, and fences cursors", async () => {
  const prisma = fakePrisma();
  const repository = new PrismaPairedDeviceRepository({ prisma });
  const first = await repository.enroll(scopeA, enrollment("device_first", "hash-enroll-1"));
  assert.equal(first.replayed, false);
  assert.equal(first.device.status, "active");
  const replay = await repository.enroll(scopeA, enrollment("device_replay", "hash-enroll-1"));
  assert.equal(replay.replayed, true);
  assert.equal(replay.device.id, "device_first");
  const second = await repository.enroll(scopeA, enrollment("device_second", "hash-enroll-2"));
  assert.equal(second.device.status, "active");
  assert.equal((await repository.findCredential("device_first")).device.status, "revoked");
  assert.equal(await repository.findCredential("device_unknown"), null);

  const acknowledged = await repository.acknowledge(scopeA, { deviceId: "device_second", cursor: "7", occurredAt: NOW });
  assert.equal(acknowledged.lastAcknowledgedCursor, "7");
  await assert.rejects(repository.acknowledge(scopeA, { deviceId: "device_second", cursor: "6", occurredAt: NOW }), /cannot move backwards/u);
  await assert.rejects(repository.acknowledge(scopeB, { deviceId: "device_second", cursor: "8", occurredAt: NOW }), /unavailable/u);
});

test("Prisma device revocation is athlete-scoped and leaves provider state untouched", async () => {
  const prisma = fakePrisma();
  const repository = new PrismaPairedDeviceRepository({ prisma });
  await repository.enroll(scopeA, enrollment("device_first", "hash-enroll-1"));
  assert.equal(await repository.revoke(scopeB, { deviceId: "device_first", occurredAt: NOW }), null);
  const revoked = await repository.revoke(scopeA, { deviceId: "device_first", occurredAt: NOW });
  assert.equal(revoked.status, "revoked");
  assert.equal(prisma.providerConnectionTouched, false);
});

test("Prisma snapshots are immutable, monotonic, idempotent, and remain readable after revocation", async () => {
  const prisma = fakePrisma();
  const devices = new PrismaPairedDeviceRepository({ prisma });
  const snapshots = new PrismaSecondBrainSnapshotRepository({ prisma });
  await devices.enroll(scopeA, enrollment("device_first", "hash-enroll-1"));
  const first = snapshot(1, { availability: { weeklyMinutesBudget: 240 } }, ["availability"]);
  assert.equal((await snapshots.storeImmutable(scopeA, first, "device_first")).reused, false);
  assert.equal((await snapshots.storeImmutable(scopeA, first, "device_first")).reused, true);
  const conflict = { ...first, contentHash: "f".repeat(64) };
  await assert.rejects(snapshots.storeImmutable(scopeA, conflict, "device_first"));
  const gap = snapshot(3, { availability: { weeklyMinutesBudget: 300 } }, ["availability"]);
  await assert.rejects(
    snapshots.storeImmutable(scopeA, gap, "device_first"),
    (error) => error instanceof SecondBrainSnapshotConflictError && error.code === "REVISION_GAP",
  );
  await devices.revoke(scopeA, { deviceId: "device_first", occurredAt: NOW });
  assert.deepEqual(await snapshots.latest(scopeA), first);
  await assert.rejects(snapshots.storeImmutable(scopeA, snapshot(2, { availability: { weeklyMinutesBudget: 260 } }, ["availability"]), "device_first"), /unavailable/u);
  assert.equal(await snapshots.latest(scopeB), null);
});

function scope(athleteId, userId) {
  return athleteScopeFor(buildActorContext({ userId, permittedAthleteIds: [athleteId], activeAthleteId: athleteId, requestId: `request-${athleteId}`, credentialKind: "session" }));
}
function enrollment(id, enrollmentKeyHash) {
  return { id, displayName: id, deviceKeyHash: `${id}-credential-hash`, enrollmentKeyHash, occurredAt: NOW };
}

function snapshot(revision, sourceContext, selectedFields) {
  return buildSelectedSecondBrainSnapshot({ athleteId: "athlete-a", revision, publishedAt: NOW, selectedFields, sourceContext });
}

function fakePrisma() {
  const devices = new Map();
  const snapshots = [];
  const pairedDevice = {
    findUnique: async ({ where }) => {
      if (where.id) return devices.get(where.id) ?? null;
      if (where.id_athleteId) {
        const row = devices.get(where.id_athleteId.id);
        return row?.athleteId === where.id_athleteId.athleteId ? row : null;
      }
      if (where.athleteId_enrollmentKeyHash) return [...devices.values()].find((row) => row.athleteId === where.athleteId_enrollmentKeyHash.athleteId && row.enrollmentKeyHash === where.athleteId_enrollmentKeyHash.enrollmentKeyHash) ?? null;
      return null;
    },
    findMany: async ({ where, take }) => [...devices.values()].filter((row) => row.athleteId === where.athleteId).slice(0, take),
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const [id, row] of devices) if (row.athleteId === where.athleteId && row.status === where.status) { devices.set(id, { ...row, ...data }); count += 1; }
      return { count };
    },
    create: async ({ data }) => {
      const row = { ...data, lastPullCursor: null, lastPushRevision: null, lastSeenAt: null, lastErrorCode: null, revokedAt: null, publicKey: null };
      devices.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const id = where.id_athleteId.id;
      const row = { ...devices.get(id), ...data };
      devices.set(id, row);
      return row;
    },
  };
  const secondBrainSnapshot = {
    findUnique: async ({ where }) => {
      if (where.athleteId_sourceRevision) return snapshots.find((row) => row.athleteId === where.athleteId_sourceRevision.athleteId && row.sourceRevision === where.athleteId_sourceRevision.sourceRevision) ?? null;
      if (where.athleteId_contentHash) return snapshots.find((row) => row.athleteId === where.athleteId_contentHash.athleteId && row.contentHash === where.athleteId_contentHash.contentHash) ?? null;
      return null;
    },
    findFirst: async ({ where }) => snapshots.filter((row) => row.athleteId === where.athleteId).sort((a, b) => b.sourceRevision - a.sourceRevision)[0] ?? null,
    create: async ({ data }) => {
      const row = { ...data, createdAt: new Date(NOW) };
      snapshots.push(row);
      return row;
    },
  };
  return {
    pairedDevice,
    secondBrainSnapshot,
    providerConnectionTouched: false,
    $transaction: async (operation) => operation({ pairedDevice, secondBrainSnapshot }),
  };
}
