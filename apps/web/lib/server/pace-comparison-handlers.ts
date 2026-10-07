import { z } from "zod";
import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import { paceArtifactSchema, paceContextSchema } from "../../../../packages/core/src/contracts/activity-pace-comparison.ts";
import { PaceComparisonError } from "../../../../packages/core/src/services/activity-pace-comparison.ts";
import type { AuthenticatedDevice } from "../../../../packages/core/src/use-cases/paired-device.ts";
import { getCloudPrismaClient, PrismaActivityPaceComparisonRepository } from "../../../../packages/db/src/cloud/index.js";
import { defaultLocalDatabasePath } from "../../../../packages/db/src/local-activities.js";
import { getLocalPaceComparison } from "../../../../packages/db/src/local-activity-pace-comparison.js";
import { ApiHttpError, success } from "./api-response.ts";
import type { SensitiveRouteContext } from "./route-security.ts";
import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("pace-comparison-handlers");
const repository = () => new PrismaActivityPaceComparisonRepository({ prisma: getCloudPrismaClient() });
type Repository = Pick<PrismaActivityPaceComparisonRepository, "read" | "context" | "publish">;
const identifier = z.string().trim().min(1).max(128);
function mapError(error: unknown): never {
  if (error instanceof PaceComparisonError) throw new ApiHttpError(error.code === "INVALID" ? 400 : error.code === "NOT_FOUND" ? 404 : 409, error.code === "INVALID" ? "VALIDATION_ERROR" : error.code, error.message);
  throw error;
}
export async function readPaceComparison(security: SensitiveRouteContext, activityId: string, getRepository: () => Repository = repository) {
  if (!identifier.safeParse(activityId).success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Invalid activity identity");
  try {
    if (process.env.RACEPREDICTOR_PACE_COMPARISONS_ENABLED === "false") return success({ activityId, status: "none", comparison: null });
    const result = security.mode === "authenticated"
      ? await getRepository().read(athleteScopeFor(security.actor), activityId)
      : getLocalPaceComparison({ databasePath: process.env.RACEPREDICTOR_DATABASE_PATH || defaultLocalDatabasePath, athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001", activityId });
    return Response.json(result);
  } catch (error) { mapError(error); }
}
export async function readPaceContext(security: AuthenticatedDevice, request: Request, activityId: string, getRepository: () => Repository = repository) {
  const query = new URL(request.url).searchParams;
  const parsed = z.object({ activityId: identifier, planId: identifier, sessionId: identifier, sessionRevision: z.coerce.number().int().positive().nullable() }).safeParse({ activityId, planId: query.get("planId"), sessionId: query.get("sessionId"), sessionRevision: query.get("sessionRevision") });
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "An explicit plan and session are required");
  try {
    const { planId, sessionId, sessionRevision } = parsed.data;
    return success(paceContextSchema.parse(await getRepository().context(athleteScopeFor(security.actor), activityId, planId, sessionId, sessionRevision)));
  } catch (error) { mapError(error); }
}
export async function publishPaceComparison(security: AuthenticatedDevice, request: Request, getRepository: () => Repository = repository) {
  if (process.env.RACEPREDICTOR_PACE_COMPARISONS_ENABLED === "false") throw new ApiHttpError(503, "UNAVAILABLE", "Comparison publication is disabled");
  const parsed = paceArtifactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Invalid reviewed comparison artifact");
  try { return success({ comparison: await getRepository().publish(athleteScopeFor(security.actor), parsed.data, security.device.id) }, 201); }
  catch (error) { mapError(error); }
}
