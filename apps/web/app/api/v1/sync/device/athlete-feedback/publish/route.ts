import { withDeviceRoute } from "../../../../../../../lib/server/device-route-security.ts";
import { handlePublishAthleteFeedback } from "../../../../../../../lib/server/device-sync-handlers.ts";

export const dynamic = "force-dynamic";

export const POST = withDeviceRoute((security, request) => handlePublishAthleteFeedback(security, request));
