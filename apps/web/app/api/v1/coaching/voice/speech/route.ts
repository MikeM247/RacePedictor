import { handleCoachVoiceSpeech, withCoachRoute } from "../../../../../../lib/server/coach-voice-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

export const POST = withCoachRoute((security, request) => handleCoachVoiceSpeech(security, request));
