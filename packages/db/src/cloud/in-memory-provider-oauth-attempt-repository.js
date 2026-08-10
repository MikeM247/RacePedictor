import { assertAthleteScope, immutableCopy } from "./athlete-scope.js";

const attemptKey = (provider, stateHash) => `${provider}\u0000${stateHash}`;

export class InMemoryProviderOAuthAttemptRepository {
  #attempts = new Map();

  async create(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const key = attemptKey(input.provider, input.stateHash);
    if (this.#attempts.has(key)) throw new Error("OAuth state hash already exists");
    this.#attempts.set(key, immutableCopy({
      ...input,
      athleteId,
      userId: scope.actor.userId,
      consumedAt: null,
    }));
  }

  async consume(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const key = attemptKey(input.provider, input.stateHash);
    const attempt = this.#attempts.get(key);
    if (!attempt
        || attempt.athleteId !== athleteId
        || attempt.userId !== scope.actor.userId) {
      return { outcome: "invalid", attempt: null };
    }
    if (attempt.consumedAt) return { outcome: "replayed", attempt: null };

    this.#attempts.set(key, immutableCopy({ ...attempt, consumedAt: input.now }));
    if (Date.parse(attempt.expiresAt) <= Date.parse(input.now)) {
      return { outcome: "expired", attempt: null };
    }
    return {
      outcome: "consumed",
      attempt: immutableCopy({ ...attempt, consumedAt: input.now }),
    };
  }
}
