import { withDeviceRoute } from "../../../../../../../lib/server/device-route-security.ts";
import { publishPaceComparison } from "../../../../../../../lib/server/pace-comparison-handlers.ts";
export const dynamic = "force-dynamic";
export const POST = withDeviceRoute((security, request) => publishPaceComparison(security, request));
