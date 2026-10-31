import { withSensitiveRoute } from "../../_security.ts";
import { success } from "../../../../../lib/server/api-response.ts";
import { readHomeTraining } from "../../../../../lib/server/home-training.ts";
import { assertMilestoneHomeEnabled } from "../../../../../lib/server/milestone-home-feature.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withSensitiveRoute(
  async (security) => {
    assertMilestoneHomeEnabled();
    return success(await readHomeTraining(security));
  },
  { cloudHandling: "actor-scoped" },
);
