import { withDeviceRoute } from "../../../../../../lib/server/device-route-security.ts";
import { handleDeviceChanges } from "../../../../../../lib/server/device-sync-handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withDeviceRoute((security, request) => handleDeviceChanges(security, request));
