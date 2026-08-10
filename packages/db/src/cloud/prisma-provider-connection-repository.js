import { assertAthleteScope, immutableCopy } from "./athlete-scope.js";

function displayStatus(status, diagnosticCode = null) {
  if (status === "connected") return "connected";
  if (status === "attention" || status === "revoked") {
    return diagnosticCode?.endsWith("_FAILED") ? "error" : "action_required";
  }
  return diagnosticCode ? "error" : "disconnected";
}

function statusProjection(row) {
  return immutableCopy({
    athleteId: row.athleteId,
    provider: row.provider,
    status: row.status,
    displayStatus: displayStatus(row.status, row.lastErrorCode),
    connectedAt: row.connectedAt?.toISOString() ?? null,
    lastSuccessfulProviderContactAt: row.lastProviderContactAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: row.lastSyncedAt?.toISOString() ?? null,
    lastEventReceivedAt: row.lastEventReceivedAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function envelopeFrom(row) {
  const values = [
    row.credentialCiphertext,
    row.credentialIv,
    row.credentialAuthTag,
    row.credentialKeyVersion,
  ];
  if (values.some((value) => typeof value !== "string" || value.length === 0)) return null;
  return {
    credentialCiphertext: row.credentialCiphertext,
    credentialIv: row.credentialIv,
    credentialAuthTag: row.credentialAuthTag,
    credentialKeyVersion: row.credentialKeyVersion,
  };
}

export class PrismaProviderConnectionRepository {
  #crypto;
  #prisma;

  constructor({ prisma, credentialCrypto }) {
    if (!prisma?.providerConnection) throw new Error("A Prisma provider connection delegate is required");
    if (!credentialCrypto) throw new Error("Credential envelope crypto is required");
    this.#prisma = prisma;
    this.#crypto = credentialCrypto;
  }

  async get(scope, provider) {
    const athleteId = assertAthleteScope(scope);
    const row = await this.#prisma.providerConnection.findUnique({
      where: { athleteId_provider: { athleteId, provider } },
    });
    return row ? statusProjection(row) : null;
  }

  async beginConnecting(scope, provider, occurredAt) {
    const athleteId = assertAthleteScope(scope);
    const row = await this.#prisma.providerConnection.upsert({
      where: { athleteId_provider: { athleteId, provider } },
      create: { athleteId, provider, status: "connecting", updatedAt: new Date(occurredAt) },
      update: { status: "connecting", lastErrorCode: null, updatedAt: new Date(occurredAt) },
    });
    return statusProjection(row);
  }

  async saveCredentials(scope, provider, input) {
    const athleteId = assertAthleteScope(scope);
    const envelope = this.#crypto.seal({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
    }, { athleteId, provider });
    const contactedAt = new Date(input.contactedAt);
    const values = {
      providerAthleteId: input.providerAthleteId,
      status: "connected",
      grantedScopes: input.scopes.join(" "),
      ...envelope,
      credentialExpiresAt: new Date(input.expiresAt),
      connectedAt: contactedAt,
      lastProviderContactAt: contactedAt,
      lastErrorCode: null,
      updatedAt: contactedAt,
    };
    const row = await this.#prisma.providerConnection.upsert({
      where: { athleteId_provider: { athleteId, provider } },
      create: { athleteId, provider, ...values },
      update: values,
    });
    return statusProjection(row);
  }

  async getCredentials(scope, provider) {
    const athleteId = assertAthleteScope(scope);
    const row = await this.#prisma.providerConnection.findUnique({
      where: { athleteId_provider: { athleteId, provider } },
    });
    const envelope = row ? envelopeFrom(row) : null;
    if (!row?.providerAthleteId || !row.credentialExpiresAt || !envelope) return null;
    const credentials = this.#crypto.open(envelope, { athleteId, provider });
    return immutableCopy({
      providerAthleteId: row.providerAthleteId,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: row.credentialExpiresAt.toISOString(),
      scopes: row.grantedScopes?.split(/\s+/u).filter(Boolean) ?? [],
    });
  }

  async rotateCredentials(scope, provider, input) {
    const athleteId = assertAthleteScope(scope);
    const envelope = this.#crypto.seal({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
    }, { athleteId, provider });
    const contactedAt = new Date(input.contactedAt);
    const row = await this.#prisma.providerConnection.update({
      where: { athleteId_provider: { athleteId, provider } },
      data: {
        status: "connected",
        ...envelope,
        credentialExpiresAt: new Date(input.expiresAt),
        lastProviderContactAt: contactedAt,
        lastErrorCode: null,
        updatedAt: contactedAt,
      },
    });
    return statusProjection(row);
  }

  async recordFailure(scope, provider, input) {
    const athleteId = assertAthleteScope(scope);
    const occurredAt = new Date(input.occurredAt);
    const row = await this.#prisma.providerConnection.upsert({
      where: { athleteId_provider: { athleteId, provider } },
      create: {
        athleteId,
        provider,
        status: "attention",
        lastErrorCode: input.diagnosticCode,
        updatedAt: occurredAt,
      },
      update: {
        status: "attention",
        lastErrorCode: input.diagnosticCode,
        updatedAt: occurredAt,
      },
    });
    return statusProjection(row);
  }

  async disconnect(scope, provider, input) {
    return this.#clear(scope, provider, "disconnected", input.occurredAt, input.diagnosticCode ?? null);
  }

  async revoke(scope, provider, occurredAt) {
    return this.#clear(scope, provider, "revoked", occurredAt, "PROVIDER_DEAUTHORIZED");
  }

  async #clear(scope, provider, status, occurredAt, lastErrorCode) {
    const athleteId = assertAthleteScope(scope);
    const updatedAt = new Date(occurredAt);
    const cleared = {
      providerAthleteId: null,
      status,
      grantedScopes: null,
      credentialCiphertext: null,
      credentialIv: null,
      credentialAuthTag: null,
      credentialKeyVersion: null,
      credentialExpiresAt: null,
      lastErrorCode,
      updatedAt,
    };
    const row = await this.#prisma.providerConnection.upsert({
      where: { athleteId_provider: { athleteId, provider } },
      create: { athleteId, provider, ...cleared },
      update: cleared,
    });
    return statusProjection(row);
  }
}
