import { withSensitiveRoute } from "../../_security.ts";
import { withCoachingService, success } from "../../coaching/_shared.ts";
import { raceHistoryActor } from "../../../../../lib/server/race-history.ts";
import { appearanceImageUrl, prepareHeroImage, readCloudAppearance, readLocalAppearance, saveCloudAppearance, saveLocalAppearance } from "../../../../../lib/server/dashboard-appearance.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(async (security) => {
  if (security.mode === "authenticated") return success({ heroImageUrl: appearanceImageUrl(await readCloudAppearance(raceHistoryActor(security))) });
  return withCoachingService((service) => ({ heroImageUrl: appearanceImageUrl(readLocalAppearance(service.databasePath, service.athleteId)) }));
}, { cloudHandling: "actor-scoped" });

export const PUT = withSensitiveRoute(async (security, request) => {
  const athleteId = security.mode === "authenticated" ? raceHistoryActor(security, true) : null;
  const appearance = await prepareHeroImage(request);
  if (athleteId) { await saveCloudAppearance(athleteId, appearance); return success({ heroImageUrl: appearanceImageUrl(appearance) }); }
  return withCoachingService((service) => { saveLocalAppearance(service.databasePath, service.athleteId, appearance); return { heroImageUrl: appearanceImageUrl(appearance) }; });
}, { cloudHandling: "actor-scoped" });

export const DELETE = withSensitiveRoute(async (security) => {
  if (security.mode === "authenticated") { await saveCloudAppearance(raceHistoryActor(security, true), null); return success({ heroImageUrl: appearanceImageUrl(null) }); }
  return withCoachingService((service) => { saveLocalAppearance(service.databasePath, service.athleteId, null); return { heroImageUrl: appearanceImageUrl(null) }; });
}, { cloudHandling: "actor-scoped" });
