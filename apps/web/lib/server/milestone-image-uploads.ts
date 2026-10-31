import { createHash, randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/prisma-client.js";
import { raceHistoryActor } from "./race-history.ts";
import { ApiHttpError } from "./api-response.ts";
import {
  normalizeMilestoneImage,
  MAX_IMAGE_UPLOAD,
  storeImage,
  readImageAsset,
} from "./milestone-images.ts";
import type { SensitiveRouteContext } from "./route-security.ts";
export function milestoneStagingStore() {
  const required = (name: string) => {
    const v = process.env[name];
    if (!v)
      throw new ApiHttpError(
        503,
        "CONFIGURATION_ERROR",
        "Image upload storage is unavailable",
      );
    return v;
  };
  return {
    bucket: required("R2_BUCKET"),
    client: new S3Client({
      region: "auto",
      requestChecksumCalculation: "WHEN_REQUIRED",
      endpoint: required("R2_ENDPOINT"),
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    }),
  };
}
export const imageUploadDependencies = {
  database: getCloudPrismaClient,
  staging: milestoneStagingStore,
  store: storeImage,
  read: readImageAsset,
};
const initiateSchema = z
  .object({
    byteSize: z.number().int().min(1).max(MAX_IMAGE_UPLOAD),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  })
  .strict();
export async function initiateImageUpload(
  security: SensitiveRouteContext,
  body: unknown,
  dependencies = imageUploadDependencies,
) {
  if (security.mode !== "authenticated") return { mode: "local" as const };
  const parsed = initiateSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "Choose a PNG, JPEG or WebP image up to 5 MiB",
    );
  const athleteId = raceHistoryActor(security, true),
    input = parsed.data,
    id = randomUUID(),
    key = `athletes/${athleteId}/milestone-images/staging/${id}`;
  const { client, bucket } = dependencies.staging();
  const metadata = {
    "athlete-id": athleteId,
    "upload-id": id,
    sha256: input.checksum,
  };
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.byteSize,
      Metadata: metadata,
    }),
    { expiresIn: 600 },
  );
  await dependencies
    .database()
    .milestoneImageUpload.create({
      data: {
        id,
        athleteId,
        storageKey: key,
        byteSize: input.byteSize,
        checksum: input.checksum,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  return {
    mode: "cloud" as const,
    id,
    url,
    headers: {
      "content-type": input.contentType,
      "x-amz-meta-athlete-id": athleteId,
      "x-amz-meta-upload-id": id,
      "x-amz-meta-sha256": input.checksum,
    },
  };
}
export async function finalizeImageUpload(
  security: SensitiveRouteContext,
  id: string,
  dependencies = imageUploadDependencies,
) {
  if (security.mode !== "authenticated")
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "Use the local image upload",
    );
  const athleteId = raceHistoryActor(security, true),
    sql = dependencies.database();
  const row = await sql.milestoneImageUpload.findFirst({
    where: { id, athleteId },
  });
  if (!row || row.expiresAt.getTime() < Date.now())
    throw new ApiHttpError(
      404,
      "NOT_FOUND",
      "Upload expired. Choose the file again.",
    );
  if (row.assetId) {
    const asset = await dependencies.read(security, row.assetId);
    if (asset)
      return { id: asset.id, width: asset.width, height: asset.height };
  }
  const { client, bucket } = dependencies.staging();
  const request = { Bucket: bucket, Key: row.storageKey };
  const head = await client.send(new HeadObjectCommand(request));
  if (
    head.ContentLength !== row.byteSize ||
    head.Metadata?.["athlete-id"] !== athleteId ||
    head.Metadata?.["upload-id"] !== row.id ||
    head.Metadata?.sha256 !== row.checksum
  )
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "Upload integrity verification failed",
    );
  const object = await client.send(new GetObjectCommand(request));
  if (!object.Body)
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "Uploaded image is missing",
    );
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    length += chunk.length;
    if (length > MAX_IMAGE_UPLOAD)
      throw new ApiHttpError(
        413,
        "VALIDATION_ERROR",
        "Choose an image up to 5 MiB",
      );
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (
    bytes.length !== row.byteSize ||
    createHash("sha256").update(bytes).digest("hex") !== row.checksum
  )
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "Upload integrity verification failed",
    );
  const asset = await normalizeMilestoneImage(bytes);
  await dependencies.store(security, asset);
  await sql.milestoneImageUpload.update({
    where: { id: row.id },
    data: { assetId: asset.id },
  });
  await client.send(new DeleteObjectCommand(request));
  return { id: asset.id, width: asset.width, height: asset.height };
}
