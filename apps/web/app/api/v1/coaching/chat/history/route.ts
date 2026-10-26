import { handleCoachHistory, withCoachRoute } from "../../../../../../lib/server/coach-chat-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = withCoachRoute((security, request) => handleCoachHistory(security, request));
