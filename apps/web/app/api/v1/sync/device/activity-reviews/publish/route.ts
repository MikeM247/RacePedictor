import { withDeviceRoute } from "../../../../../../../lib/server/device-route-security.ts";
import { handlePublishActivityReview } from "../../../../../../../lib/server/device-sync-handlers.ts";

export const dynamic = "force-dynamic";

export const POST = withDeviceRoute((security, request) => handlePublishActivityReview(security, request));
