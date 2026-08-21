import assert from "node:assert/strict";
import test from "node:test";
import { buildActorContext, athleteScopeFor } from "../../../packages/core/src/contracts/auth.ts";
import { buildSelectedSecondBrainSnapshot } from "../../../packages/core/src/services/second-brain-publisher.ts";
import { PairedDeviceError } from "../../../packages/core/src/use-cases/paired-device.ts";
import { createSyntheticTestActor } from "../lib/server/auth.ts";
import { createDeviceRouteWrapper } from "../lib/server/device-route-security.ts";
import {
  handleDeviceAcknowledge,
  handleDeviceChanges,
  handleEnrollDevice,
  handleListDevices,
  handlePublishSecondBrainSnapshot,
  handleRevokeDevice,
  type DeviceSyncComposition,
} from "../lib/server/device-sync-handlers.ts";

const athleteId = "athlete-a";
const actor = createSyntheticTestActor("owner-a", [athleteId]);
const ownerSecurity = { mode: "authenticated" as const, actor };
const device = {
  id: "device_local123", athleteId, displayName: "Home PC", status: "active" as const,
  lastAcknowledgedCursor: null, lastSeenAt: null,
  createdAt: "2026-08-10T08:00:00.000Z", revokedAt: null,
};
const deviceActor = buildActorContext({
  userId: `device:${device.id}`,
  permittedAthleteIds: [athleteId],
  activeAthleteId: athleteId,
  requestId: "request-device",
  credentialKind: "device",
});

test("device route authentication is non-disclosing and forwards only the authenticated device scope", async () => {
  let tokenSeen: string | null | undefined;
  const wrapper = createDeviceRouteWrapper({
    requestId: () => "request-device",
    getAuthenticator: () => ({
      authenticate: async (token) => {
        tokenSeen = token;
        if (token !== "rpd1.device_local123.secret_secret_secret_secret_123") {
          throw new PairedDeviceError("INVALID_DEVICE_CREDENTIAL", "private detail");
        }
        return { actor: deviceActor, device };
      },
    }),
  });
  const handler = wrapper((security) => Response.json({ athleteId: security.actor.activeAthleteId }));
  const denied = await handler(new Request("http://localhost/api/v1/sync/device/changes", {
    headers: { authorization: "Bearer wrong" },
  }));
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: { code: "UNAUTHENTICATED", message: "Device authentication failed", details: [] } });

  const allowed = await handler(new Request("http://localhost/api/v1/sync/device/changes", {
    headers: { authorization: "Bearer rpd1.device_local123.secret_secret_secret_secret_123" },
  }));
  assert.equal(tokenSeen, "rpd1.device_local123.secret_secret_secret_secret_123");
  assert.deepEqual(await allowed.json(), { athleteId });
});

test("owner pair/list/revoke handlers are athlete-scoped and return a device token only at enrollment", async () => {
  const scopes: string[] = [];
  const composition = {
    deviceService: {
      list: async (scope: ReturnType<typeof athleteScopeFor>) => { scopes.push(scope.athleteId); return [device]; },
      enroll: async (scope: ReturnType<typeof athleteScopeFor>) => {
        scopes.push(scope.athleteId);
        return { device, deviceToken: "rpd1.device_local123.one-time-secret-value" };
      },
      revoke: async (scope: ReturnType<typeof athleteScopeFor>, deviceId: string) => {
        scopes.push(scope.athleteId);
        assert.equal(deviceId, device.id);
        return { ...device, status: "revoked" as const, revokedAt: "2026-08-10T09:00:00.000Z" };
      },
    },
  } as unknown as DeviceSyncComposition;
  const getComposition = () => composition;
  const listed = await handleListDevices(ownerSecurity, new Request("http://localhost"), getComposition);
  const enrolled = await handleEnrollDevice(ownerSecurity, new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ athleteId, displayName: "Home PC", enrollmentId: "enroll-1" }),
  }), getComposition);
  const revoked = await handleRevokeDevice(ownerSecurity, device.id, getComposition);
  assert.equal(listed.status, 200);
  assert.equal(enrolled.status, 201);
  assert.equal((await enrolled.json()).data.deviceToken, "rpd1.device_local123.one-time-secret-value");
  assert.equal((await revoked.json()).data.device.status, "revoked");
  assert.deepEqual(scopes, [athleteId, athleteId, athleteId]);
});

test("device changes, acknowledgement, and selected context publication stay in the credential athlete scope", async () => {
  const scopes: string[] = [];
  const snapshot = buildSelectedSecondBrainSnapshot({
    athleteId,
    revision: 1,
    publishedAt: "2026-08-10T08:30:00.000Z",
    selectedFields: ["availability"],
    sourceContext: { availability: { weeklyMinutesBudget: 300 } },
  });
  const composition = {
    changes: { list: async (scope: ReturnType<typeof athleteScopeFor>) => {
      scopes.push(scope.athleteId);
      return { changes: [], nextCursor: null, hasMore: false };
    } },
    usage: { recordBandwidth: async () => undefined },
    deviceService: { acknowledge: async (scope: ReturnType<typeof athleteScopeFor>, id: string, cursor: string) => {
      scopes.push(scope.athleteId);
      assert.equal(id, device.id);
      assert.equal(cursor, "9");
      return { ...device, lastAcknowledgedCursor: cursor };
    } },
    snapshots: { storeImmutable: async (scope: ReturnType<typeof athleteScopeFor>, value: unknown, id: string) => {
      scopes.push(scope.athleteId);
      assert.deepEqual(value, snapshot);
      assert.equal(id, device.id);
      return { snapshot, reused: false };
    } },
  } as unknown as DeviceSyncComposition;
  const getComposition = () => composition;
  const security = { actor: deviceActor, device };
  const changes = await handleDeviceChanges(security, new Request("http://localhost/api/v1/sync/device/changes?limit=100"), getComposition);
  const acknowledged = await handleDeviceAcknowledge(security, new Request("http://localhost", {
    method: "POST", body: JSON.stringify({ cursor: "9" }),
  }), getComposition);
  const published = await handlePublishSecondBrainSnapshot(security, new Request("http://localhost", {
    method: "POST", body: JSON.stringify(snapshot),
  }), getComposition);
  assert.equal(changes.status, 200);
  assert.equal((await acknowledged.json()).data.device.lastAcknowledgedCursor, "9");
  assert.equal(published.status, 201);
  assert.deepEqual(scopes, [athleteId, athleteId, athleteId]);
});

test("selected context endpoint rejects unapproved free text before persistence", async () => {
  let writes = 0;
  const composition = {
    snapshots: { storeImmutable: async () => { writes += 1; throw new Error("unexpected"); } },
  } as unknown as DeviceSyncComposition;
  const response = await assert.rejects(
    () => handlePublishSecondBrainSnapshot(
      { actor: deviceActor, device },
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...device, notes: "private" }) }),
      () => composition,
    ),
    (error: unknown) => error instanceof Error && "status" in error && error.status === 400,
  );
  assert.equal(response, undefined);
  assert.equal(writes, 0);
});
