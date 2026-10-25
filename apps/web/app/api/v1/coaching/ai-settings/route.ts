import { withSensitiveRoute } from "../../../../../lib/server/route-security.ts";
import { getCoachAiSettings, saveCoachAiSettings } from "../../../../../lib/server/coach-ai-routes.ts";
export const GET = withSensitiveRoute((security) => getCoachAiSettings(security), { cloudHandling: "actor-scoped" });
export const PUT = withSensitiveRoute((security, request) => saveCoachAiSettings(security, request), { cloudHandling: "actor-scoped" });
