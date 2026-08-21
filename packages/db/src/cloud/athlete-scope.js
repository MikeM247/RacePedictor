import { assertActorCanAccessAthlete } from "../../../core/src/contracts/auth.ts";

export function assertAthleteScope(scope) {
  if (!scope || typeof scope !== "object" || !scope.actor || typeof scope.athleteId !== "string") {
    throw new Error("A valid athlete scope is required");
  }

  assertActorCanAccessAthlete(scope.actor, scope.athleteId);
  return scope.athleteId;
}

export function assertAthleteOwnership(scope, athleteId) {
  const scopedAthleteId = assertAthleteScope(scope);
  if (athleteId !== scopedAthleteId) {
    throw new Error("Resource is not authorized for the requested athlete");
  }
  return scopedAthleteId;
}

export function immutableCopy(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
