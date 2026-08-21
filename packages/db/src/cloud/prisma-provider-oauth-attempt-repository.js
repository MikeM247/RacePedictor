import { assertAthleteScope, immutableCopy } from "./athlete-scope.js";

function project(row) {
  return immutableCopy({
    athleteId: row.athleteId,
    userId: row.userId,
    provider: row.provider,
    stateHash: row.stateHash,
    redirectUri: row.redirectUri,
    returnTo: row.returnTo,
    expiresAt: row.expiresAt.toISOString(),
    consumedAt: row.consumedAt?.toISOString() ?? null,
  });
}

export class PrismaProviderOAuthAttemptRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.providerOAuthAttempt || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma OAuth attempt delegate is required");
    }
    this.#prisma = prisma;
  }

  async create(scope, input) {
    const athleteId = assertAthleteScope(scope);
    await this.#prisma.providerOAuthAttempt.create({
      data: {
        athleteId,
        userId: scope.actor.userId,
        provider: input.provider,
        stateHash: input.stateHash,
        redirectUri: input.redirectUri,
        returnTo: input.returnTo,
        expiresAt: new Date(input.expiresAt),
      },
    });
  }

  async consume(scope, input) {
    const athleteId = assertAthleteScope(scope);
    return this.#prisma.$transaction(async (transaction) => {
      const row = await transaction.providerOAuthAttempt.findUnique({
        where: { provider_stateHash: { provider: input.provider, stateHash: input.stateHash } },
      });
      if (!row || row.athleteId !== athleteId || row.userId !== scope.actor.userId) {
        return { outcome: "invalid", attempt: null };
      }
      if (row.consumedAt) return { outcome: "replayed", attempt: null };

      const now = new Date(input.now);
      const claimed = await transaction.providerOAuthAttempt.updateMany({
        where: { id: row.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) return { outcome: "replayed", attempt: null };
      if (row.expiresAt.getTime() <= now.getTime()) {
        return { outcome: "expired", attempt: null };
      }
      return {
        outcome: "consumed",
        attempt: project({ ...row, consumedAt: now }),
      };
    });
  }
}
