import { createHash, randomUUID } from "node:crypto";
import { milestoneMutationSchema, milestoneTimelineSchema, type MilestoneTimeline, type MilestoneMutation } from "../../../../packages/core/src/contracts/milestone-timeline.ts";
import { goalContextApiResponseSchema, type GoalContextRouteData } from "../../../../packages/core/src/contracts/coaching.ts";
import type { RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import { changeMilestoneState, composeMilestoneTimeline, MilestoneChangeError } from "../../../../packages/core/src/services/milestone-timeline.ts";
import { readCloudMilestoneState, readLocalMilestoneState, writeCloudMilestoneState, writeLocalMilestoneState, withLocalMilestoneTransaction, MilestoneRevisionConflict, type TimelineStateRecord } from "../../../../packages/db/src/milestone-timeline.ts";
import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/prisma-client.js";
import { createLocalCoachingService } from "../local-coaching-service.ts";
import { readCloudRaceHistory, readLocalRaceHistory, raceHistoryActor } from "./race-history.ts";
import { handleCloudActiveGoalContext } from "./cloud-read-handlers.ts";
import { createCloudReadComposition } from "./cloud-read-composition.ts";
import { localDateInTimezone } from "../coaching-ui-state.ts";
import { ApiHttpError } from "./api-response.ts";
import type { SensitiveRouteContext } from "./route-security.ts";

type Sources = { context: GoalContextRouteData | null; history: RaceHistoryRecord[]; availability: { goal: boolean; history: boolean } };
export function milestoneSourceVersion(sources: Sources) { return createHash("sha256").update(JSON.stringify(sources)).digest("hex"); }
export function milestoneView(sources: Sources, record: TimelineStateRecord, now = new Date()): MilestoneTimeline {
  const today = localDateInTimezone(sources.context?.plan?.timezone ?? "Africa/Johannesburg", now);
  return milestoneTimelineSchema.parse({ ...sources, revision: record.revision, sourceVersion: milestoneSourceVersion(sources), today,
    ...composeMilestoneTimeline(sources.context, sources.history, record.state, today) });
}
export function verifyMilestoneChange(change: MilestoneMutation, view: MilestoneTimeline) {
  if (!view.availability.goal || !view.availability.history) throw new ApiHttpError(503, "UNAVAILABLE", "Milestone sources could not be verified. Retry before making changes.");
  if (change.expectedRevision !== view.revision || change.sourceVersion !== view.sourceVersion) {
    throw new ApiHttpError(409, "CONFLICT", "Milestones or their source records changed. Reload and review before deciding again.");
  }
}

async function cloudSources(security: SensitiveRouteContext, sql = getCloudPrismaClient()): Promise<Sources> {
  const athleteId = raceHistoryActor(security);
  const [goal, history] = await Promise.allSettled([
    handleCloudActiveGoalContext(security, () => createCloudReadComposition(sql)).then(async (response) => goalContextApiResponseSchema.parse(await response.json()).data.context),
    readCloudRaceHistory(athleteId, sql),
  ]);
  const context = goal.status === "fulfilled" ? goal.value : null;
  return { context, history: history.status === "fulfilled" ? history.value : [], availability: {
    goal: context !== null && context.state !== "unavailable" && context.state !== "projection_pending", history: history.status === "fulfilled",
  } };
}
function localSources(service: ReturnType<typeof createLocalCoachingService>): Sources {
  let context: GoalContextRouteData | null = null;
  let history: RaceHistoryRecord[] = [];
  let historyAvailable = true;
  try { context = service.getActiveGoalContext(); } catch { /* unavailable, never invent targets */ }
  try { history = readLocalRaceHistory(service.databasePath, service.athleteId); } catch { historyAvailable = false; }
  return { context, history, availability: { goal: context !== null && context.state !== "unavailable" && context.state !== "projection_pending", history: historyAvailable } };
}

export async function readMilestones(security: SensitiveRouteContext): Promise<MilestoneTimeline> {
  if (security.mode === "authenticated") {
    const athleteId = raceHistoryActor(security);
    return getCloudPrismaClient().$transaction(async (tx) => {
      const [sources, state] = await Promise.all([cloudSources(security, tx as ReturnType<typeof getCloudPrismaClient>), readCloudMilestoneState(athleteId, tx)]);
      return milestoneView(sources, state);
    }, { isolationLevel: "RepeatableRead" });
  }
  const service = createLocalCoachingService({ athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001" });
  try { return milestoneView(localSources(service), readLocalMilestoneState(service.databasePath, service.athleteId)); }
  finally { service.close(); }
}

export async function mutateMilestones(security: SensitiveRouteContext, raw: unknown) {
  const parsed = milestoneMutationSchema.safeParse(raw);
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "The milestone change is invalid", parsed.error.issues);
  const change = parsed.data;
  const now = new Date();
  const update = (sources: Sources, current: TimelineStateRecord) => {
    const view = milestoneView(sources, current, now);
    verifyMilestoneChange(change, view);
    return changeMilestoneState({ ...sources, state: current.state, change, today: view.today, now: now.toISOString(), removalId: randomUUID() });
  };
  try {
    let result: MilestoneTimeline;
    if (security.mode === "authenticated") {
      const athleteId = raceHistoryActor(security, true);
      result = await getCloudPrismaClient().$transaction(async (tx) => {
        const sources = await cloudSources(security, tx as ReturnType<typeof getCloudPrismaClient>);
        const current = await readCloudMilestoneState(athleteId, tx);
        const next = await writeCloudMilestoneState(athleteId, current.revision, update(sources, current), tx);
        const refreshed = await cloudSources(security, tx as ReturnType<typeof getCloudPrismaClient>);
        if (milestoneSourceVersion(refreshed) !== milestoneSourceVersion(sources)) throw new MilestoneRevisionConflict("Source records changed. Reload before deciding again.");
        return milestoneView(sources, next, now);
      }, { isolationLevel: "Serializable" });
    } else {
      const service = createLocalCoachingService({ athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001" });
      try {
        result = withLocalMilestoneTransaction(service.databasePath, (db) => {
          const sources = localSources(service);
          const current = readLocalMilestoneState(service.databasePath, service.athleteId, db);
          return milestoneView(sources, writeLocalMilestoneState(db, service.athleteId, current.revision, update(sources, current)), now);
        });
      } finally { service.close(); }
    }
    console.info("milestone_change", { operation: change.operation, revision: result.revision, status: "saved" });
    return result;
  } catch (error) {
    console.warn("milestone_change", { operation: change.operation, status: "failed" });
    if (error instanceof MilestoneRevisionConflict || error && typeof error === "object" && "code" in error && error.code === "P2034") throw new ApiHttpError(409, "CONFLICT", "Milestones changed. Reload and review before trying again.");
    if (error instanceof MilestoneChangeError) throw new ApiHttpError(error.code === "CONFLICT" ? 409 : 400, error.code, error.message);
    throw error;
  }
}
