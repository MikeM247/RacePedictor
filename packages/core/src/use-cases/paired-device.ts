import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { buildActorContext, type ActorContext, type AthleteScope } from "../contracts/auth.ts";
import { registerPairedDeviceRequestSchema, type PairedDevice } from "../contracts/sync.ts";
import type { PairedDeviceRepository } from "../ports/cloud-sync.ts";

const TOKEN_PREFIX = "rpd1";
const DUMMY_HASH = "0".repeat(64);

export class PairedDeviceError extends Error {
  readonly code: "INVALID_DEVICE_CREDENTIAL" | "ENROLLMENT_REPLAYED" | "DEVICE_NOT_FOUND" | "DEVICE_REVOKED";

  constructor(code: PairedDeviceError["code"], message: string) {
    super(message);
    this.name = "PairedDeviceError";
    this.code = code;
  }
}

export type AuthenticatedDevice = Readonly<{ actor: ActorContext; device: PairedDevice }>;

export class PairedDeviceService {
  readonly #repository: PairedDeviceRepository;
  readonly #now: () => Date;
  readonly #randomId: () => string;
  readonly #randomSecret: () => string;

  constructor(input: {
    repository: PairedDeviceRepository;
    now?: () => Date;
    randomId?: () => string;
    randomSecret?: () => string;
  }) {
    this.#repository = input.repository;
    this.#now = input.now ?? (() => new Date());
    this.#randomId = input.randomId ?? randomUUID;
    this.#randomSecret = input.randomSecret ?? (() => randomBytes(32).toString("base64url"));
  }

  async enroll(scope: AthleteScope, request: unknown) {
    const parsed = registerPairedDeviceRequestSchema.parse(request);
    if (parsed.athleteId !== scope.athleteId) throw new PairedDeviceError("DEVICE_NOT_FOUND", "Device enrollment is unavailable");
    const deviceId = `device_${this.#randomId().replaceAll("-", "")}`;
    const token = `${TOKEN_PREFIX}.${deviceId}.${this.#randomSecret()}`;
    const result = await this.#repository.enroll(scope, {
      id: deviceId,
      displayName: parsed.displayName,
      deviceKeyHash: sha256(token),
      enrollmentKeyHash: sha256(`${scope.actor.userId}:${scope.athleteId}:${parsed.enrollmentId}`),
      occurredAt: this.#now().toISOString(),
    });
    if (result.replayed) {
      throw new PairedDeviceError("ENROLLMENT_REPLAYED", "This device enrollment was already used");
    }
    return { device: result.device, deviceToken: token };
  }

  async authenticate(token: string | null | undefined, requestId: string): Promise<AuthenticatedDevice> {
    const parsed = parseToken(token);
    const credential = parsed ? await this.#repository.findCredential(parsed.deviceId) : null;
    const actualHash = sha256(token ?? "");
    const expectedHash = credential?.deviceKeyHash ?? DUMMY_HASH;
    const valid = safeHashEqual(actualHash, expectedHash);
    if (!parsed || !credential || !valid || credential.device.status !== "active") {
      throw new PairedDeviceError("INVALID_DEVICE_CREDENTIAL", "Device authentication failed");
    }
    const device = credential.device;
    return {
      device,
      actor: buildActorContext({
        userId: `device:${device.id}`,
        permittedAthleteIds: [device.athleteId],
        activeAthleteId: device.athleteId,
        requestId,
        credentialKind: "device",
      }),
    };
  }

  list(scope: AthleteScope) {
    return this.#repository.list(scope);
  }

  async acknowledge(scope: AthleteScope, deviceId: string, cursor: string) {
    return this.#repository.acknowledge(scope, {
      deviceId,
      cursor,
      occurredAt: this.#now().toISOString(),
    });
  }

  async revoke(scope: AthleteScope, deviceId: string) {
    const device = await this.#repository.revoke(scope, { deviceId, occurredAt: this.#now().toISOString() });
    if (!device) throw new PairedDeviceError("DEVICE_NOT_FOUND", "Paired device was not found");
    return device;
  }

  recordFailure(scope: AthleteScope, deviceId: string, diagnosticCode: string) {
    return this.#repository.recordFailure(scope, {
      deviceId,
      diagnosticCode,
      occurredAt: this.#now().toISOString(),
    });
  }
}

function parseToken(token: string | null | undefined) {
  if (typeof token !== "string" || token.length > 512) return null;
  const match = /^rpd1\.(device_[A-Za-z0-9]+)\.([A-Za-z0-9_-]{32,128})$/u.exec(token);
  return match ? { deviceId: match[1] } : null;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeHashEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
