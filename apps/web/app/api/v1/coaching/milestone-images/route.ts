import { withSensitiveRoute } from "../../_security.ts";
import { success } from "../../../../../lib/server/api-response.ts";
import { assertMilestoneHomeEnabled } from "../../../../../lib/server/milestone-home-feature.ts";
import {
  readImages,
  saveImages,
} from "../../../../../lib/server/milestone-images.ts";
import { imageOperation } from "../../../../../lib/server/milestone-image-observability.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withSensitiveRoute(
  async (security) => {
    assertMilestoneHomeEnabled();
    return success(await readImages(security));
  },
  { cloudHandling: "actor-scoped" },
);
export const PUT = withSensitiveRoute(
  async (security, request) => {
    assertMilestoneHomeEnabled();
    const body = await request.json();
    return success(
      await imageOperation("assign", () => saveImages(security, body)),
    );
  },
  { cloudHandling: "actor-scoped" },
);
