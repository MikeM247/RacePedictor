import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  imageChangeSchema,
  type ImageChoice,
  type ImageView,
} from "../../../../packages/core/src/contracts/milestone-images.ts";
import {
  assignEntryImage,
  imageEntrySources,
  imageSourceKey,
  verifiedImageSourceKeys,
} from "../../../../packages/core/src/services/milestone-images.ts";
import type {
  MilestoneMutation,
  MilestoneTimeline,
} from "../../../../packages/core/src/contracts/milestone-timeline.ts";
import {
  ImageRevisionConflict,
  localImageSchema,
  readLocalImages,
  writeLocalImages,
  readCloudImages,
  writeCloudImages,
  putCloudImageAsset,
  putLocalImageAsset,
  readCloudImageAsset,
  readLocalImageAsset,
  type ImageRecord,
  type ImageAsset,
  type ImageSql,
} from "../../../../packages/db/src/milestone-images.ts";
import {
  readCloudMilestoneState,
  readLocalMilestoneState,
  withLocalMilestoneTransaction,
} from "../../../../packages/db/src/milestone-timeline.ts";
import type { DatabaseSync } from "node:sqlite";
import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/prisma-client.js";
import { createLocalCoachingService } from "../local-coaching-service.ts";
import {
  readMilestones,
  cloudSources,
  localSources,
  milestoneView,
} from "./milestone-timeline.ts";
import { raceHistoryActor } from "./race-history.ts";
import { ApiHttpError } from "./api-response.ts";
import type { SensitiveRouteContext } from "./route-security.ts";
export function imageSourceVersion(timeline: MilestoneTimeline) {
  return createHash("sha256").update(`${timeline.sourceVersion}:${timeline.revision}`).digest("hex");
}
export const MAX_IMAGE_UPLOAD = 5 * 1024 * 1024;
export async function normalizeMilestoneImage(
  bytes: Uint8Array,
): Promise<ImageAsset> {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_UPLOAD)
    throw new ApiHttpError(
      413,
      "VALIDATION_ERROR",
      "Choose an image up to 5 MiB",
    );
  const header = Buffer.from(bytes.subarray(0, 12));
  const supported =
    header
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (header[0] === 255 && header[1] === 216 && header[2] === 255) ||
    (header.subarray(0, 4).toString() === "RIFF" &&
      header.subarray(8, 12).toString() === "WEBP");
  if (!supported)
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "Choose a still PNG, JPEG or WebP image",
    );
  try {
    const input = sharp(bytes, {
      limitInputPixels: 4096 * 4096,
      animated: true,
    });
    const meta = await input.metadata();
    if (
      !["png", "jpeg", "webp"].includes(meta.format ?? "") ||
      !meta.width ||
      !meta.height ||
      meta.width < 64 ||
      meta.height < 64 ||
      meta.width > 4096 ||
      meta.height > 4096 ||
      (meta.pages ?? 1) > 1
    )
      throw new Error("format");
    const output = await input
      .rotate()
      .resize({
        width: 512,
        height: 512,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (output.data.length > 512 * 1024) throw new Error("size");
    return {
      id: createHash("sha256").update(output.data).digest("hex"),
      bytes: output.data,
      width: output.info.width,
      height: output.info.height,
    };
  } catch {
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "Choose a still PNG, JPEG or WebP image from 64 to 4096 pixels on each side",
    );
  }
}
export async function readBoundedImage(request: Request) {
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Choose an image");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_IMAGE_UPLOAD) {
      await reader.cancel();
      throw new ApiHttpError(
        413,
        "VALIDATION_ERROR",
        "Choose an image up to 5 MiB",
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function toImageView(
  record: ImageRecord,
  sourceVersion: string,
  online: boolean,
): ImageView {
  return {
    revision: record.revision,
    state: record.state,
    sourceVersion,
    sync: online
      ? "online"
      : record.remoteState
        ? "conflict"
        : record.pending
          ? "pending"
          : "local",
    cloudRevision: record.cloudRevision,
    remoteState: record.remoteState,
  };
}
export async function readImages(
  security: SensitiveRouteContext,
): Promise<ImageView> {
  const timeline = await readMilestones(security);
  if (security.mode === "authenticated")
    return toImageView(
      await readCloudImages(raceHistoryActor(security), getCloudPrismaClient()),
      imageSourceVersion(timeline),
      true,
    );
  const service = createLocalCoachingService({
    athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001",
  });
  try {
    return toImageView(
      readLocalImages(service.databasePath, service.athleteId),
      imageSourceVersion(timeline),
      false,
    );
  } finally {
    service.close();
  }
}
function requireEntry(
  timeline: MilestoneTimeline,
  entryId: string,
  sourceVersion: string,
) {
  if (!timeline.availability.goal || !timeline.availability.history)
    throw new ApiHttpError(
      503,
      "UNAVAILABLE",
      "Reload verified milestones before saving an image",
    );
  if (imageSourceVersion(timeline) !== sourceVersion)
    throw new ImageRevisionConflict();
  const entry = [...timeline.entries, ...timeline.removed].find(
    (e) => e.id === entryId,
  );
  if (
    !entry ||
    !entry.sources.some((source) =>
      verifiedImageSourceKeys(timeline).has(imageSourceKey(source)),
    )
  )
    throw new ImageRevisionConflict();
  return entry;
}
export async function saveImages(
  security: SensitiveRouteContext,
  raw: unknown,
) {
  const parsed = imageChangeSchema.safeParse(raw);
  if (!parsed.success)
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "The image change is invalid",
    );
  const change = parsed.data;
  try {
    if (security.mode === "authenticated") {
      const athleteId = raceHistoryActor(security, true);
      return await getCloudPrismaClient().$transaction(
        async (tx) => {
          const timeline = milestoneView(
            await cloudSources(
              security,
              tx as unknown as ReturnType<typeof getCloudPrismaClient>,
            ),
            await readCloudMilestoneState(athleteId, tx),
          );
          const entry = requireEntry(
              timeline,
              change.entryId,
              change.sourceVersion,
            ),
            record = await readCloudImages(athleteId, tx);
          if (record.revision !== change.expectedRevision)
            throw new ImageRevisionConflict();
          if (
            change.choice?.kind === "upload" &&
            !(await readCloudImageAsset(athleteId, change.choice.id, tx))
          )
            throw new ApiHttpError(
              404,
              "NOT_FOUND",
              "Upload this image before saving it",
            );
          return toImageView(
            await writeCloudImages(
              athleteId,
              record.revision,
              assignEntryImage(
                record.state,
                imageEntrySources(entry),
                change.choice,
                change.label,
              ),
              tx,
            ),
            imageSourceVersion(timeline),
            true,
          );
        },
        { isolationLevel: "Serializable" },
      );
    }
    const service = createLocalCoachingService({
      athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001",
    });
    try {
      return withLocalMilestoneTransaction(service.databasePath, (db) => {
        db.exec(localImageSchema);
        const timeline = milestoneView(
          localSources(service),
          readLocalMilestoneState(service.databasePath, service.athleteId, db),
        );
        const entry = requireEntry(
            timeline,
            change.entryId,
            change.sourceVersion,
          ),
          record = readLocalImages(service.databasePath, service.athleteId, db);
        if (record.remoteState || record.revision !== change.expectedRevision)
          throw new ImageRevisionConflict();
        if (
          change.choice?.kind === "upload" &&
          !readLocalImageAsset(
            service.databasePath,
            service.athleteId,
            change.choice.id,
            db,
          )
        )
          throw new ApiHttpError(
            404,
            "NOT_FOUND",
            "Upload this image before saving it",
          );
        const paired =
          Boolean(process.env.RACEPREDICTOR_CLOUD_URL) ||
          record.cloudRevision !== null;
        return toImageView(
          writeLocalImages(
            db,
            service.athleteId,
            record.revision,
            assignEntryImage(
              record.state,
              imageEntrySources(entry),
              change.choice,
              change.label,
            ),
            { cloudRevision: record.cloudRevision, pending: paired },
          ),
          imageSourceVersion(timeline),
          false,
        );
      });
    } finally {
      service.close();
    }
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
        "Milestones or images changed. Reload and review before saving again.",
      );
    throw error;
  }
}
export async function storeImage(
  security: SensitiveRouteContext,
  asset: ImageAsset,
) {
  if (security.mode === "authenticated") {
    await putCloudImageAsset(
      raceHistoryActor(security, true),
      asset,
      getCloudPrismaClient(),
    );
    return;
  }
  const service = createLocalCoachingService({
    athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001",
  });
  try {
    const { withLocalImages } = await import(
      "../../../../packages/db/src/milestone-images.ts"
    );
    withLocalImages(service.databasePath, (db) =>
      putLocalImageAsset(db, service.athleteId, asset),
    );
  } finally {
    service.close();
  }
}
export async function readImageAsset(
  security: SensitiveRouteContext,
  id: string,
) {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new ApiHttpError(404, "NOT_FOUND", "Image unavailable");
  if (security.mode === "authenticated")
    return readCloudImageAsset(
      raceHistoryActor(security),
      id,
      getCloudPrismaClient(),
    );
  const service = createLocalCoachingService({
    athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001",
  });
  try {
    return readLocalImageAsset(service.databasePath, service.athleteId, id);
  } finally {
    service.close();
  }
}
