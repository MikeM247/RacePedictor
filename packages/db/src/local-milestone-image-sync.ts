import { createHash } from "node:crypto";
import {
  imageStateSchema,
  type ImageState,
} from "../../core/src/contracts/milestone-images.ts";
import {
  readLocalImages,
  readLocalImageAsset,
  writeLocalImages,
  putLocalImageAsset,
  withLocalImages,
  type ImageAsset,
} from "./milestone-images.ts";
export type ImageManifest = {
  revision: number;
  state: ImageState;
};
export type ImageSyncClient = {
  getMilestoneImages(token: string): Promise<ImageManifest>;
  getMilestoneImageAsset(token: string, id: string): Promise<ImageAsset>;
  putMilestoneImageAsset(token: string, asset: ImageAsset): Promise<void>;
  putMilestoneImages(
    token: string,
    change: {
      expectedRevision: number;
      state: ImageState;
    },
  ): Promise<ImageManifest>;
};
const ids = (state: ImageState) => [
  ...new Set(
    state.bindings.flatMap((b) =>
      b.choice?.kind === "upload" ? [b.choice.id] : [],
    ),
  ),
];
export async function syncMilestoneImages({
  databasePath,
  athleteId,
  client,
  token,
}: {
  databasePath: string;
  athleteId: string;
  client: ImageSyncClient;
  token: string;
}) {
  const local = readLocalImages(databasePath, athleteId),
    remote = await client.getMilestoneImages(token);
  imageStateSchema.parse(remote.state);
  if (local.remoteState) return { status: "conflict" as const };
  const downloads: ImageAsset[] = [];
  for (const id of ids(remote.state)) {
    if (!readLocalImageAsset(databasePath, athleteId, id)) {
      const asset = await client.getMilestoneImageAsset(token, id);
      if (
        asset.id !== id ||
        asset.bytes.length > 524288 ||
        createHash("sha256").update(asset.bytes).digest("hex") !== id
      )
        throw new Error("Image transfer integrity verification failed");
      downloads.push(asset);
    }
  }
  let state = remote.state,
    revision = remote.revision;
  if (local.pending) {
    if (
      (local.cloudRevision ?? 0) !== remote.revision &&
      JSON.stringify(local.state) !== JSON.stringify(remote.state)
    ) {
      withLocalImages(databasePath, (db) => {
        for (const asset of downloads) putLocalImageAsset(db, athleteId, asset);
        writeLocalImages(db, athleteId, local.revision, local.state, {
          cloudRevision: remote.revision,
          pending: true,
          remoteState: remote.state,
        });
      });
      return { status: "conflict" as const };
    }
    if ((local.cloudRevision ?? 0) === remote.revision) {
      for (const id of ids(local.state)) {
        const asset = readLocalImageAsset(databasePath, athleteId, id);
        if (!asset) throw new Error("A pending local image is unavailable");
        await client.putMilestoneImageAsset(token, asset);
      }
      // A failed/ambiguous response deliberately leaves the local outbox pending.
      const published = await client.putMilestoneImages(token, {
        expectedRevision: remote.revision,
        state: local.state,
      });
      state = imageStateSchema.parse(published.state);
      revision = published.revision;
    }
  }
  if (
    !local.pending &&
    local.cloudRevision === revision &&
    JSON.stringify(local.state) === JSON.stringify(state)
  )
    return { status: "current" as const };
  withLocalImages(databasePath, (db) => {
    for (const asset of downloads) putLocalImageAsset(db, athleteId, asset);
    writeLocalImages(db, athleteId, local.revision, state, {
      cloudRevision: revision,
      pending: false,
    });
  });
  return { status: "current" as const };
}
