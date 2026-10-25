import { withSensitiveRoute } from "../../../../../lib/server/route-security.ts";
import { getCoachAiModels } from "../../../../../lib/server/coach-ai-routes.ts";
export const GET = withSensitiveRoute((security, request) => getCoachAiModels(security, request), { cloudHandling: "actor-scoped" });
