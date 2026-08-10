import { createHash } from "node:crypto";
import { assertAthleteOwnership, assertAthleteScope } from "./athlete-scope.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function rawObjectKeyPrefix(athleteId, provider) {
  return `athletes/${athleteId}/providers/${provider}/`;
}

export function sha256Body(body) {
  return createHash("sha256").update(body).digest("hex");
}

export function assertRawObjectPut(scope, metadata, body) {
  assertRawObjectMetadata(scope, metadata);
  if (!(body instanceof Uint8Array)) throw new Error("Raw object body must be bytes");
  const bytes = Buffer.from(body);
  if (metadata.checksumSha256 !== sha256Body(bytes)) {
    throw new Error("Raw object checksum does not match its body");
  }
  if (metadata.sizeBytes !== bytes.byteLength) {
    throw new Error("Raw object size does not match its body");
  }
  return bytes;
}

export function assertRawObjectMetadata(scope, metadata) {
  if (!metadata || typeof metadata !== "object") throw new Error("Raw object metadata is required");
  const allowedFields = new Set([
    "athleteId",
    "provider",
    "key",
    "checksumSha256",
    "contentType",
    "sizeBytes",
    "capturedAt",
  ]);
  if (Object.keys(metadata).some((field) => !allowedFields.has(field))) {
    throw new Error("Raw object metadata contains an unsupported field");
  }
  assertAthleteOwnership(scope, metadata.athleteId);
  if (metadata.provider !== "strava") throw new Error("Raw object provider is unsupported");
  assertRawObjectKey(scope, metadata.key, metadata.provider);
  if (!SHA256_PATTERN.test(metadata.checksumSha256)) throw new Error("Raw object checksum is invalid");
  if (!Number.isInteger(metadata.sizeBytes) || metadata.sizeBytes < 0) throw new Error("Raw object size is invalid");
  if (typeof metadata.contentType !== "string" || metadata.contentType.length === 0 || metadata.contentType.length > 200) {
    throw new Error("Raw object content type is invalid");
  }
  if (typeof metadata.capturedAt !== "string" || Number.isNaN(Date.parse(metadata.capturedAt))) {
    throw new Error("Raw object capture time is invalid");
  }
}

export function assertRawObjectKey(scope, key, provider = "strava") {
  const athleteId = assertAthleteScope(scope);
  const prefix = rawObjectKeyPrefix(athleteId, provider);
  if (
    typeof key !== "string"
    || key.length <= prefix.length
    || key.length > 1024
    || key.includes("\\")
    || key.split("/").includes("..")
    || !key.startsWith(prefix)
  ) {
    throw new Error("Raw object key is not authorized for the requested athlete");
  }
}

export function rawObjectMetadataEqual(left, right) {
  return rawObjectContentEqual(left, right)
    && left.capturedAt === right.capturedAt;
}

export function rawObjectContentEqual(left, right) {
  return left.athleteId === right.athleteId
    && left.provider === right.provider
    && left.key === right.key
    && left.checksumSha256 === right.checksumSha256
    && left.contentType === right.contentType
    && left.sizeBytes === right.sizeBytes;
}
