import { withDeviceRoute } from "../../../../../../lib/server/device-route-security.ts";
import { handleClaimActivityReviews } from "../../../../../../lib/server/device-sync-handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withDeviceRoute((security, request) => handleClaimActivityReviews(security, request));
