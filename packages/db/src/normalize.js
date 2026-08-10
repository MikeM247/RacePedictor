import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

const toDate = (value) => {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number(value.toString());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toInt = (value) => {
  const num = toNumber(value);
  if (num === null) return null;
  const rounded = Math.round(num);
  return Number.isFinite(rounded) ? rounded : null;
};

const fromTypedOrPayload = (typed, payload, key) => {
  if (typed !== null && typed !== undefined) return typed;
  if (!payload || typeof payload !== "object") return null;
  return payload[key] ?? null;
};

const normalizeSport = (value) => {
  const supported = new Set(["run", "trail_run", "treadmill_run", "other"]);
  if (typeof value === "string" && supported.has(value)) return value;
  return null;
};

const computeDedupeHash = ({ occurredAt, elapsedTimeS, distanceM, elevationGainM, routeHash }) => {
  const occurredBucket = new Date(Math.floor(occurredAt.getTime() / 60000) * 60000).toISOString();
  const base = [
    occurredBucket,
    String(Math.round(elapsedTimeS)),
    String(Number(distanceM).toFixed(3)),
    String(Number(elevationGainM).toFixed(3)),
    routeHash ?? "",
  ].join("|");
  return createHash("sha256").update(base).digest("hex");
};

const readRouteHash = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const route = payload.routeSignature;
  if (route && typeof route === "object" && typeof route.routeHash === "string" && route.routeHash.length > 0) {
    return route.routeHash;
  }
  return null;
};

const readSplits = (payload) => {
  if (!payload || typeof payload !== "object") return [];
  if (!Array.isArray(payload.splits)) return [];
  return payload.splits;
};

const buildSplitRows = (activityId, athleteId, splits) => {
  const rows = [];
  for (let i = 0; i < splits.length; i += 1) {
    const split = splits[i];
    if (!split || typeof split !== "object") continue;

    const distanceM = toNumber(split.distanceM);
    const paceSecPerKm = toNumber(split.paceSecPerKm);
    const elevGainM = toNumber(split.elevGainM) ?? 0;
    const elevLossM = toNumber(split.elevLossM) ?? 0;
    const durationS = toInt(split.durationS);
    const startOffsetS = toInt(split.startOffsetS);
    const endOffsetS = toInt(split.endOffsetS);

    if (
      distanceM === null ||
      paceSecPerKm === null ||
      durationS === null ||
      startOffsetS === null ||
      endOffsetS === null
    ) {
      continue;
    }

    rows.push({
      activityId,
      athleteId,
      splitIndex: toInt(split.splitIndex) ?? i + 1,
      startOffsetS,
      endOffsetS,
      durationS,
      distanceM: new Prisma.Decimal(distanceM),
      paceSecPerKm: new Prisma.Decimal(paceSecPerKm),
      elevGainM: new Prisma.Decimal(elevGainM),
      elevLossM: new Prisma.Decimal(elevLossM),
      avgHrBpm: toInt(split.avgHrBpm),
      maxHrBpm: toInt(split.maxHrBpm),
      avgCadenceSpm:
        split.avgCadenceSpm === null || split.avgCadenceSpm === undefined
          ? null
          : new Prisma.Decimal(toNumber(split.avgCadenceSpm) ?? 0),
    });
  }
  return rows;
};

const buildRoute = (activityId, athleteId, payload) => {
  if (!payload || typeof payload !== "object") return null;
  const route = payload.routeSignature;
  if (!route || typeof route !== "object") return null;

  const requiredKeys = [
    "startLat",
    "startLon",
    "endLat",
    "endLon",
    "bboxMinLat",
    "bboxMinLon",
    "bboxMaxLat",
    "bboxMaxLon",
    "routeHash",
  ];
  for (const key of requiredKeys) {
    if (route[key] === null || route[key] === undefined) return null;
  }

  const toDecimal = (v) => {
    const n = toNumber(v);
    return n === null ? null : new Prisma.Decimal(n);
  };

  const startLat = toDecimal(route.startLat);
  const startLon = toDecimal(route.startLon);
  const endLat = toDecimal(route.endLat);
  const endLon = toDecimal(route.endLon);
  const bboxMinLat = toDecimal(route.bboxMinLat);
  const bboxMinLon = toDecimal(route.bboxMinLon);
  const bboxMaxLat = toDecimal(route.bboxMaxLat);
  const bboxMaxLon = toDecimal(route.bboxMaxLon);

  if (!startLat || !startLon || !endLat || !endLon || !bboxMinLat || !bboxMinLon || !bboxMaxLat || !bboxMaxLon) {
    return null;
  }

  return {
    activityId,
    athleteId,
    startLat,
    startLon,
    endLat,
    endLon,
    bboxMinLat,
    bboxMinLon,
    bboxMaxLat,
    bboxMaxLon,
    routeHash: String(route.routeHash),
    polyline: typeof route.polyline === "string" ? route.polyline : null,
    elevProfile: route.elevProfile ?? null,
  };
};

