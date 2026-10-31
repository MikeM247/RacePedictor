import { withSensitiveRoute } from "../../../../_security.ts";
import {
  success,
  ApiHttpError,
} from "../../../../../../../lib/server/api-response.ts";
import { assertMilestoneHomeEnabled } from "../../../../../../../lib/server/milestone-home-feature.ts";
import { imageOperation } from "../../../../../../../lib/server/milestone-image-observability.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { finalizeImageUpload } from "../../../../../../../lib/server/milestone-image-uploads.ts";
export const POST = withSensitiveRoute(
  async (security, request) => {
    assertMilestoneHomeEnabled();
    const body = await request.json();
    if (typeof body?.id !== "string" || body.id.length > 100)
      throw new ApiHttpError(
        400,
        "VALIDATION_ERROR",
        "Upload identity is invalid",
      );
    return success(
      await imageOperation("upload", () =>
        finalizeImageUpload(security, body.id),
      ),
    );
  },
  { cloudHandling: "actor-scoped" },
);
