import { proposalDecisionRequestSchema } from "../../../../../../../../../packages/core/src/contracts/coaching.ts";
import { withSensitiveRoute } from "../../../../_security.ts";
import { CoachingHttpError, readJson, withCoachingService } from "../../../_shared.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ proposalId: string }> };
async function decideProposal(request: Request, context: RouteContext) {
  const body = await readJson(request).catch((error) => error);
  const { proposalId: encoded } = await context.params;
  return withCoachingService((service) => {
    if (body instanceof Error) throw body;
    const proposalId = decodeURIComponent(encoded).trim();
    if (!proposalId) throw new CoachingHttpError(400, "VALIDATION_ERROR", "proposalId is required");
    const input = proposalDecisionRequestSchema.parse(body);
    if (input.decision === "reject") {
      const proposal = service.rejectPlanProposal({
        planId: proposalId,
        expectedRevision: input.expectedRevision,
        reason: "Rejected by user",
      });
      return { proposalId, decision: "reject", proposal, plan: service.getActivePlan() };
    }
    const plan = service.activatePlan({
      planId: proposalId,
      expectedRevision: input.expectedRevision,
      approvedByUser: true,
      replacingPlanId: input.replacingPlanId,
      acknowledgeStale: input.acknowledgeStale,
    });
    return { proposalId, decision: "approve", goal: service.getSettledGoal(), plan, activePlan: plan };
  });
}

export const POST = withSensitiveRoute((_security, request, context: RouteContext) => (
  decideProposal(request, context)
));
