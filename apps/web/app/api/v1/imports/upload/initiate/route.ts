import { handleCloudUploadInitiate } from "../../../../../../lib/server/activity-import-handlers.ts";
import { withSensitiveRoute } from "../../../../../../lib/server/route-security.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = withSensitiveRoute((security, request) => handleCloudUploadInitiate(security, request), { cloudHandling: "actor-scoped" });
