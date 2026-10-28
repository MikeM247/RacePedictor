import { handleCoachVoiceCapabilities, withCoachRoute } from "../../../../../../lib/server/coach-voice-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCoachRoute((security) => handleCoachVoiceCapabilities(security));
