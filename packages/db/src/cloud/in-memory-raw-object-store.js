import { assertAthleteOwnership, immutableCopy } from "./athlete-scope.js";
import {
  assertRawObjectKey,
  assertRawObjectPut,
  rawObjectContentEqual,
  rawObjectKeyPrefix,
} from "./raw-object-integrity.js";

export class InMemoryRawObjectStore {
  #objects = new Map();
  #now;

  constructor({ now = () => new Date() } = {}) {
    this.#now = now;
  }

  async put(scope, { metadata, body }) {
    const bytes = assertRawObjectPut(scope, metadata, body);

    const existing = this.#objects.get(metadata.key);
    if (existing) {
      assertAthleteOwnership(scope, existing.metadata.athleteId);
      if (
        existing.metadata.checksumSha256 === metadata.checksumSha256
        && Buffer.compare(existing.body, bytes) === 0
        && rawObjectContentEqual(existing.metadata, metadata)
      ) {
        return immutableCopy(existing.metadata);
      }
      throw new Error("Raw object keys are immutable");
    }

    this.#objects.set(metadata.key, {
      metadata: immutableCopy(metadata),
      body: Buffer.from(bytes),
    });
    return immutableCopy(metadata);
  }

  async head(scope, key) {
    assertRawObjectKey(scope, key);
    const existing = this.#objects.get(key);
    if (!existing) return null;
    assertAthleteOwnership(scope, existing.metadata.athleteId);
    return immutableCopy(existing.metadata);
  }

  async createPresignedGet(scope, { key, expiresInSeconds }) {
    assertRawObjectKey(scope, key);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) {
      throw new Error("Raw object access expiry must be between 1 and 900 seconds");
    }
    const existing = this.#objects.get(key);
    if (!existing) throw new Error("Raw object was not found");
    assertAthleteOwnership(scope, existing.metadata.athleteId);
    const expiresAt = Math.floor(this.#now().getTime() / 1000) + expiresInSeconds;
    return `memory-raw://object/${encodeURIComponent(key)}?athlete=${encodeURIComponent(scope.athleteId)}&expires=${expiresAt}`;
  }

  async readImmutableForReplay(scope, key) {
    assertRawObjectKey(scope, key);
    const existing = this.#objects.get(key);
    if (!existing) return null;
    assertAthleteOwnership(scope, existing.metadata.athleteId);
    return new Uint8Array(existing.body);
  }
}

export { rawObjectKeyPrefix } from "./raw-object-integrity.js";
