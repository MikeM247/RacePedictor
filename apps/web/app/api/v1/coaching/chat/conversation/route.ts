import { handleClearCoachHistory, handleCoachConversation, withCoachRoute } from "../../../../../../lib/server/coach-chat-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

export const GET = withCoachRoute((security, request) => handleCoachConversation(security, request));
export const DELETE = withCoachRoute((security, request) => handleClearCoachHistory(security, request));