const parseRowForActivity = (row) => {
  const payload = row.payloadJson ?? {};
  const occurredAt = toDate(fromTypedOrPayload(row.occurredAt, payload, "occurredAt"));
  const endedAt = toDate(fromTypedOrPayload(row.endedAt, payload, "endedAt"));
  const elapsedTimeS = toInt(fromTypedOrPayload(row.elapsedTimeS, payload, "elapsedTimeS"));
  const sport = normalizeSport(fromTypedOrPayload(row.sport, payload, "sport"));
  const distanceM = toNumber(fromTypedOrPayload(row.distanceM, payload, "distanceM"));
  const avgPaceSecPerKm = toNumber(fromTypedOrPayload(null, payload, "avgPaceSecPerKm"));
  const elevationGainM = toNumber(fromTypedOrPayload(null, payload, "elevationGainM")) ?? 0;
  const elevationLossM = toNumber(fromTypedOrPayload(null, payload, "elevationLossM")) ?? 0;

  if (!occurredAt || !endedAt || elapsedTimeS === null || !sport || distanceM === null || avgPaceSecPerKm === null) {
    throw new Error("Missing required activity fields for normalization");
  }

  return {
    occurredAt,
    endedAt,
    elapsedTimeS,
    sport,
    distanceM: new Prisma.Decimal(distanceM),
    avgPaceSecPerKm: new Prisma.Decimal(avgPaceSecPerKm),
    elevationGainM: new Prisma.Decimal(elevationGainM),
    elevationLossM: new Prisma.Decimal(elevationLossM),
    routeHash: readRouteHash(payload),
  };
};

const clampBatchSize = (batchSize) => {
  const numeric = Number(batchSize ?? DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(numeric)) return DEFAULT_BATCH_SIZE;
  const rounded = Math.max(1, Math.round(numeric));
  return Math.min(rounded, MAX_BATCH_SIZE);
};

