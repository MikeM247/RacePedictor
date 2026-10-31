import { withSensitiveRoute } from "../../../../_security.ts";
import {
  success,
  ApiHttpError,
} from "../../../../../../../lib/server/api-response.ts";
import { assertMilestoneHomeEnabled } from "../../../../../../../lib/server/milestone-home-feature.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { initiateImageUpload } from "../../../../../../../lib/server/milestone-image-uploads.ts";
export const POST = withSensitiveRoute(
  async (security, request) => {
    assertMilestoneHomeEnabled();
    return success(await initiateImageUpload(security, await request.json()));
  },
  { cloudHandling: "actor-scoped" },
);
