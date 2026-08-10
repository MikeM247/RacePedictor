import { syncChangeSchema } from "../../../core/src/contracts/sync.ts";
import { assertAthleteScope, immutableCopy } from "./athlete-scope.js";

export class InMemorySyncRepository {
  #changesByAthlete = new Map();
  #acknowledgementsByAthlete = new Map();

  async append(scope, change) {
    const athleteId = assertAthleteScope(scope);
    const changes = this.#changesByAthlete.get(athleteId) ?? [];
    const parsed = syncChangeSchema.parse({
      ...change,
      athleteId,
      cursor: String(changes.length + 1),
    });
    const stored = immutableCopy(parsed);
    changes.push(stored);
    this.#changesByAthlete.set(athleteId, changes);
    return immutableCopy(stored);
  }

  async listAfter(scope, { cursor = null, limit }) {
    const athleteId = assertAthleteScope(scope);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("Sync change limit must be between 1 and 500");
    }
    const changes = this.#changesByAthlete.get(athleteId) ?? [];
    const cursorNumber = parseCursor(cursor);
    if (cursorNumber > changes.length) throw new Error("Sync cursor is not valid for this athlete");
    return immutableCopy(changes.slice(cursorNumber, cursorNumber + limit));
  }

  async acknowledge(scope, { deviceId, cursor }) {
    const athleteId = assertAthleteScope(scope);
    if (typeof deviceId !== "string" || deviceId.length === 0 || deviceId.length > 128) {
      throw new Error("Paired device id is invalid");
    }
    const cursorNumber = parseCursor(cursor);
    const changes = this.#changesByAthlete.get(athleteId) ?? [];
    if (cursorNumber === 0 || cursorNumber > changes.length) {
      throw new Error("Acknowledged cursor is not valid for this athlete");
    }
    const athleteAcknowledgements = this.#acknowledgementsByAthlete.get(athleteId) ?? new Map();
    const current = athleteAcknowledgements.get(deviceId) ?? 0;
    if (cursorNumber < current) throw new Error("Acknowledged cursor cannot move backwards");
    athleteAcknowledgements.set(deviceId, cursorNumber);
    this.#acknowledgementsByAthlete.set(athleteId, athleteAcknowledgements);
  }

  async acknowledgedCursor(scope, deviceId) {
    const athleteId = assertAthleteScope(scope);
    const cursor = this.#acknowledgementsByAthlete.get(athleteId)?.get(deviceId);
    return cursor ? String(cursor) : null;
  }
}

function parseCursor(cursor) {
  if (cursor === null || cursor === undefined) return 0;
  if (typeof cursor !== "string" || !/^[1-9]\d*$/.test(cursor)) {
    throw new Error("Sync cursor is invalid");
  }
  const parsed = Number(cursor);
  if (!Number.isSafeInteger(parsed)) throw new Error("Sync cursor is invalid");
  return parsed;
}
