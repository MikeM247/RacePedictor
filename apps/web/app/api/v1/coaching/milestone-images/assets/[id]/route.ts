import { withSensitiveRoute } from "../../../../_security.ts";
import { assertMilestoneHomeEnabled } from "../../../../../../../lib/server/milestone-home-feature.ts";
import { readImageAsset } from "../../../../../../../lib/server/milestone-images.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withSensitiveRoute(
  async (
    security,
    _request,
    context: {
      params: Promise<{
        id: string;
      }>;
    },
  ) => {
    assertMilestoneHomeEnabled();
    const asset = await readImageAsset(security, (await context.params).id);
    return asset
      ? new Response(Buffer.from(asset.bytes), {
          headers: {
            "content-type": "image/webp",
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        })
      : new Response(null, { status: 404 });
  },
  { cloudHandling: "actor-scoped" },
);
