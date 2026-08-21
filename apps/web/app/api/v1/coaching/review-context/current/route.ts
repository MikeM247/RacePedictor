import { withSensitiveRoute } from "../../../_security.ts";
import { withCoachingService } from "../../_shared.ts";
import { handleCloudCoachingReviewContext } from "../../../../../../lib/server/cloud-read-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withSensitiveRoute((security) => security.mode === "authenticated"
  ? handleCloudCoachingReviewContext(security)
  : withCoachingService(async (service) => ({ context: await service.getCurrentReviewContext() })), {
  cloudHandling: "actor-scoped",
});
