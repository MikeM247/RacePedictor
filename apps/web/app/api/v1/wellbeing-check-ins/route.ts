import { withSensitiveRoute } from "../../../../lib/server/route-security.ts";
import { handleCloudWellbeingList } from "../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(async (security, request: Request) => handleCloudWellbeingList(security, request), { cloudHandling: "actor-scoped" });
