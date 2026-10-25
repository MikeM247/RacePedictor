import { handleCoachArchive, withCoachRoute } from "../../../../../../../lib/server/coach-chat-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = withCoachRoute((security, request) => handleCoachArchive(security, request));
