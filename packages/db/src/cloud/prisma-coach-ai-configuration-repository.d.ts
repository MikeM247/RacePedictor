export const OPENAI_COACH_MODELS: ReadonlyArray<{ id: string; name: string; reasoning: boolean }>;
export class CoachAiConfigurationConflictError extends Error { code: string; }
export class PrismaCoachAiConfigurationRepository {
  constructor(args: { prisma: any });
  get(scope: any, environment?: Record<string, string | undefined>): Promise<{ provider: "openai" | "openrouter"; modelId: string; revision: number; credentials: { openai: boolean; openrouter: boolean } }>;
  save(scope: any, input: unknown, environment?: Record<string, string | undefined>): Promise<{ provider: "openai" | "openrouter"; modelId: string; revision: number; credentials: { openai: boolean; openrouter: boolean } }>;
}
