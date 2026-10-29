import { handleCoachDiscard, withCoachRoute } from "../../../../../../../lib/server/coach-chat-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = withCoachRoute((security, request) => handleCoachDiscard(security, request));
