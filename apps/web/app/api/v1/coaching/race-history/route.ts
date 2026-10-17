import { withSensitiveRoute } from "../../_security.ts";
import { withCoachingService, success } from "../_shared.ts";
import { readCloudRaceHistory, readLocalRaceHistory, saveCloudRaceHistory, saveLocalRaceHistory, deleteCloudRaceHistory, deleteLocalRaceHistory, raceHistoryActor, captureApprovedRaceTarget } from "../../../../../lib/server/race-history.ts";
import { handleCloudActiveGoalContext } from "../../../../../lib/server/cloud-read-handlers.ts";
import { goalContextApiResponseSchema } from "../../../../../../../packages/core/src/contracts/coaching.ts";
import { ApiHttpError } from "../../../../../lib/server/api-response.ts";
import { saveRaceHistorySchema } from "../../../../../../../packages/core/src/contracts/race-history.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withSensitiveRoute(async (security) => {
  if (security.mode === "authenticated") return success({ items: await readCloudRaceHistory(raceHistoryActor(security)), publishedAt: null });
  return withCoachingService((service) => ({ items: readLocalRaceHistory(service.databasePath, service.athleteId), publishedAt: null }));
}, { cloudHandling: "actor-scoped" });

export const PUT = withSensitiveRoute(async (security, request) => {
  const input = saveRaceHistorySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "The race result is invalid", input.error.issues);
  if (security.mode === "authenticated") {
    const athleteId = raceHistoryActor(security, true);
    const [history, response] = await Promise.all([readCloudRaceHistory(athleteId), input.data.record.targetId ? handleCloudActiveGoalContext(security) : Promise.resolve(null)]);
    const context = response ? goalContextApiResponseSchema.parse(await response.json()).data.context : null;
    return success(await saveCloudRaceHistory(athleteId, { ...input.data, record: captureApprovedRaceTarget(input.data.record, context, history) }));
  }
  return withCoachingService((service) => saveLocalRaceHistory(service.databasePath, service.athleteId, {
    ...input.data, record: captureApprovedRaceTarget(input.data.record, input.data.record.targetId ? service.getActiveGoalContext() : null, readLocalRaceHistory(service.databasePath, service.athleteId)),
  }));
}, { cloudHandling: "actor-scoped" });

export const DELETE = withSensitiveRoute(async (security, request) => {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const revision = Number(params.get("revision"));
  if (!id || id.length > 128 || !Number.isSafeInteger(revision) || revision < 1) throw new ApiHttpError(400, "VALIDATION_ERROR", "An achievement ID and revision are required");
  if (security.mode === "authenticated") { await deleteCloudRaceHistory(raceHistoryActor(security, true), id, revision); return success({ deleted: true }); }
  return withCoachingService((service) => { deleteLocalRaceHistory(service.databasePath, service.athleteId, id, revision); return { deleted: true }; });
}, { cloudHandling: "actor-scoped" });
