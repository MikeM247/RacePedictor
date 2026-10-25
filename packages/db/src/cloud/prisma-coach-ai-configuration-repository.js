import { randomUUID } from "node:crypto";
import { coachAiProviderSchema, coachAiSettingsSchema, coachAiSettingsUpdateSchema } from "../../../core/src/contracts/activity-review.ts";
import { assertAthleteScope } from "./athlete-scope.js";

/** @type {Array<{id: string, name: string, reasoning: boolean}>} */
export const OPENAI_COACH_MODELS = Object.freeze([
  { id: "gpt-5-mini", name: "GPT-5 mini", reasoning: true },
  { id: "gpt-5", name: "GPT-5", reasoning: true },
  { id: "gpt-4.1-mini", name: "GPT-4.1 mini", reasoning: false },
  { id: "gpt-4.1", name: "GPT-4.1", reasoning: false },
]);

export class CoachAiConfigurationConflictError extends Error {
  constructor() { super("Coach settings changed. Reload the saved selection and try again."); this.code = "CONFLICT"; }
}

export class PrismaCoachAiConfigurationRepository {
  #prisma;
  constructor({ prisma }) { this.#prisma = prisma; }

  async get(scope, environment = process.env) {
    const athleteId = assertAthleteScope(scope);
    const row = this.#prisma.coachAiConfiguration ? await this.#prisma.coachAiConfiguration.findUnique({ where: { athleteId } }) : null;
    return coachAiSettingsSchema.parse({
      provider: coachAiProviderSchema.parse(row?.provider ?? "openai"),
      modelId: row?.modelId ?? environment.RACEPREDICTOR_ACTIVITY_REVIEW_MODEL ?? "gpt-5-mini",
      revision: row?.revision ?? 0,
      credentials: {
        openai: Boolean(environment.OPENAI_API_KEY?.trim()),
        openrouter: Boolean(environment.OPENROUTER_API_KEY?.trim()),
      },
    });
  }

  async save(scope, input, environment = process.env) {
    const athleteId = assertAthleteScope(scope);
    const parsed = coachAiSettingsUpdateSchema.parse(input);
    const envName = parsed.provider === "openai" ? "OPENAI_API_KEY" : "OPENROUTER_API_KEY";
    if (!environment[envName]?.trim()) {
      const error = new Error(envName + " is not configured on the server.");
      error.code = "PROVIDER_NOT_CONFIGURED";
      throw error;
    }
    try {
      const row = await this.#prisma.$transaction(async (tx) => {
        const current = await tx.coachAiConfiguration.findUnique({ where: { athleteId } });
        const revision = current?.revision ?? 0;
        if (revision !== parsed.expectedRevision) throw new CoachAiConfigurationConflictError();
        if (!current) return tx.coachAiConfiguration.create({ data: { id: "coach_ai_configuration_" + randomUUID().replaceAll("-", ""), athleteId, provider: parsed.provider, modelId: parsed.modelId, revision: 1 } });
        const updated = await tx.coachAiConfiguration.updateMany({ where: { athleteId, revision }, data: { provider: parsed.provider, modelId: parsed.modelId, revision: revision + 1 } });
        if (updated.count !== 1) throw new CoachAiConfigurationConflictError();
        return tx.coachAiConfiguration.findUnique({ where: { athleteId } });
      }, { isolationLevel: "Serializable" });
      return coachAiSettingsSchema.parse({ provider: row.provider, modelId: row.modelId, revision: row.revision, credentials: { openai: Boolean(environment.OPENAI_API_KEY?.trim()), openrouter: Boolean(environment.OPENROUTER_API_KEY?.trim()) } });
    } catch (error) {
      if (error instanceof CoachAiConfigurationConflictError || error?.code === "P2002" || error?.code === "P2034") throw new CoachAiConfigurationConflictError();
      throw error;
    }
  }
}
