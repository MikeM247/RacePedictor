import { withSensitiveRoute } from "../../../_security.ts";
import { createLocalCoachingService } from "../../../../../../lib/local-coaching-service.ts";
import { raceHistoryActor } from "../../../../../../lib/server/race-history.ts";
import { readCloudAppearance, readLocalAppearance } from "../../../../../../lib/server/dashboard-appearance.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSensitiveRoute(async (security) => {
  let appearance;
  if (security.mode === "authenticated") appearance = await readCloudAppearance(raceHistoryActor(security));
  else {
    const service = createLocalCoachingService({ athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001" });
    try { appearance = readLocalAppearance(service.databasePath, service.athleteId); }
    finally { service.close(); }
  }
  if (!appearance) return new Response(null, { status: 404 });
  return new Response(Buffer.from(appearance.heroImage), { headers: { "content-type": "image/webp", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}, { cloudHandling: "actor-scoped" });
