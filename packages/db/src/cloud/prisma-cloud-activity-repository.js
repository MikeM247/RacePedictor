import {
  activitiesListResponseSchema,
  activityDetailSchema,
} from "../../../core/src/contracts/activity.ts";
import { assertAthleteScope } from "./athlete-scope.js";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const SPORTS = new Set(["run", "trail_run", "treadmill_run", "other"]);

export class CloudActivityCursorError extends Error {
  constructor() {
    super("Activity cursor is invalid");
    this.name = "CloudActivityCursorError";
    this.code = "INVALID_CURSOR";
  }
}

export class PrismaCloudActivityRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.activity) throw new Error("A Prisma activity delegate is required");
    this.#prisma = prisma;
  }

  async list(scope, input = {}) {
    const athleteId = assertAthleteScope(scope);
    const limit = boundedLimit(input.limit);
    const sport = input.sport || null;
    if (sport && !SPORTS.has(sport)) throw new Error("Activity sport filter is invalid");
    const search = typeof input.search === "string" ? input.search.trim().slice(0, 100) : "";
    const from = dateBoundary(input.from, "start");
    const to = dateBoundary(input.to, "end");
    if (from && to && from > to) throw new Error("Activity date range is invalid");

    let cursor = null;
    if (input.cursor) {
      cursor = await this.#prisma.activity.findFirst({
        where: { id: input.cursor, athleteId, deletedAt: null },
        select: { id: true, occurredAt: true },
      });
      if (!cursor) throw new CloudActivityCursorError();
    }

    const where = {
      athleteId,
      deletedAt: null,
      ...(sport ? { sport } : {}),
      ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
      ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(cursor ? {
        OR: [
          { occurredAt: { lt: cursor.occurredAt } },
          { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
        ],
      } : {}),
    };
    const rows = await this.#prisma.activity.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return activitiesListResponseSchema.parse({
      items: page.map(toSummary),
      ...(hasMore ? { nextCursor: page.at(-1).id } : {}),
    });
  }

  async findById(scope, activityId) {
    const athleteId = assertAthleteScope(scope);
    if (typeof activityId !== "string" || !activityId.trim() || activityId.length > 128) {
      throw new Error("Activity id is invalid");
    }
    const row = await this.#prisma.activity.findFirst({
      where: { id: activityId, athleteId, deletedAt: null },
      include: {
        splits: { orderBy: { splitIndex: "asc" } },
        routeSignature: true,
      },
    });
    return row ? activityDetailSchema.parse(toDetail(row)) : null;
  }
}

function toSummary(row) {
  return {
    id: row.id,
    athleteId: row.athleteId,
    title: row.title ?? null,
    occurredAt: iso(row.occurredAt),
    localOccurredAt: row.localOccurredAt ?? null,
    sport: row.sport,
    distanceM: Number(row.distanceM),
    elapsedTimeS: row.elapsedTimeS,
    avgPaceSecPerKm: Number(row.avgPaceSecPerKm),
    elevationGainM: Number(row.elevationGainM),
    hrAvailable: Boolean(row.hrAvailable),
    cadenceAvailable: Boolean(row.cadenceAvailable),
  };
}

function toDetail(row) {
  return {
    ...toSummary(row),
    sourceType: row.sourceType,
    sourceFileId: row.sourceFileId ?? null,
    sourceActivityId: row.sourceActivityId ?? null,
    endedAt: iso(row.endedAt),
    movingTimeS: row.movingTimeS ?? null,
    elevationLossM: Number(row.elevationLossM),
    minElevationM: nullableNumber(row.minElevationM),
    maxElevationM: nullableNumber(row.maxElevationM),
    avgHrBpm: row.avgHrBpm ?? null,
    maxHrBpm: row.maxHrBpm ?? null,
    minHrBpm: row.minHrBpm ?? null,
    avgCadenceSpm: nullableNumber(row.avgCadenceSpm),
    maxCadenceSpm: nullableNumber(row.maxCadenceSpm),
    calories: nullableNumber(row.calories),
    avgPowerW: nullableNumber(row.avgPowerW),
    maxPowerW: nullableNumber(row.maxPowerW),
    lapCount: row.lapCount ?? null,
    paceVariability: nullableNumber(row.paceVariability),
    hrDriftPct: nullableNumber(row.hrDriftPct),
    hillDifficulty: nullableNumber(row.hillDifficulty),
    dedupeHash: row.dedupeHash,
    createdAt: iso(row.createdAt),
    splits: (row.splits ?? []).map((split) => ({
      id: split.id,
      activityId: split.activityId,
      athleteId: split.athleteId,
      splitIndex: split.splitIndex,
      startOffsetS: split.startOffsetS,
      endOffsetS: split.endOffsetS,
      durationS: split.durationS,
      distanceM: Number(split.distanceM),
      paceSecPerKm: Number(split.paceSecPerKm),
      elevGainM: Number(split.elevGainM),
      elevLossM: Number(split.elevLossM),
      avgHrBpm: split.avgHrBpm ?? null,
      maxHrBpm: split.maxHrBpm ?? null,
      avgCadenceSpm: nullableNumber(split.avgCadenceSpm),
      createdAt: iso(split.createdAt),
    })),
    routeSignature: row.routeSignature ? {
      id: row.routeSignature.id,
      activityId: row.routeSignature.activityId,
      athleteId: row.routeSignature.athleteId,
      startLat: Number(row.routeSignature.startLat),
      startLon: Number(row.routeSignature.startLon),
      endLat: Number(row.routeSignature.endLat),
      endLon: Number(row.routeSignature.endLon),
      bboxMinLat: Number(row.routeSignature.bboxMinLat),
      bboxMinLon: Number(row.routeSignature.bboxMinLon),
      bboxMaxLat: Number(row.routeSignature.bboxMaxLat),
      bboxMaxLon: Number(row.routeSignature.bboxMaxLon),
      polyline: row.routeSignature.polyline ?? null,
      elevProfile: row.routeSignature.elevProfile ?? null,
      routeHash: row.routeSignature.routeHash,
      createdAt: iso(row.routeSignature.createdAt),
    } : null,
  };
}

function boundedLimit(value) {
  const limit = value === undefined || value === null ? DEFAULT_LIMIT : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new Error("Activity limit is invalid");
  return limit;
}

function dateBoundary(value, edge) {
  if (value === undefined || value === null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error("Activity date filter is invalid");
  const date = new Date(`${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Activity date filter is invalid");
  }
  return date;
}

function nullableNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Stored activity date is invalid");
  return date.toISOString();
}
