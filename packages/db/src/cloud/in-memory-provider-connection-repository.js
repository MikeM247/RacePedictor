import { assertAthleteScope, immutableCopy } from "./athlete-scope.js";

const recordKey = (athleteId, provider) => `${athleteId}\u0000${provider}`;
const providerIdentityKey = (provider, providerAthleteId) => `${provider}\u0000${providerAthleteId}`;

function displayStatus(status, diagnosticCode = null) {
  if (status === "connected") return "connected";
  if (status === "attention" || status === "revoked") {
    return diagnosticCode?.endsWith("_FAILED") ? "error" : "action_required";
  }
  return diagnosticCode ? "error" : "disconnected";
}

function project(record) {
  return immutableCopy({
    athleteId: record.athleteId,
    provider: record.provider,
    status: record.status,
    displayStatus: displayStatus(record.status, record.lastErrorCode),
    connectedAt: record.connectedAt,
    lastSuccessfulProviderContactAt: record.lastSuccessfulProviderContactAt,
    lastSuccessfulSyncAt: record.lastSuccessfulSyncAt,
    lastEventReceivedAt: record.lastEventReceivedAt,
    lastErrorCode: record.lastErrorCode,
    updatedAt: record.updatedAt,
  });
}

export class InMemoryProviderConnectionRepository {
  #crypto;
  #providerIdentities = new Map();
  #records = new Map();

  constructor({ credentialCrypto }) {
    if (!credentialCrypto) throw new Error("Credential envelope crypto is required");
    this.#crypto = credentialCrypto;
  }

  async get(scope, provider) {
    const athleteId = assertAthleteScope(scope);
    const record = this.#records.get(recordKey(athleteId, provider));
    return record ? project(record) : null;
  }

  async beginConnecting(scope, provider, occurredAt) {
    const athleteId = assertAthleteScope(scope);
    const key = recordKey(athleteId, provider);
    const prior = this.#records.get(key);
    const record = {
      athleteId,
      provider,
      providerAthleteId: prior?.providerAthleteId ?? null,
      status: "connecting",
      envelope: prior?.envelope ?? null,
      scopes: prior?.scopes ?? [],
      expiresAt: prior?.expiresAt ?? null,
      connectedAt: prior?.connectedAt ?? null,
      lastSuccessfulProviderContactAt: prior?.lastSuccessfulProviderContactAt ?? null,
      lastSuccessfulSyncAt: prior?.lastSuccessfulSyncAt ?? null,
      lastEventReceivedAt: prior?.lastEventReceivedAt ?? null,
      lastErrorCode: null,
      updatedAt: occurredAt,
    };
    this.#records.set(key, record);
    return project(record);
  }

  async saveCredentials(scope, provider, input) {
    const athleteId = assertAthleteScope(scope);
    const identityKey = providerIdentityKey(provider, input.providerAthleteId);
    const identityOwner = this.#providerIdentities.get(identityKey);
    if (identityOwner && identityOwner !== athleteId) {
      throw new Error("Provider connection conflicts with an existing athlete");
    }

    const key = recordKey(athleteId, provider);
    const prior = this.#records.get(key);
    if (prior?.providerAthleteId && prior.providerAthleteId !== input.providerAthleteId) {
      this.#providerIdentities.delete(providerIdentityKey(provider, prior.providerAthleteId));
    }
    const envelope = this.#crypto.seal({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
    }, { athleteId, provider });
    const record = {
      athleteId,
      provider,
      providerAthleteId: input.providerAthleteId,
      status: "connected",
      envelope,
      scopes: [...input.scopes],
      expiresAt: input.expiresAt,
      connectedAt: input.contactedAt,
      lastSuccessfulProviderContactAt: input.contactedAt,
      lastSuccessfulSyncAt: prior?.lastSuccessfulSyncAt ?? null,
      lastEventReceivedAt: prior?.lastEventReceivedAt ?? null,
      lastErrorCode: null,
      updatedAt: input.contactedAt,
    };
    this.#records.set(key, record);
    this.#providerIdentities.set(identityKey, athleteId);
    return project(record);
  }

  async getCredentials(scope, provider) {
    const athleteId = assertAthleteScope(scope);
    const record = this.#records.get(recordKey(athleteId, provider));
    if (!record?.envelope || !record.providerAthleteId || !record.expiresAt) return null;
    const credentials = this.#crypto.open(record.envelope, { athleteId, provider });
    return immutableCopy({
      providerAthleteId: record.providerAthleteId,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: record.expiresAt,
      scopes: record.scopes,
    });
  }

  async rotateCredentials(scope, provider, input) {
    const athleteId = assertAthleteScope(scope);
    const key = recordKey(athleteId, provider);
    const prior = this.#records.get(key);
    if (!prior?.envelope || !prior.providerAthleteId) {
      throw new Error("Provider connection has no credentials to rotate");
    }
    const record = {
      ...prior,
      status: "connected",
      envelope: this.#crypto.seal({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
      }, { athleteId, provider }),
      expiresAt: input.expiresAt,
      lastSuccessfulProviderContactAt: input.contactedAt,
      lastErrorCode: null,
      updatedAt: input.contactedAt,
    };
    this.#records.set(key, record);
    return project(record);
  }

  async recordFailure(scope, provider, input) {
    const athleteId = assertAthleteScope(scope);
    const key = recordKey(athleteId, provider);
    const prior = this.#records.get(key);
    const record = {
      athleteId,
      provider,
      providerAthleteId: prior?.providerAthleteId ?? null,
      status: "attention",
      envelope: prior?.envelope ?? null,
      scopes: prior?.scopes ?? [],
      expiresAt: prior?.expiresAt ?? null,
      connectedAt: prior?.connectedAt ?? null,
      lastSuccessfulProviderContactAt: prior?.lastSuccessfulProviderContactAt ?? null,
      lastSuccessfulSyncAt: prior?.lastSuccessfulSyncAt ?? null,
      lastEventReceivedAt: prior?.lastEventReceivedAt ?? null,
      lastErrorCode: input.diagnosticCode,
      updatedAt: input.occurredAt,
    };
    this.#records.set(key, record);
    return project(record);
  }

  async disconnect(scope, provider, input) {
    return this.#clear(scope, provider, "disconnected", input.occurredAt, input.diagnosticCode ?? null);
  }

  async revoke(scope, provider, occurredAt) {
    return this.#clear(scope, provider, "revoked", occurredAt, "PROVIDER_DEAUTHORIZED");
  }

  async #clear(scope, provider, status, occurredAt, diagnosticCode) {
    const athleteId = assertAthleteScope(scope);
    const key = recordKey(athleteId, provider);
    const prior = this.#records.get(key);
    if (prior?.providerAthleteId) {
      this.#providerIdentities.delete(providerIdentityKey(provider, prior.providerAthleteId));
    }
    const record = {
      athleteId,
      provider,
      providerAthleteId: null,
      status,
      envelope: null,
      scopes: [],
      expiresAt: null,
      connectedAt: prior?.connectedAt ?? null,
      lastSuccessfulProviderContactAt: prior?.lastSuccessfulProviderContactAt ?? null,
      lastSuccessfulSyncAt: prior?.lastSuccessfulSyncAt ?? null,
      lastEventReceivedAt: prior?.lastEventReceivedAt ?? null,
      lastErrorCode: diagnosticCode,
      updatedAt: occurredAt,
    };
    this.#records.set(key, record);
    return project(record);
  }
}
