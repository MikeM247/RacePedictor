import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { planProposalV2Schema, raceMilestoneSchema } from "../../../packages/core/src/contracts/coaching.ts";
import { calculatePlanProposalContentHash, LocalCoachingService } from "../lib/local-coaching-service.ts";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const structurePath = argument("--goal-structure");
if (!structurePath) throw new Error("Expected --goal-structure <path>");

const service = new LocalCoachingService();
try {
  const activePlan = service.getActivePlan();
  const settledGoal = service.getSettledGoal();
  if (!activePlan || !settledGoal) throw new Error("An active plan and settled goal are required");

  const raw = JSON.parse(await readFile(path.resolve(structurePath), "utf8")) as Record<string, unknown>;
  if (raw.primaryGoalId !== settledGoal.id) throw new Error("Structured primary goal must match the settled goal");
  const milestones = raceMilestoneSchema.array().max(12).parse(raw.milestones);
  const context = await service.publishCoachingContext();
  const { approval } = activePlan;
  const { status: _goalStatus, settledAt: _settledAt, settledBy: _settledBy, ...goalBody } = settledGoal;
  const sessionIds = new Map(activePlan.workouts.map((workout) => [workout.id, `session_${randomUUID()}`]));
  const candidate = {
    id: `proposal_goal_structure_${randomUUID()}`,
    athleteId: activePlan.athleteId,
    goalId: activePlan.goalId,
    goalRevision: activePlan.goalRevision,
    routineRevision: activePlan.routineRevision,
    version: activePlan.version + 1,
    revision: 1,
    startsOn: activePlan.startsOn,
    endsOn: activePlan.endsOn,
    timezone: activePlan.timezone,
    weeklyStructure: activePlan.weeklyStructure.map((week) => ({
      ...week,
      sessionIds: week.sessionIds.map((sessionId) => {
        const replacement = sessionIds.get(sessionId);
        if (!replacement) throw new Error(`Plan week references unknown session ${sessionId}`);
        return replacement;
      }),
    })),
    workouts: activePlan.workouts.map((workout) => ({ ...workout, id: sessionIds.get(workout.id)! })),
    createdAt: new Date().toISOString(),
    status: "proposed" as const,
    proposedGoal: { ...goalBody, status: "draft" as const },
    milestones,
    goalRationale: approval.goalRationale,
    rationale: approval.rationale,
    summary: approval.summary,
    assumptions: approval.assumptions,
    cautions: approval.cautions,
    contextArtifactId: context.artifact.id,
    sourceHistoryFingerprint: context.artifact.historyFingerprint,
  };
  const proposal = planProposalV2Schema.parse({
    ...candidate,
    contentHash: calculatePlanProposalContentHash(candidate),
  });
  const outputPath = path.resolve(argument("--output") ?? path.join(service.exchangePath, "coaching-plan-proposal.v2.json"));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ schema: "coaching-plan-proposal.v2", proposal }, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
} finally {
  service.close();
}
