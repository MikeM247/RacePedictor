import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { immutableCopy } from "./athlete-scope.js";
import {
  assertRawObjectKey,
  assertRawObjectMetadata,
  assertRawObjectPut,
  rawObjectContentEqual,
  rawObjectMetadataEqual,
  sha256Body,
} from "./raw-object-integrity.js";

const MAX_SIGNED_GET_SECONDS = 900;

export class R2RawObjectStore {
  #bucket;
  #client;
  #presign;

  /**
   * Tests may inject an S3-compatible client and signer without credentials.
   * Production construction uses the official AWS SDK v3 with R2's `auto`
   * region and S3-compatible endpoint.
   */
  constructor({
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    client,
    presign = getSignedUrl,
  }) {
    assertBucket(bucket);
    const normalizedEndpoint = assertR2Endpoint(endpoint);
    if (!client) {
      assertCredential(accessKeyId, "R2 access key id");
      assertCredential(secretAccessKey, "R2 secret access key");
    }
    if (typeof presign !== "function") throw new Error("R2 signer is required");

    this.#bucket = bucket;
    this.#client = client ?? new S3Client({
      region: "auto",
      endpoint: normalizedEndpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.#presign = presign;
  }

  async put(scope, { metadata, body }) {
    const bytes = assertRawObjectPut(scope, metadata, body);
    const existing = await this.head(scope, metadata.key);
    if (existing) {
      if (!rawObjectContentEqual(existing, metadata)) throw new Error("Raw object keys are immutable");
      return existing;
    }

    try {
      await this.#client.send(new PutObjectCommand({
        Bucket: this.#bucket,
        Key: metadata.key,
        Body: bytes,
        ContentType: metadata.contentType,
        IfNoneMatch: "*",
        Metadata: encodeMetadata(metadata),
      }));
    } catch (error) {
      // Conditional PUT prevents a concurrent delivery from overwriting an
      // existing immutable object. A racing identical replay is safe.
      if (!isPreconditionFailed(error)) throw error;
    }

    const persisted = await this.head(scope, metadata.key);
    if (!persisted || !rawObjectMetadataEqual(persisted, metadata)) {
      throw new Error("Raw object upload integrity verification failed");
    }
    return persisted;
  }

  async head(scope, key) {
    assertRawObjectKey(scope, key);
    let response;
    try {
      response = await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }

    const metadata = decodeMetadata(key, response);
    assertRawObjectMetadata(scope, metadata);
    return immutableCopy(metadata);
  }

  async createPresignedGet(scope, { key, expiresInSeconds }) {
    assertRawObjectKey(scope, key);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_SIGNED_GET_SECONDS) {
      throw new Error("Raw object access expiry must be between 1 and 900 seconds");
    }
    if (!await this.head(scope, key)) throw new Error("Raw object was not found");
    const signed = await this.#presign(
      this.#client,
      new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
    assertPrivateR2SignedUrl(signed, expiresInSeconds);
    return signed;
  }

  async readImmutableForReplay(scope, key) {
    assertRawObjectKey(scope, key);
    const metadata = await this.head(scope, key);
    if (!metadata) return null;
    const response = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }));
    const body = await responseBodyBytes(response.Body);
    if (body.byteLength !== metadata.sizeBytes || sha256Body(body) !== metadata.checksumSha256) {
      throw new Error("Raw object replay checksum verification failed");
    }
    return new Uint8Array(body);
  }
}

function encodeMetadata(metadata) {
  return {
    "racepredictor-athlete-id": metadata.athleteId,
    "racepredictor-provider": metadata.provider,
    "racepredictor-checksum-sha256": metadata.checksumSha256,
    "racepredictor-captured-at": metadata.capturedAt,
  };
}

function decodeMetadata(key, response) {
  const metadata = Object.fromEntries(
    Object.entries(response.Metadata ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    athleteId: metadata["racepredictor-athlete-id"],
    provider: metadata["racepredictor-provider"],
    key,
    checksumSha256: metadata["racepredictor-checksum-sha256"],
    contentType: response.ContentType,
    sizeBytes: response.ContentLength,
    capturedAt: metadata["racepredictor-captured-at"],
  };
}

async function responseBodyBytes(body) {
  if (body instanceof Uint8Array) return body;
  if (body && typeof body.transformToByteArray === "function") {
    return new Uint8Array(await body.transformToByteArray());
  }
  throw new Error("R2 response body is unavailable");
}

function assertBucket(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value)) {
    throw new Error("R2 bucket is invalid");
  }
}

function assertR2Endpoint(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("R2 endpoint is invalid");
  }
  if (
    parsed.protocol !== "https:"
    || !parsed.hostname.endsWith(".r2.cloudflarestorage.com")
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("R2 endpoint is invalid");
  }
  return parsed.origin;
}

function assertCredential(value, label) {
  if (typeof value !== "string" || value.length < 8 || value.length > 512) {
    throw new Error(`${label} is invalid`);
  }
}

function assertPrivateR2SignedUrl(value, requestedExpiry) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("R2 signer returned an invalid URL");
  }
  const signedExpiry = Number(parsed.searchParams.get("X-Amz-Expires"));
  if (
    parsed.protocol !== "https:"
    || !parsed.hostname.endsWith(".r2.cloudflarestorage.com")
    || !parsed.searchParams.has("X-Amz-Algorithm")
    || !parsed.searchParams.has("X-Amz-Signature")
    || signedExpiry !== requestedExpiry
    || signedExpiry > MAX_SIGNED_GET_SECONDS
  ) {
    throw new Error("R2 signer did not return a private short-lived URL");
  }
}

function isNotFound(error) {
  return error?.name === "NotFound"
    || error?.name === "NoSuchKey"
    || error?.$metadata?.httpStatusCode === 404;
}

function isPreconditionFailed(error) {
  return error?.name === "PreconditionFailed" || error?.$metadata?.httpStatusCode === 412;
}
