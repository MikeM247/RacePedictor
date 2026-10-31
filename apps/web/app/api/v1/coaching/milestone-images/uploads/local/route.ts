import { withSensitiveRoute } from "../../../../_security.ts";
import {
  success,
  ApiHttpError,
} from "../../../../../../../lib/server/api-response.ts";
import { assertMilestoneHomeEnabled } from "../../../../../../../lib/server/milestone-home-feature.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import {
  normalizeMilestoneImage,
  readBoundedImage,
  storeImage,
} from "../../../../../../../lib/server/milestone-images.ts";
export const POST = withSensitiveRoute(
  async (security, request) => {
    assertMilestoneHomeEnabled();
    if (security.mode !== "local")
      throw new ApiHttpError(
        400,
        "VALIDATION_ERROR",
        "Use cloud image staging",
      );
    const asset = await normalizeMilestoneImage(
      await readBoundedImage(request),
    );
    await storeImage(security, asset);
    return success({ id: asset.id, width: asset.width, height: asset.height });
  },
  { cloudHandling: "actor-scoped" },
);
