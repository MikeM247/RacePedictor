import { withDeviceRoute } from "../../../../../../lib/server/device-route-security.ts";
import { handleDeviceWellbeing } from "../../../../../../lib/server/device-sync-handlers.ts";

export const dynamic = "force-dynamic";
export const GET = withDeviceRoute((security, request) => handleDeviceWellbeing(security, request));
