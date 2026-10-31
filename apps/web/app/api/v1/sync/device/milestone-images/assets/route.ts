import { withDeviceRoute } from "../../../../../../../lib/server/device-route-security.ts";
import { assertMilestoneHomeEnabled } from "../../../../../../../lib/server/milestone-home-feature.ts";
import {
  success,
  ApiHttpError,
} from "../../../../../../../lib/server/api-response.ts";
import { acceptDeviceImageAsset } from "../../../../../../../lib/server/milestone-image-sync.ts";
export const runtime = "nodejs";
export const POST = withDeviceRoute(async (device, request) => {
  assertMilestoneHomeEnabled();
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Image required");
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 710000) {
      await reader.cancel();
      throw new ApiHttpError(
        413,
        "VALIDATION_ERROR",
        "Image transfer too large",
      );
    }
    parts.push(value);
  }
  return success(
    await acceptDeviceImageAsset(
      device,
      JSON.parse(Buffer.concat(parts).toString("utf8")),
    ),
  );
});
