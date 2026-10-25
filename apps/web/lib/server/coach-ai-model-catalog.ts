import { OPENAI_COACH_MODELS } from "../../../../packages/db/src/cloud/prisma-coach-ai-configuration-repository.js";
import { coachAiModelsResponseSchema } from "../../../../packages/core/src/contracts/activity-review.ts";

type Catalog = { models: Array<{ id: string; name: string; description?: string; contextLength?: number }>; expiresAt: number };
const CACHE_MS = 15 * 60 * 1000;
let openRouterCache: Catalog | null = null;

export async function getCoachModels(provider: "openai" | "openrouter", options: { fetchImpl?: typeof fetch; now?: () => number; allowStale?: boolean } = {}) {
  const now = options.now ?? Date.now;
  if (provider === "openai") return coachAiModelsResponseSchema.parse({ provider, models: OPENAI_COACH_MODELS.map(({ id, name }) => ({ id, name })), stale: false });
  if (openRouterCache && openRouterCache.expiresAt > now()) return coachAiModelsResponseSchema.parse({ provider, models: openRouterCache.models, stale: false });
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured on the server.");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)("https://openrouter.ai/api/v1/models?output_modalities=text&input_modalities=text&supported_parameters=structured_outputs", {
        headers: { authorization: `Bearer ${key}` }, signal: controller.signal, cache: "no-store",
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`OpenRouter model catalog returned ${response.status}.`);
    const payload = await response.json() as { data?: any[] };
    const models = (payload.data ?? []).filter((model) => {
      const parameters = model.supported_parameters ?? [];
      const input = model.architecture?.input_modalities ?? [];
      const output = model.architecture?.output_modalities ?? [];
      return typeof model.id === "string" && !model.id.endsWith("/auto")
        && parameters.includes("structured_outputs") && input.includes("text") && output.includes("text");
    }).map((model) => ({ id: model.id, name: typeof model.name === "string" ? model.name : model.id, ...(typeof model.description === "string" ? { description: model.description.slice(0, 1000) } : {}), ...(Number.isInteger(model.context_length) && model.context_length > 0 ? { contextLength: model.context_length } : {}) }));
    if (!models.length) throw new Error("OpenRouter returned no compatible text models.");
    openRouterCache = { models, expiresAt: now() + CACHE_MS };
    return coachAiModelsResponseSchema.parse({ provider, models, stale: false });
  } catch (error) {
    if (options.allowStale && openRouterCache) return coachAiModelsResponseSchema.parse({ provider, models: openRouterCache.models, stale: true });
    throw error;
  }
}
