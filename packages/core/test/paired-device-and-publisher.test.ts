import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext, type AthleteScope } from "../src/contracts/auth.ts";
import type { PairedDevice } from "../src/contracts/sync.ts";
import type { PairedDeviceCredential, PairedDeviceRepository } from "../src/ports/cloud-sync.ts";
import { buildSelectedSecondBrainSnapshot } from "../src/services/second-brain-publisher.ts";
import { PairedDeviceError, PairedDeviceService } from "../src/use-cases/paired-device.ts";

const now = new Date("2026-08-10T12:00:00.000Z");
const scope = athleteScopeFor(buildActorContext({
  userId: "owner-a",
  permittedAthleteIds: ["athlete-a"],
  activeAthleteId: "athlete-a",
  requestId: "request-a",
  credentialKind: "session",
}));

test("device enrollment returns a one-time credential and authenticates only its athlete", async () => {
  const repository = new FakePairedDeviceRepository();
  const service = deviceService(repository);
  const enrolled = await service.enroll(scope, { athleteId: "athlete-a", displayName: "Home computer", enrollmentId: "enroll-1" });
  assert.match(enrolled.deviceToken, /^rpd1\.device_/u);
  assert.equal(enrolled.device.status, "active");
  assert.equal(JSON.stringify(enrolled.device).includes("deviceToken"), false);
  const authenticated = await service.authenticate(enrolled.deviceToken, "device-request");
  assert.equal(authenticated.actor.credentialKind, "device");
  assert.deepEqual(authenticated.actor.permittedAthleteIds, ["athlete-a"]);
  assert.equal(authenticated.device.athleteId, "athlete-a");
});

test("enrollment replay never reveals the credential and re-pair revokes the prior device", async () => {
  const repository = new FakePairedDeviceRepository();
  const service = deviceService(repository);
  const first = await service.enroll(scope, { athleteId: "athlete-a", displayName: "Home computer", enrollmentId: "enroll-1" });
  await assert.rejects(
    service.enroll(scope, { athleteId: "athlete-a", displayName: "Home computer", enrollmentId: "enroll-1" }),
    (error: unknown) => error instanceof PairedDeviceError && error.code === "ENROLLMENT_REPLAYED",
  );
  const second = await service.enroll(scope, { athleteId: "athlete-a", displayName: "Replacement", enrollmentId: "enroll-2" });
  await assert.rejects(() => service.authenticate(first.deviceToken, "old-request"), /Device authentication failed/u);
  assert.equal((await service.authenticate(second.deviceToken, "new-request")).device.displayName, "Replacement");
});

