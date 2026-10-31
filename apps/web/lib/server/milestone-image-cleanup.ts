import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/prisma-client.js";
import { milestoneStagingStore } from "./milestone-image-uploads.ts";
import { milestoneHomeEnabled } from "./milestone-home-feature.ts";
export async function cleanupCloudMilestoneImages(now = new Date()) {
  if (!milestoneHomeEnabled()) return { skipped: true };
  const prisma = getCloudPrismaClient();
  const expired = await prisma.milestoneImageUpload.findMany({
    where: { expiresAt: { lt: now } },
    take: 100,
  });
  if (expired.length) {
    const { client, bucket } = milestoneStagingStore();
    for (const upload of expired) {
      const expected = `athletes/${upload.athleteId}/milestone-images/staging/${upload.id}`;
      if (upload.storageKey !== expected)
        throw new Error("Image staging key is invalid");
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: upload.storageKey }),
      );
      await prisma.milestoneImageUpload.delete({ where: { id: upload.id } });
    }
  }
  const cutoff = new Date(now.getTime() - 30 * 86400000);
  const deleted = await prisma.$transaction(
    (tx) =>
      tx.$executeRawUnsafe(
        `DELETE FROM milestone_image_assets a WHERE a."createdAt" < $1 AND NOT EXISTS (SELECT 1 FROM milestone_image_state s, jsonb_array_elements(s.state->'bindings') b WHERE s."athleteId"=a."athleteId" AND b->'choice'->>'kind'='upload' AND b->'choice'->>'id'=a.id)`,
        cutoff,
      ),
    { isolationLevel: "Serializable" },
  );
  console.info("milestone_image_cleanup", {
    staging: expired.length,
    assets: deleted,
  });
  return { staging: expired.length, assets: deleted };
}
