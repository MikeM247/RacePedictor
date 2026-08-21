import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const ENVELOPE_CONTEXT = "racepredictor/provider-credentials/v1";

export class CredentialEnvelopeCrypto {
  #activeKeyVersion;
  #keys;

  constructor({ activeKeyVersion, keys }) {
    if (typeof activeKeyVersion !== "string" || activeKeyVersion.length === 0) {
      throw new Error("An active credential key version is required");
    }

    const entries = keys instanceof Map ? [...keys.entries()] : Object.entries(keys ?? {});
    this.#keys = new Map(entries.map(([version, key]) => [version, normalizeKey(key)]));
    if (!this.#keys.has(activeKeyVersion)) {
      throw new Error("The active credential key version is not present in the key ring");
    }
    this.#activeKeyVersion = activeKeyVersion;
  }

  seal(credentials, binding) {
    assertCredentials(credentials);
    const aad = envelopeAad(this.#activeKeyVersion, binding);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#keys.get(this.#activeKeyVersion), iv);
    cipher.setAAD(aad);

    const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return Object.freeze({
      credentialCiphertext: ciphertext.toString("base64url"),
      credentialIv: iv.toString("base64url"),
      credentialAuthTag: cipher.getAuthTag().toString("base64url"),
      credentialKeyVersion: this.#activeKeyVersion,
    });
  }

  open(envelope, binding) {
    assertEnvelope(envelope);
    const key = this.#keys.get(envelope.credentialKeyVersion);
    if (!key) throw new Error("Credential envelope key version is unavailable");

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(envelope.credentialIv, "base64url"),
      );
      decipher.setAAD(envelopeAad(envelope.credentialKeyVersion, binding));
      decipher.setAuthTag(Buffer.from(envelope.credentialAuthTag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.credentialCiphertext, "base64url")),
        decipher.final(),
      ]);
      const parsed = JSON.parse(plaintext.toString("utf8"));
      assertCredentials(parsed);
      return Object.freeze(structuredClone(parsed));
    } catch {
      throw new Error("Credential envelope authentication failed");
    }
  }
}

function normalizeKey(value) {
  const key = value instanceof Uint8Array
    ? Buffer.from(value)
    : Buffer.from(String(value ?? ""), "base64");
  if (key.byteLength !== KEY_BYTES) {
    throw new Error("Credential envelope keys must be 32 bytes");
  }
  return Buffer.from(key);
}

function assertCredentials(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Provider credentials must be a structured object");
  }
}

function assertEnvelope(envelope) {
  const fields = [
    "credentialCiphertext",
    "credentialIv",
    "credentialAuthTag",
    "credentialKeyVersion",
  ];
  if (!envelope || typeof envelope !== "object" || fields.some((field) => {
    return typeof envelope[field] !== "string" || envelope[field].length === 0;
  })) {
    throw new Error("Credential envelope is invalid");
  }
}

function envelopeAad(keyVersion, binding) {
  if (!binding || typeof binding.athleteId !== "string" || typeof binding.provider !== "string") {
    throw new Error("Credential envelope athlete and provider binding is required");
  }
  return Buffer.from(
    `${ENVELOPE_CONTEXT}\u0000${keyVersion}\u0000${binding.athleteId}\u0000${binding.provider}`,
    "utf8",
  );
}