test("invalid and revoked device credentials are non-disclosing", async () => {
  const repository = new FakePairedDeviceRepository();
  const service = deviceService(repository);
  const enrolled = await service.enroll(scope, { athleteId: "athlete-a", displayName: "Home computer", enrollmentId: "enroll-1" });
  const invalid = service.authenticate("rpd1.device_unknown.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "invalid");
  await assert.rejects(invalid, (error: unknown) => error instanceof PairedDeviceError && error.code === "INVALID_DEVICE_CREDENTIAL");
  await service.revoke(scope, enrolled.device.id);
  const revoked = service.authenticate(enrolled.deviceToken, "revoked");
  await assert.rejects(revoked, (error: unknown) => error instanceof PairedDeviceError && error.code === "INVALID_DEVICE_CREDENTIAL");
});

test("selected Second Brain publisher includes exactly requested structured sections", () => {
  const snapshot = buildSelectedSecondBrainSnapshot({
    athleteId: "athlete-a",
    revision: 1,
    publishedAt: now.toISOString(),
    selectedFields: ["availability", "wellbeingCheckIns"],
    sourceContext: {
      availability: { availableWeekdays: ["monday", "wednesday"] },
      trainingPreferences: { maxSessionsPerWeek: 4 },
      wellbeingCheckIns: [{ recordedOn: "2026-08-10", energy: 4, fatigue: 2, soreness: 0, sleepQuality: 4, stress: 2 }],
    },
  });
  assert.deepEqual(snapshot.selectedFields, ["availability", "wellbeingCheckIns"]);
  assert.deepEqual(Object.keys(snapshot.context), ["availability", "wellbeingCheckIns"]);
  assert.equal("trainingPreferences" in snapshot.context, false);
  assert.doesNotMatch(JSON.stringify(snapshot), /vault|relativePath|markdown|attachment|token/u);
});

test("selected publisher rejects missing, unknown, and path-bearing source fields", () => {
  const base = { athleteId: "athlete-a", revision: 1, publishedAt: now.toISOString() };
  assert.throws(() => buildSelectedSecondBrainSnapshot({ ...base, selectedFields: ["constraints"], sourceContext: { availability: { weeklyMinutesBudget: 120 } } }));
  assert.throws(() => buildSelectedSecondBrainSnapshot({ ...base, selectedFields: ["availability"], sourceContext: { availability: { weeklyMinutesBudget: 120, vaultPath: "C:/private" } } }));
});

function deviceService(repository: PairedDeviceRepository) {
  let id = 0;
  return new PairedDeviceService({
    repository,
    now: () => now,
    randomId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    randomSecret: () => "abcdefghijklmnopqrstuvwxyzABCDEFGH12345678",
  });
}

class FakePairedDeviceRepository implements PairedDeviceRepository {
  readonly devices = new Map<string, PairedDeviceCredential>();
  readonly enrollmentHashes = new Set<string>();

  async enroll(scope: AthleteScope, input: { id: string; displayName: string; deviceKeyHash: string; enrollmentKeyHash: string; occurredAt: string }) {
    if (this.enrollmentHashes.has(input.enrollmentKeyHash)) {
      return { device: [...this.devices.values()][0].device, replayed: true };
    }
    this.enrollmentHashes.add(input.enrollmentKeyHash);
    for (const [id, credential] of this.devices) {
      if (credential.device.athleteId === scope.athleteId && credential.device.status === "active") {
        this.devices.set(id, { ...credential, device: { ...credential.device, status: "revoked", revokedAt: input.occurredAt } });
      }
    }
    const device: PairedDevice = {
      id: input.id, athleteId: scope.athleteId, displayName: input.displayName, status: "active",
      lastAcknowledgedCursor: null, lastSeenAt: null, createdAt: input.occurredAt, revokedAt: null,
    };
    this.devices.set(device.id, { device, deviceKeyHash: input.deviceKeyHash });
    return { device, replayed: false };
  }

  async list(scope: AthleteScope) { return [...this.devices.values()].map((value) => value.device).filter((device) => device.athleteId === scope.athleteId); }
  async findCredential(deviceId: string) { return this.devices.get(deviceId) ?? null; }
  async acknowledge(scope: AthleteScope, input: { deviceId: string; cursor: string; occurredAt: string }) {
    const credential = this.devices.get(input.deviceId)!;
    const device = { ...credential.device, lastAcknowledgedCursor: input.cursor, lastSeenAt: input.occurredAt };
    this.devices.set(input.deviceId, { ...credential, device });
    return device;
  }
  async recordFailure(scope: AthleteScope, input: { deviceId: string; diagnosticCode: string; occurredAt: string }) {
    const credential = this.devices.get(input.deviceId);
    if (!credential || credential.device.athleteId !== scope.athleteId || credential.device.status !== "active") {
      throw new Error("unavailable");
    }
    const device = { ...credential.device, lastSeenAt: input.occurredAt };
    this.devices.set(input.deviceId, { ...credential, device });
    return device;
  }
  async revoke(scope: AthleteScope, input: { deviceId: string; occurredAt: string }) {
    const credential = this.devices.get(input.deviceId);
    if (!credential || credential.device.athleteId !== scope.athleteId) return null;
    const device = { ...credential.device, status: "revoked" as const, revokedAt: input.occurredAt };
    this.devices.set(input.deviceId, { ...credential, device });
    return device;
  }
}
