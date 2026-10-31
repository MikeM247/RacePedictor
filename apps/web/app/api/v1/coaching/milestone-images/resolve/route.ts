import { z } from "zod";
import { withSensitiveRoute } from "../../../_security.ts";
import { assertMilestoneHomeEnabled } from "../../../../../../lib/server/milestone-home-feature.ts";
import {
  success,
  ApiHttpError,
} from "../../../../../../lib/server/api-response.ts";
import { createLocalCoachingService } from "../../../../../../lib/local-coaching-service.ts";
import {
  readLocalImages,
  writeLocalImages,
  withLocalImages,
  ImageRevisionConflict,
} from "../../../../../../../../packages/db/src/milestone-images.ts";
import { toImageView, imageSourceVersion } from "../../../../../../lib/server/milestone-images.ts";
import { readMilestones } from "../../../../../../lib/server/milestone-timeline.ts";
export const runtime = "nodejs";
export const POST = withSensitiveRoute(
  async (security, request) => {
    assertMilestoneHomeEnabled();
    if (security.mode !== "local")
      throw new ApiHttpError(
        400,
        "VALIDATION_ERROR",
        "Resolve paired-device conflicts in local Settings",
      );
    const parsed = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        use: z.enum(["local", "remote"]),
      })
      .strict()
      .safeParse(await request.json());
    if (!parsed.success)
      throw new ApiHttpError(
        400,
        "VALIDATION_ERROR",
        "Choose the images to retain",
      );
    const timeline = await readMilestones(security),
      service = createLocalCoachingService({
        athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001",
      });
    try {
      return success(
        withLocalImages(service.databasePath, (db) => {
          const current = readLocalImages(
            service.databasePath,
            service.athleteId,
            db,
          );
          if (
            current.revision !== parsed.data.expectedRevision ||
            !current.remoteState
          )
            throw new ImageRevisionConflict();
          const next = writeLocalImages(
            db,
            service.athleteId,
            current.revision,
            parsed.data.use === "local" ? current.state : current.remoteState,
            {
              cloudRevision: current.cloudRevision,
              pending: parsed.data.use === "local",
            },
          );
          return toImageView(next, imageSourceVersion(timeline), false);
        }),
      );
    } catch (error) {
      if (error instanceof ImageRevisionConflict)
        throw new ApiHttpError(409, "CONFLICT", error.message);
      throw error;
    } finally {
      service.close();
    }
  },
  { cloudHandling: "actor-scoped" },
);
