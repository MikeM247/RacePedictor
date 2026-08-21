import { createHash } from "node:crypto";
import { assertAthleteOwnership, assertAthleteScope, immutableCopy } from "./athlete-scope.js";

export class InMemoryWebhookReceiptRepository {
  #connectionsByProviderAthleteId = new Map();
  #events = new Map();
  #jobs = new Map();

  constructor({ connections = [] } = {}) {
    for (const connection of connections) this.addConnection(connection);
  }

  addConnection(connection) {
    assertConnection(connection);
    const existing = this.#connectionsByProviderAthleteId.get(connection.providerAthleteId);
    if (existing && existing.id !== connection.id) {
      throw new Error("Provider athlete connection is not unique");
    }
    this.#connectionsByProviderAthleteId.set(connection.providerAthleteId, immutableCopy(connection));
  }

  async resolveStravaConnection(providerAthleteId) {
    assertIdentifier(providerAthleteId, "Provider athlete id");
    const connection = this.#connectionsByProviderAthleteId.get(providerAthleteId);
    if (!connection || !["connected", "attention"].includes(connection.status)) return null;
    return immutableCopy(connection);
  }

  async persistAndEnqueue(scope, { connection, event, rawObject }) {
    const athleteId = assertAthleteScope(scope);
    assertAthleteOwnership(scope, connection.athleteId);
    if (rawObject.athleteId !== athleteId) throw new Error("Raw object is not authorized for the requested athlete");
    const resolved = this.#connectionsByProviderAthleteId.get(connection.providerAthleteId);
    if (!resolved || resolved.id !== connection.id || resolved.athleteId !== athleteId) {
      throw new Error("Provider connection is not authorized for the requested athlete");
    }
    assertEvent(event);

    const eventKey = `${athleteId}\u0000strava\u0000${event.providerEventKey}`;
    const existing = this.#events.get(eventKey);
    if (existing) {
      if (!sameReceipt(existing, connection, event, rawObject)) {
        throw new Error("Webhook event conflicts with its durable receipt");
      }
      return immutableCopy({ eventId: existing.id, jobId: existing.jobId, reused: true });
    }

    const eventId = stableId("event", eventKey);
    const jobId = stableId("job", eventKey);
    const record = immutableCopy({
      id: eventId,
      athleteId,
      connectionId: connection.id,
      providerEventKey: event.providerEventKey,
      payloadChecksumSha256: event.payloadChecksumSha256,
      event: event.event,
      occurredAt: event.occurredAt,
      rawObject,
      status: "queued",
      jobId,
    });
    this.#events.set(eventKey, record);
    this.#jobs.set(jobId, immutableCopy({
      id: jobId,
      athleteId,
      provider: "strava",
      providerEventId: event.providerEventKey,
      attempt: 0,
      status: "queued",
    }));
    return immutableCopy({ eventId, jobId, reused: false });
  }

  async inspectEvent(scope, providerEventKey) {
    const athleteId = assertAthleteScope(scope);
    const record = this.#events.get(`${athleteId}\u0000strava\u0000${providerEventKey}`);
    return record ? immutableCopy(record) : null;
  }

  async inspectJob(scope, jobId) {
    const record = this.#jobs.get(jobId);
    if (!record) return null;
    assertAthleteOwnership(scope, record.athleteId);
    return immutableCopy(record);
  }
}
function sameReceipt(existing, connection, event, rawObject) {
  return existing.connectionId === connection.id
    && existing.payloadChecksumSha256 === event.payloadChecksumSha256
    && existing.occurredAt === event.occurredAt
    && existing.rawObject.key === rawObject.key
    && existing.rawObject.checksumSha256 === rawObject.checksumSha256
    && existing.rawObject.sizeBytes === rawObject.sizeBytes
    && JSON.stringify(existing.event) === JSON.stringify(event.event);
}

function stableId(prefix, key) {
  return `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function assertConnection(connection) {
  if (!connection || !["connected", "attention", "revoked", "disconnected"].includes(connection.status)) {
    throw new Error("Provider connection is invalid");
  }
  assertIdentifier(connection.id, "Provider connection id");
  assertIdentifier(connection.athleteId, "Athlete id");
  assertIdentifier(connection.providerAthleteId, "Provider athlete id");
}

function assertEvent(event) {
  if (!event || !/^[a-f0-9]{64}$/.test(event.providerEventKey)) throw new Error("Provider event key is invalid");
  if (!/^[a-f0-9]{64}$/.test(event.payloadChecksumSha256)) throw new Error("Provider event checksum is invalid");
  if (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt))) {
    throw new Error("Provider event time is invalid");
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) throw new Error(`${label} is invalid`);
}
