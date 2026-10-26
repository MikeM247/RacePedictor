import { coachAiSettingsUpdateSchema } from "../../../../packages/core/src/contracts/activity-review.ts";
import { CoachAiConfigurationConflictError, PrismaCoachAiConfigurationRepository } from "../../../../packages/db/src/cloud/prisma-coach-ai-configuration-repository.js";
import { ApiHttpError, success } from "./api-response.ts";
import { getCloudPrismaClient } from "../../../../packages/db/src/cloud/prisma-client.js";
import type { SensitiveRouteContext } from "./route-security.ts";
import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import { getCoachModels } from "./coach-ai-model-catalog.ts";

function ownerScope(security: SensitiveRouteContext) {
  if (security.mode !== "authenticated" || security.actor.credentialKind !== "session") throw new ApiHttpError(403, "FORBIDDEN", "A signed-in owner session is required");
  return athleteScopeFor(security.actor);
}
function repository() { return new PrismaCoachAiConfigurationRepository({ prisma: getCloudPrismaClient() }); }

export async function getCoachAiSettings(security: SensitiveRouteContext) {
  return success(await repository().get(ownerScope(security)));
}
export async function saveCoachAiSettings(security: SensitiveRouteContext, request: Request) {
  const scope = ownerScope(security);
  let body: unknown;
  try { body = await request.json(); } catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON"); }
  const parsed = coachAiSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) throw new ApiHttpError(400, "VALIDATION_ERROR", "Coach settings are invalid", parsed.error.issues);
  try {
    const catalog = await getCoachModels(parsed.data.provider);
    if (catalog.models.every((model) => model.id !== parsed.data.modelId)) throw new ApiHttpError(400, "MODEL_UNAVAILABLE", "This model is not currently available in the provider catalog. Refresh the list and choose an available model.");
    return success(await repository().save(scope, parsed.data));
  } catch (error) {
    if (error instanceof CoachAiConfigurationConflictError) throw new ApiHttpError(409, "CONFLICT", error.message);
    if (error instanceof ApiHttpError) throw error;
    if (error instanceof Error && /not configured/u.test(error.message)) throw new ApiHttpError(503, "PROVIDER_NOT_CONFIGURED", error.message);
    throw new ApiHttpError(503, "CATALOG_UNAVAILABLE", "The provider model catalog is unavailable. Retry before saving.");
  }
}
export async function getCoachAiModels(security: SensitiveRouteContext, request: Request) {
  ownerScope(security);
  const provider = new URL(request.url).searchParams.get("provider");
  if (provider !== "openai" && provider !== "openrouter") throw new ApiHttpError(400, "VALIDATION_ERROR", "A supported provider is required");
  try { return success(await getCoachModels(provider, { allowStale: true })); }
  catch (error) {
    if (error instanceof Error && /not configured/u.test(error.message)) throw new ApiHttpError(503, "PROVIDER_NOT_CONFIGURED", error.message);
    throw new ApiHttpError(503, "CATALOG_UNAVAILABLE", "The model catalog is unavailable. Retry to refresh compatible models.");
  }
}
