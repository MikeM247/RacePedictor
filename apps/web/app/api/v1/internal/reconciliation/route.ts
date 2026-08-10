import { withInternalRoute } from "../../../../../lib/server/internal-route-security.ts";
import { handleScheduledReconciliation } from "../../../../../lib/server/operational-handlers.ts";

export const dynamic = "force-dynamic";

// Vercel Cron invokes configured paths with GET. POST remains available for a
// deliberate operator-triggered recovery using the same bearer boundary.
export const GET = withInternalRoute((request) => handleScheduledReconciliation(request));
export const POST = GET;
