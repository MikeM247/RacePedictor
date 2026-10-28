import { handleCoachRunReviewFollowup, withCoachRoute } from "../../../../../../lib/server/coach-chat-handlers.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

export const POST = withCoachRoute((security, request) => handleCoachRunReviewFollowup(security, request));