export async function normalizeImportBatch({ importId, cursor, batchSize }, prisma = new PrismaClient()) {
  if (!importId || typeof importId !== "string") {
    throw new Error("importId is required");
  }

  const limit = clampBatchSize(batchSize);

  const importRow = await prisma.import.findUnique({ where: { id: importId } });
  if (!importRow) {
    throw new Error(`Import not found: ${importId}`);
  }

  await prisma.import.update({
    where: { id: importId },
    data: {
      status: "normalizing",
      startedAt: importRow.startedAt ?? new Date(),
    },
  });

  const where = {
    importId,
    status: "staged",
    ...(cursor ? { id: { gt: cursor } } : {}),
  };

  const rows = await prisma.stagingActivity.findMany({
    where,
    orderBy: { id: "asc" },
    take: limit,
  });

  let normalizedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;
  let lastProcessedId = cursor ?? null;

  for (const row of rows) {
    lastProcessedId = row.id;
    try {
      const parsed = parseRowForActivity(row);

      const routeHash = parsed.routeHash;
      const dedupeHash =
        row.sourceActivityId && row.sourceActivityId.length > 0
          ? null
          : computeDedupeHash({
              occurredAt: parsed.occurredAt,
              elapsedTimeS: parsed.elapsedTimeS,
              distanceM: parsed.distanceM,
              elevationGainM: parsed.elevationGainM,
              routeHash,
            });

      const existingBySource =
        row.sourceActivityId && row.sourceActivityId.length > 0
          ? await prisma.activity.findFirst({
              where: {
                athleteId: row.athleteId,
                sourceActivityId: row.sourceActivityId,
              },
              select: { id: true },
            })
          : null;

      const existingByHash =
        !existingBySource && dedupeHash
          ? await prisma.activity.findFirst({
              where: {
                athleteId: row.athleteId,
                dedupeHash,
              },
              select: { id: true },
            })
          : null;

      if (existingBySource || existingByHash) {
        await prisma.$transaction([
          prisma.stagingActivity.update({
            where: { id: row.id },
            data: {
              status: "duplicate",
              dedupeHash: dedupeHash ?? row.dedupeHash,
              errorCode: null,
              errorMessage: null,
            },
          }),
          prisma.import.update({
            where: { id: importId },
            data: {
              duplicateCount: { increment: 1 },
              skippedCount: { increment: 1 },
            },
          }),
        ]);
        duplicateCount += 1;
        skippedCount += 1;
        continue;
      }

      const activity = await prisma.activity.create({
        data: {
          athleteId: row.athleteId,
          sourceType: row.sourceType,
          sourceFileId: row.rawFileId,
          sourceActivityId: row.sourceActivityId,
          occurredAt: parsed.occurredAt,
          endedAt: parsed.endedAt,
          elapsedTimeS: parsed.elapsedTimeS,
          sport: parsed.sport,
          distanceM: parsed.distanceM,
          avgPaceSecPerKm: parsed.avgPaceSecPerKm,
          elevationGainM: parsed.elevationGainM,
          elevationLossM: parsed.elevationLossM,
          hrAvailable: false,
          cadenceAvailable: false,
          dedupeHash: dedupeHash ?? computeDedupeHash({
            occurredAt: parsed.occurredAt,
            elapsedTimeS: parsed.elapsedTimeS,
            distanceM: parsed.distanceM,
            elevationGainM: parsed.elevationGainM,
            routeHash,
          }),
        },
      });

      const payload = row.payloadJson ?? {};
      const splits = buildSplitRows(activity.id, row.athleteId, readSplits(payload));
      if (splits.length > 0) {
        await prisma.activitySplitKm.createMany({ data: splits });
      }

      const route = buildRoute(activity.id, row.athleteId, payload);
      if (route) {
        await prisma.routeSignature.create({ data: route });
      }

      await prisma.$transaction([
        prisma.stagingActivity.update({
          where: { id: row.id },
          data: {
            status: "normalized",
            dedupeHash:
              dedupeHash ??
              computeDedupeHash({
                occurredAt: parsed.occurredAt,
                elapsedTimeS: parsed.elapsedTimeS,
                distanceM: parsed.distanceM,
                elevationGainM: parsed.elevationGainM,
                routeHash,
              }),
            errorCode: null,
            errorMessage: null,
          },
        }),
        prisma.import.update({
          where: { id: importId },
          data: {
            normalizedCount: { increment: 1 },
          },
        }),
      ]);
      normalizedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown normalization error";
      const code =
        typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
          ? error.code
          : "NORMALIZATION_ERROR";

      await prisma.$transaction([
        prisma.stagingActivity.update({
          where: { id: row.id },
          data: {
            status: "error",
            errorCode: code,
            errorMessage: message.slice(0, 2000),
          },
        }),
        prisma.import.update({
          where: { id: importId },
          data: {
            errorCount: { increment: 1 },
          },
        }),
      ]);
      errorCount += 1;
    }
  }

  const remainingStaged = await prisma.stagingActivity.count({
    where: {
      importId,
      status: "staged",
    },
  });

  const hasMore = remainingStaged > 0;
  const nextCursor = rows.length > 0 ? lastProcessedId : cursor ?? null;

  await prisma.import.update({
    where: { id: importId },
    data: {
      nextCursor,
      hasMore,
      status: hasMore ? "normalizing" : "completed",
      completedAt: hasMore ? null : new Date(),
    },
  });

  return {
    importId,
    normalizedCount,
    skippedCount,
    errorCount,
    nextCursor,
    hasMore,
    duplicateCount,
  };
}
