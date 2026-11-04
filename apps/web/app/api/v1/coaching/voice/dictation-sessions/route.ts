import { handleCoachProgressiveSessionCreate, withCoachRoute } from "../../../../../../lib/server/coach-voice-handlers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withCoachRoute((security, request) => handleCoachProgressiveSessionCreate(security, request));
