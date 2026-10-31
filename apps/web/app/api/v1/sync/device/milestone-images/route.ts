import { withDeviceRoute } from "../../../../../../lib/server/device-route-security.ts";
import { assertMilestoneHomeEnabled } from "../../../../../../lib/server/milestone-home-feature.ts";
import {
  success,
  ApiHttpError,
} from "../../../../../../lib/server/api-response.ts";
import {
  imageManifest,
  acceptImageManifest,
} from "../../../../../../lib/server/milestone-image-sync.ts";
import { imageOperation } from "../../../../../../lib/server/milestone-image-observability.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withDeviceRoute(async (device) => {
  assertMilestoneHomeEnabled();
  return success(await imageManifest(device));
});
export const PUT = withDeviceRoute(async (device, request) => {
  assertMilestoneHomeEnabled();
  const text = await request.text();
  if (text.length > 500000)
    throw new ApiHttpError(413, "VALIDATION_ERROR", "Image state is too large");
  return success(
    await imageOperation("sync", () =>
      acceptImageManifest(device, JSON.parse(text)),
    ),
  );
});
