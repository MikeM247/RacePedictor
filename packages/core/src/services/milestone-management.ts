import { z } from "zod";
import { goalContextGoalSchema, goalContextPlanReferenceSchema, raceMilestoneSchema, type GoalContextRouteData, type RaceMilestone } from "../contracts/coaching.ts";

export function milestoneDurationSeconds(value: string): number | undefined {
  if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value)) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.slice(1).some((part) => part > 59)) return undefined;
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return seconds > 0 && seconds <= 604800 ? seconds : undefined;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const milestoneChangeRequestSchema = z.object({
  schema: z.literal("milestone-change-request.v1"),
  athleteId: z.string().trim().min(1),
  basePlan: goalContextPlanReferenceSchema,
  baseGoal: goalContextGoalSchema,
  baseMilestones: z.array(raceMilestoneSchema).max(12),
  operation: z.enum(["add", "edit", "remove"]),
  milestoneId: z.string().trim().min(1).max(128),
  milestones: z.array(raceMilestoneSchema).max(12),
}).strict().superRefine((request, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (request.athleteId !== request.baseGoal.athleteId || request.baseGoal.target.kind !== "performance") {
    issue("A milestone change requires this athlete's approved performance goal.");
    return;
  }
  const goalDate = request.baseGoal.target.targetDate;
  for (const list of [request.baseMilestones, request.milestones]) {
    if (new Set(list.map((item) => item.id)).size !== list.length) issue("Milestone IDs must be unique.");
    if (new Set(list.map((item) => item.targetDate)).size !== list.length) issue("Another milestone already uses that date.");
    if (list.some((item) => item.targetDate > goalDate)) issue("Milestones must be on or before the primary goal date.");
    if (list.some((item) => item.id === request.baseGoal.id)) issue("Manage the primary goal through Plan, not as an intermediate milestone.");
  }
  const previous = request.baseMilestones.find((item) => item.id === request.milestoneId);
  const next = request.milestones.find((item) => item.id === request.milestoneId);
  if (request.operation === "add" ? previous || !next : !previous || (request.operation === "edit" ? !next : next)) issue("The selected milestone does not match this change.");
  const unchangedBefore = request.baseMilestones.filter((item) => item.id !== request.milestoneId);
  const unchangedAfter = request.milestones.filter((item) => item.id !== request.milestoneId);
  if (!same(unchangedBefore, unchangedAfter)) issue("A request must preserve all other approved milestones.");
});

export type MilestoneChangeRequest = z.infer<typeof milestoneChangeRequestSchema>;
export type MilestoneChange = { operation: "add" | "edit"; milestone: RaceMilestone } | { operation: "remove"; milestoneId: string };

export function prepareMilestoneChange(context: GoalContextRouteData | null, change: MilestoneChange): MilestoneChangeRequest {
  if (context?.state !== "ready" || !context.plan || !context.goal || context.milestones === null || context.goal.target.kind !== "performance") {
    throw new Error("Load a verified approved performance plan before changing race targets.");
  }
  const id = change.operation === "remove" ? change.milestoneId : change.milestone.id;
  const milestones = change.operation === "add" ? [...context.milestones, change.milestone]
    : change.operation === "edit" ? context.milestones.map((item) => item.id === id ? change.milestone : item)
      : context.milestones.filter((item) => item.id !== id);
  return milestoneChangeRequestSchema.parse({ schema: "milestone-change-request.v1", athleteId: context.goal.athleteId,
    basePlan: context.plan, baseGoal: context.goal, baseMilestones: context.milestones, operation: change.operation, milestoneId: id, milestones });
}

export function milestoneChangeIsCurrent(request: MilestoneChangeRequest, context: GoalContextRouteData | null): boolean {
  if (context?.state !== "ready" || !context.plan || !context.goal || context.milestones === null) return false;
  return request.athleteId === context.goal.athleteId
    && same(request.basePlan, goalContextPlanReferenceSchema.parse(context.plan))
    && same(request.baseGoal, goalContextGoalSchema.parse(context.goal))
    && same(request.baseMilestones, context.milestones.map((item) => raceMilestoneSchema.parse(item)));
}

export function milestoneChangeLabel(request: MilestoneChangeRequest): string {
  const milestone = [...request.milestones, ...request.baseMilestones].find((item) => item.id === request.milestoneId);
  return `${request.operation === "add" ? "Add" : request.operation === "edit" ? "Update" : "Remove"} “${milestone?.eventName || milestone?.title || "milestone"}”`;
}

export function milestoneChangeInstructions(request: MilestoneChangeRequest): string {
  return [
    "Prepare a complete coaching-plan-proposal.v2 using docs/GOAL_UPDATE_PROCESS.md, current coaching context, the current approved plan and owner-selected Second Brain evidence.",
    `Requested change: ${milestoneChangeLabel(request)}. Athlete: ${request.athleteId}.`,
    `Base plan: ${request.basePlan.id}, version ${request.basePlan.version}, revision ${request.basePlan.revision}, approval hash ${request.basePlan.approvalContentHash}. Recheck this base on the planning device; stop and review if it has changed.`,
    "Preserve the approved primary goal. The requested complete intermediate-milestone list is below; do not replace it with a milestone-only patch. Explain the training implications and any material session changes.",
    JSON.stringify({ primaryGoal: request.baseGoal, milestones: request.milestones }, null, 2),
    "This is an unapproved request, not a proposal or active plan. Import, explicit owner review/approval and verified publication are still required. Do not approve or publish automatically.",
  ].join("\n\n");
}
