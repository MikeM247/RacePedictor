import { syncChangeSchema } from "../../../core/src/contracts/sync.ts";
import { assertAthleteScope, immutableCopy } from "./athlete-scope.js";

export class CloudSyncCursorError extends Error {
  constructor() {
    super("Sync cursor is invalid or no longer available");
    this.name = "CloudSyncCursorError";
    this.code = "INVALID_CURSOR";
  }
}

export class PrismaSyncChangeRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.syncChange) throw new Error("A Prisma sync-change delegate is required");
    this.#prisma = prisma;
  }

  async list(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const limit = Number(input?.limit ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Sync limit is invalid");
    const after = input?.after === null || input?.after === undefined ? 0n : cursor(input.after);
    const bounds = await this.#prisma.syncChange.aggregate({
      where: { athleteId },
      _min: { cursor: true },
      _max: { cursor: true },
    });
    const minimum = bounds._min.cursor;
    const maximum = bounds._max.cursor;
    if (
      (maximum === null && after > 0n)
      || (maximum !== null && after > maximum)
      || (minimum !== null && after < minimum - 1n)
    ) {
      throw new CloudSyncCursorError();
    }

    const rows = await this.#prisma.syncChange.findMany({
      where: { athleteId, cursor: { gt: after } },
      orderBy: { cursor: "asc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const changes = page.map((row) => syncChangeSchema.parse({
      cursor: row.cursor.toString(),
      athleteId: row.athleteId,
      entityType: row.entityType,
      entityId: row.entityId,
      entityRevision: row.entityVersion,
      operation: row.operation,
      changedAt: row.occurredAt.toISOString(),
      payload: row.selectedFields,
    }));
    return immutableCopy({
      changes,
      nextCursor: changes.at(-1)?.cursor ?? (after > 0n ? after.toString() : null),
      hasMore,
    });
  }
}

function cursor(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) throw new CloudSyncCursorError();
  return BigInt(value);
}
