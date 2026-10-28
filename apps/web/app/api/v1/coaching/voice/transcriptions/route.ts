import { handleCoachVoiceTranscription, withCoachRoute } from "../../../../../../lib/server/coach-voice-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 25;

export const POST = withCoachRoute((security, request) => handleCoachVoiceTranscription(security, request));
