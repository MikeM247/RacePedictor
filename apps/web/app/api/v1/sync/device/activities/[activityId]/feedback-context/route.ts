import { withDeviceRoute } from "../../../../../../../../lib/server/device-route-security.ts";
import { handleActivityFeedbackContext } from "../../../../../../../../lib/server/device-sync-handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withDeviceRoute((security, _request, context: { params: Promise<{ activityId: string }> }) =>
  context.params.then(({ activityId }) => handleActivityFeedbackContext(security, activityId)));
