import { assertAthleteOwnership, assertAthleteScope, immutableCopy } from "./athlete-scope.js";

export class PrismaWebhookReceiptRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma || typeof prisma.$transaction !== "function") throw new Error("Prisma client is required");
    this.#prisma = prisma;
  }

  async resolveStravaConnection(providerAthleteId) {
    assertIdentifier(providerAthleteId, "Provider athlete id");
    const connection = await this.#prisma.providerConnection.findUnique({
      where: {
        provider_providerAthleteId: { provider: "strava", providerAthleteId },
      },
      select: {
        id: true,
        athleteId: true,
        providerAthleteId: true,
        status: true,
      },
    });
    if (!connection || !["connected", "attention"].includes(connection.status)) return null;
    return immutableCopy(connection);
  }

  async persistAndEnqueue(scope, { connection, event, rawObject }) {
    const athleteId = assertAthleteScope(scope);
    assertAthleteOwnership(scope, connection.athleteId);
    if (rawObject.athleteId !== athleteId) throw new Error("Raw object is not authorized for the requested athlete");
    assertEvent(event);

    return this.#prisma.$transaction(async (transaction) => {
      const currentConnection = await transaction.providerConnection.findUnique({
        where: { id_athleteId: { id: connection.id, athleteId } },
        select: { id: true, athleteId: true, provider: true, providerAthleteId: true, status: true },
      });
      if (
        !currentConnection
        || currentConnection.provider !== "strava"
        || currentConnection.providerAthleteId !== connection.providerAthleteId
        || !["connected", "attention"].includes(currentConnection.status)
      ) {
        throw new Error("Provider connection is not authorized for the requested athlete");
      }

      const rawUnique = {
        athleteId,
        provider: "strava",
        kind: "webhook_event",
        providerObjectId: event.providerEventKey,
        objectVersion: 1,
      };
      const rawRecord = await transaction.rawObject.upsert({
        where: { athleteId_provider_kind_providerObjectId_objectVersion: rawUnique },
        create: {
          ...rawUnique,
          providerConnectionId: currentConnection.id,
          storageProvider: "r2",
          storageKey: rawObject.key,
          checksumSha256: rawObject.checksumSha256,
          contentType: rawObject.contentType,
          byteSize: rawObject.sizeBytes,
        },
        update: {},
        select: {
          id: true,
          athleteId: true,
          providerConnectionId: true,
          storageProvider: true,
          storageKey: true,
          checksumSha256: true,
          contentType: true,
          byteSize: true,
        },
      });
      assertPersistedRawObject(rawRecord, currentConnection.id, rawObject);

      const eventWhere = {
        athleteId_provider_providerEventKey: {
          athleteId,
          provider: "strava",
          providerEventKey: event.providerEventKey,
        },
      };
      const existingEvent = await transaction.providerWebhookEvent.findUnique({
        where: eventWhere,
        select: {
          id: true,
          providerConnectionId: true,
          objectType: true,
          providerObjectId: true,
          aspectType: true,
          eventOccurredAt: true,
        },
      });
      const webhookEvent = await transaction.providerWebhookEvent.upsert({
        where: eventWhere,
        create: {
          athleteId,
          providerConnectionId: currentConnection.id,
          provider: "strava",
          providerEventKey: event.providerEventKey,
          objectType: event.event.object_type,
          providerObjectId: String(event.event.object_id),
          aspectType: event.event.aspect_type,
          eventOccurredAt: new Date(event.occurredAt),
          status: "queued",
        },
        update: {},
        select: {
          id: true,
          providerConnectionId: true,
          objectType: true,
          providerObjectId: true,
          aspectType: true,
          eventOccurredAt: true,
        },
      });
      assertPersistedEvent(webhookEvent, currentConnection.id, event);

      const idempotencyKey = `strava:webhook:${event.providerEventKey}`;
      const job = await transaction.ingestionJob.upsert({
        where: { athleteId_idempotencyKey: { athleteId, idempotencyKey } },
        create: {
          athleteId,
          providerConnectionId: currentConnection.id,
          webhookEventId: webhookEvent.id,
          idempotencyKey,
          kind: "webhook",
          status: "queued",
        },
        update: {},
        select: {
          id: true,
          providerConnectionId: true,
          webhookEventId: true,
          idempotencyKey: true,
        },
      });
      if (
        job.providerConnectionId !== currentConnection.id
        || job.webhookEventId !== webhookEvent.id
        || job.idempotencyKey !== idempotencyKey
      ) {
        throw new Error("Ingestion job conflicts with its webhook receipt");
      }

      return immutableCopy({ eventId: webhookEvent.id, jobId: job.id, reused: Boolean(existingEvent) });
    });
  }
}

function assertPersistedRawObject(record, providerConnectionId, expected) {
  if (
    record.athleteId !== expected.athleteId
    || record.providerConnectionId !== providerConnectionId
    || record.storageProvider !== "r2"
    || record.storageKey !== expected.key
    || record.checksumSha256 !== expected.checksumSha256
    || record.contentType !== expected.contentType
    || record.byteSize !== expected.sizeBytes
  ) {
    throw new Error("Raw object metadata conflicts with its immutable receipt");
  }
}

function assertPersistedEvent(record, providerConnectionId, expected) {
  if (
    record.providerConnectionId !== providerConnectionId
    || record.objectType !== expected.event.object_type
    || record.providerObjectId !== String(expected.event.object_id)
    || record.aspectType !== expected.event.aspect_type
    || new Date(record.eventOccurredAt).toISOString() !== expected.occurredAt
  ) {
    throw new Error("Webhook event conflicts with its durable receipt");
  }
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
