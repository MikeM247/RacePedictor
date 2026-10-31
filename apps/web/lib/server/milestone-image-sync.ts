import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import {
  imageStateSchema,
  imageAssetTransferSchema,
} from "../../../../packages/core/src/contracts/milestone-images.ts";
import {
  imageSourceKey,
  verifiedImageSourceKeys,
} from "../../../../packages/core/src/services/milestone-images.ts";
import {
  readCloudImages,
  writeCloudImages,
  putCloudImageAsset,
  readCloudImageAsset,
  ImageRevisionConflict,
} from "../../../../packages/db/src/milestone-images.ts";
import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/prisma-client.js";
import { readCloudMilestoneState } from "../../../../packages/db/src/milestone-timeline.ts";
import { cloudSources, milestoneView } from "./milestone-timeline.ts";
import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import type { AuthenticatedDevice } from "../../../../packages/core/src/use-cases/paired-device.ts";
import { ApiHttpError } from "./api-response.ts";
export async function imageManifest(device: AuthenticatedDevice) {
  const athleteId = athleteScopeFor(device.actor).athleteId;
  const record = await readCloudImages(athleteId, getCloudPrismaClient());
  return { revision: record.revision, state: record.state };
}
export async function deviceImageAsset(
  device: AuthenticatedDevice,
  id: string,
) {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new ApiHttpError(404, "NOT_FOUND", "Image unavailable");
  return readCloudImageAsset(
    athleteScopeFor(device.actor).athleteId,
    id,
    getCloudPrismaClient(),
  );
}
export async function acceptDeviceImageAsset(
  device: AuthenticatedDevice,
  raw: unknown,
) {
  const parsed = imageAssetTransferSchema.safeParse(raw);
  if (!parsed.success)
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Invalid image transfer");
  const asset = parsed.data,
    bytes = Buffer.from(asset.bytes, "base64");
  try {
    if (
      bytes.length > 524288 ||
      createHash("sha256").update(bytes).digest("hex") !== asset.id
    )
      throw new Error();
    const meta = await sharp(bytes, {
      limitInputPixels: 512 * 512,
      animated: true,
    }).metadata();
    if (
      meta.format !== "webp" ||
      meta.width !== asset.width ||
      meta.height !== asset.height ||
      (meta.pages ?? 1) > 1 ||
      meta.exif ||
      meta.xmp ||
      meta.iptc ||
      meta.icc
    )
      throw new Error();
  } catch {
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "Image transfer integrity verification failed",
    );
  }
  await putCloudImageAsset(
    athleteScopeFor(device.actor).athleteId,
    { ...asset, bytes },
    getCloudPrismaClient(),
  );
  return { id: asset.id };
}
export async function acceptImageManifest(
  device: AuthenticatedDevice,
  raw: unknown,
) {
  const parsed = z
    .object({
      expectedRevision: z.number().int().nonnegative(),
      state: imageStateSchema,
    })
    .strict()
    .safeParse(raw);
  if (!parsed.success)
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Invalid image state");
  const input = parsed.data,
    athleteId = athleteScopeFor(device.actor).athleteId;
  try {
    return await getCloudPrismaClient().$transaction(
      async (tx) => {
        const current = await readCloudImages(athleteId, tx);
        if (current.revision !== input.expectedRevision)
          throw new ImageRevisionConflict();
        const security = {
          mode: "authenticated" as const,
          actor: device.actor,
        };
        const sources = await cloudSources(
          security,
          tx as unknown as ReturnType<typeof getCloudPrismaClient>,
        );
        if (!sources.availability.goal || !sources.availability.history)
          throw new ApiHttpError(
            503,
            "UNAVAILABLE",
            "Milestone sources are not yet verified online. Images remain pending locally.",
          );
        const timeline = milestoneView(
          sources,
          await readCloudMilestoneState(athleteId, tx),
        );
        const known = verifiedImageSourceKeys(timeline);
        for (const binding of input.state.bindings) {
          const old = current.state.bindings.find(
            (b) => imageSourceKey(b.source) === imageSourceKey(binding.source),
          );
          if (
            JSON.stringify(old) !== JSON.stringify(binding) &&
            !known.has(imageSourceKey(binding.source))
          )
            throw new ApiHttpError(
              409,
              "CONFLICT",
              "A referenced milestone is not yet verified online. Images remain pending locally.",
            );
          if (
            binding.choice?.kind === "upload" &&
            !(await readCloudImageAsset(athleteId, binding.choice.id, tx))
          )
            throw new ApiHttpError(
              409,
              "CONFLICT",
              "Transfer the selected image before publishing its assignment",
            );
        }
        const next = await writeCloudImages(
          athleteId,
          current.revision,
          input.state,
          tx,
        );
        return { revision: next.revision, state: next.state };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (
      error instanceof ImageRevisionConflict ||
      (error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2034")
    )
      throw new ApiHttpError(
        409,
        "CONFLICT",
        "Online images changed. Sync again and review the conflict in Settings.",
      );
    throw error;
  }
}
