import { withSensitiveRoute } from "../../../_security.ts";
import {
  mutateMilestones,
  readMilestoneReviews,
} from "../../../../../../lib/server/milestone-timeline.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withSensitiveRoute(
  async (security) =>
    Response.json(
      { data: await readMilestoneReviews(security) },
      { headers: { "Cache-Control": "private, no-store" } },
    ),
  { cloudHandling: "actor-scoped" },
);

export const POST = withSensitiveRoute(
  async (security, request) => {
    const body = await request.json().catch(() => null);
    return Response.json(
      {
        data: await mutateMilestones(security, {
          ...body,
          operation: "review",
        }),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { cloudHandling: "actor-scoped" },
);
