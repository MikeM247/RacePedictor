import { withDeviceRoute } from "../../../../../../../../lib/server/device-route-security.ts";
import { assertMilestoneHomeEnabled } from "../../../../../../../../lib/server/milestone-home-feature.ts";
import { deviceImageAsset } from "../../../../../../../../lib/server/milestone-image-sync.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withDeviceRoute(
  async (
    device,
    _request,
    context: {
      params: Promise<{
        id: string;
      }>;
    },
  ) => {
    assertMilestoneHomeEnabled();
    const asset = await deviceImageAsset(device, (await context.params).id);
    return asset
      ? new Response(Buffer.from(asset.bytes), {
          headers: {
            "content-type": "image/webp",
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "x-image-width": String(asset.width),
            "x-image-height": String(asset.height),
          },
        })
      : new Response(null, { status: 404 });
  },
);
