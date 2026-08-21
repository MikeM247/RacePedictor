import { pairedDeviceSchema } from "../../../core/src/contracts/sync.ts";
import { assertAthleteScope } from "./athlete-scope.js";

export class PrismaPairedDeviceRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.pairedDevice || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma paired-device client is required");
    }
    this.#prisma = prisma;
  }

  async enroll(scope, input) {
    const athleteId = assertAthleteScope(scope);
    return this.#prisma.$transaction(async (transaction) => {
      const existing = await transaction.pairedDevice.findUnique({
        where: { athleteId_enrollmentKeyHash: { athleteId, enrollmentKeyHash: input.enrollmentKeyHash } },
      });
      if (existing) return { device: toDevice(existing), replayed: true };
      const occurredAt = validDate(input.occurredAt);
      await transaction.pairedDevice.updateMany({
        where: { athleteId, status: "active" },
        data: { status: "revoked", revokedAt: occurredAt },
      });
      const row = await transaction.pairedDevice.create({
        data: {
          id: input.id,
          athleteId,
          pairedByUserId: scope.actor.userId,
          name: input.displayName,
          deviceKeyHash: input.deviceKeyHash,
          enrollmentKeyHash: input.enrollmentKeyHash,
          status: "active",
          createdAt: occurredAt,
        },
      });
      return { device: toDevice(row), replayed: false };
    });
  }

  async list(scope) {
    const athleteId = assertAthleteScope(scope);
    const rows = await this.#prisma.pairedDevice.findMany({
      where: { athleteId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    });
    return rows.map(toDevice);
  }

  async findCredential(deviceId) {
    if (typeof deviceId !== "string" || !/^device_[A-Za-z0-9]+$/u.test(deviceId)) return null;
    const row = await this.#prisma.pairedDevice.findUnique({ where: { id: deviceId } });
    return row ? { device: toDevice(row), deviceKeyHash: row.deviceKeyHash } : null;
  }

  async acknowledge(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const cursor = parseCursor(input.cursor);
    const occurredAt = validDate(input.occurredAt);
    return this.#prisma.$transaction(async (transaction) => {
      const existing = await transaction.pairedDevice.findUnique({
        where: { id_athleteId: { id: input.deviceId, athleteId } },
      });
      if (!existing || existing.status !== "active") throw new Error("Paired device is unavailable");
      if (existing.lastPullCursor !== null && cursor < existing.lastPullCursor) {
        throw new Error("Device cursor cannot move backwards");
      }
      const row = await transaction.pairedDevice.update({
        where: { id_athleteId: { id: input.deviceId, athleteId } },
        data: { lastPullCursor: cursor, lastSeenAt: occurredAt, lastErrorCode: null },
      });
      return toDevice(row);
    });
  }

  async revoke(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const existing = await this.#prisma.pairedDevice.findUnique({
      where: { id_athleteId: { id: input.deviceId, athleteId } },
    });
    if (!existing) return null;
    if (existing.status === "revoked") return toDevice(existing);
    const row = await this.#prisma.pairedDevice.update({
      where: { id_athleteId: { id: input.deviceId, athleteId } },
      data: { status: "revoked", revokedAt: validDate(input.occurredAt) },
    });
    return toDevice(row);
  }

  async recordFailure(scope, input) {
    const athleteId = assertAthleteScope(scope);
    if (typeof input.diagnosticCode !== "string" || !/^[A-Z][A-Z0-9_]{2,79}$/u.test(input.diagnosticCode)) {
      throw new Error("Device diagnostic code is invalid");
    }
    const existing = await this.#prisma.pairedDevice.findUnique({
      where: { id_athleteId: { id: input.deviceId, athleteId } },
    });
    if (!existing || existing.status !== "active") throw new Error("Paired device is unavailable");
    const row = await this.#prisma.pairedDevice.update({
      where: { id_athleteId: { id: input.deviceId, athleteId } },
      data: { lastErrorCode: input.diagnosticCode, lastSeenAt: validDate(input.occurredAt) },
    });
    return toDevice(row);
  }
}

function toDevice(row) {
  return pairedDeviceSchema.parse({
    id: row.id,
    athleteId: row.athleteId,
    displayName: row.name,
    status: row.status,
    lastAcknowledgedCursor: row.lastPullCursor === null ? null : row.lastPullCursor.toString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  });
}

function validDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Paired device time is invalid");
  return date;
}

function parseCursor(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) throw new Error("Device cursor is invalid");
  return BigInt(value);
}
