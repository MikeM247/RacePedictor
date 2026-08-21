import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeImportBatch } from "./normalize.js";

export const SEED_ATHLETE_ID = "athlete_001";
export const COMPLETED_IMPORT_ID = "import_completed_seed_v1";
export const IN_PROGRESS_IMPORT_ID = "import_in_progress_seed_v1";
export const COMPLETED_RAW_FILE_ID = "raw_completed_seed_v1";
export const IN_PROGRESS_RAW_FILE_ID = "raw_in_progress_seed_v1";
export const SEED_WEEK_START = new Date("2026-01-05T00:00:00.000Z");
export const SEED_WEEKS = 16;
export const SEED_MIN_STAGED_ROWS = 20;
export const SEED_MAX_STAGED_ROWS = 50;
export const SEED_MIN_NORMALIZED_ACTIVITIES = 30;
export const SEED_MAX_NORMALIZED_ACTIVITIES = 60;
export const SEED_MIN_SPLIT_COVERAGE = 0.6;
export const SEED_ROUTE_COVERAGE_MIN = 0.2;
export const SEED_ROUTE_COVERAGE_MAX = 0.4;

const EASY_PACE_MIN = 330;
const MODERATE_PACE_MIN = 285;

const dec = (value) => new Prisma.Decimal(value);

const addDays = (date, days) => {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const weekStartUtc = (date) => {
  const result = new Date(date.getTime());
  const day = result.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setUTCDate(result.getUTCDate() + diff);
  result.setUTCHours(0, 0, 0, 0);
  return result;
};

const weekEndUtc = (startDate) => {
  const end = addDays(startDate, 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const createSplitPayload = (distanceM, elapsedTimeS) => {
  const kmCount = Math.max(1, Math.round(distanceM / 1000));
  const avgPerKm = elapsedTimeS / kmCount;
  const splits = [];
  for (let i = 0; i < kmCount; i += 1) {
    const startOffsetS = Math.round(i * avgPerKm);
    const endOffsetS = Math.round((i + 1) * avgPerKm);
    splits.push({
      splitIndex: i + 1,
      startOffsetS,
      endOffsetS,
      durationS: endOffsetS - startOffsetS,
      distanceM: 1000,
      paceSecPerKm: avgPerKm,
      elevGainM: 5 + (i % 3),
      elevLossM: 4 + (i % 3),
    });
  }
  return splits;
};

const createRoutePayload = (seedIndex) => {
  const baseLat = 52.52 + seedIndex * 0.0001;
  const baseLon = 13.4 + seedIndex * 0.0001;
  return {
    startLat: baseLat,
    startLon: baseLon,
    endLat: baseLat + 0.002,
    endLon: baseLon + 0.002,
    bboxMinLat: baseLat,
    bboxMinLon: baseLon,
    bboxMaxLat: baseLat + 0.002,
    bboxMaxLon: baseLon + 0.002,
    routeHash: `seed_route_${seedIndex}`,
    polyline: `seed_polyline_${seedIndex}`,
    elevProfile: [100 + seedIndex, 103 + seedIndex, 101 + seedIndex],
  };
};

const makePayload = ({
  sourceActivityId,
  occurredAt,
  endedAt,
  elapsedTimeS,
  distanceM,
  avgPaceSecPerKm,
  elevationGainM,
  elevationLossM,
  sport,
  includeSplits,
  includeRoute,
  seedIndex,
}) => {
  const payload = {
    sourceActivityId,
    occurredAt: occurredAt.toISOString(),
    endedAt: endedAt.toISOString(),
    elapsedTimeS,
    distanceM,
    avgPaceSecPerKm,
    elevationGainM,
    elevationLossM,
    sport,
  };
  if (includeSplits) {
    payload.splits = createSplitPayload(distanceM, elapsedTimeS);
  }
  if (includeRoute) {
    payload.routeSignature = createRoutePayload(seedIndex);
  }
  return payload;
};

const buildCompletedStagingRows = () => {
  const rows = [];
  for (let i = 0; i < 32; i += 1) {
    const weekOffset = Math.floor(i / 2);
    const occurredAt = addDays(SEED_WEEK_START, weekOffset * 7 + (i % 2) * 2);
    occurredAt.setUTCHours(6 + (i % 3), 0, 0, 0);
    const distanceM = 8000 + (i % 6) * 1200;
    const paceBand = i % 3;
    const avgPaceSecPerKm = paceBand === 0 ? 345 : paceBand === 1 ? 305 : 265;
    const elapsedTimeS = Math.round((distanceM / 1000) * avgPaceSecPerKm);
    const endedAt = new Date(occurredAt.getTime() + elapsedTimeS * 1000);
    const includeSplits = i % 10 < 7;
    const includeRoute = i % 10 < 3;

    const sourceActivityId = i % 8 === 0 ? null : `seed_v1_src_${i.toString().padStart(3, "0")}`;
    rows.push({
      id: `stg_completed_${i.toString().padStart(3, "0")}`,
      importId: COMPLETED_IMPORT_ID,
      rawFileId: COMPLETED_RAW_FILE_ID,
      athleteId: SEED_ATHLETE_ID,
      sourceType: i % 2 === 0 ? "gpx" : "csv",
      sourceActivityId,
      occurredAt,
      endedAt,
      elapsedTimeS,
      distanceM: dec(distanceM.toFixed(3)),
      sport: "run",
      payloadJson: makePayload({
        sourceActivityId,
        occurredAt,
        endedAt,
        elapsedTimeS,
        distanceM,
        avgPaceSecPerKm,
        elevationGainM: 70 + (i % 20),
        elevationLossM: 65 + (i % 20),
        sport: "run",
        includeSplits,
        includeRoute,
        seedIndex: i,
      }),
    });
  }

  // Source-identifier duplicate candidate.
  rows.push({
    id: "stg_completed_dup_source",
    importId: COMPLETED_IMPORT_ID,
    rawFileId: COMPLETED_RAW_FILE_ID,
    athleteId: SEED_ATHLETE_ID,
    sourceType: "gpx",
    sourceActivityId: "seed_v1_src_003",
    occurredAt: new Date("2026-03-01T06:00:00.000Z"),
    endedAt: new Date("2026-03-01T06:50:00.000Z"),
    elapsedTimeS: 3000,
    distanceM: dec("10000.000"),
    sport: "run",
    payloadJson: makePayload({
      sourceActivityId: "seed_v1_src_003",
      occurredAt: new Date("2026-03-01T06:00:00.000Z"),
      endedAt: new Date("2026-03-01T06:50:00.000Z"),
      elapsedTimeS: 3000,
      distanceM: 10000,
      avgPaceSecPerKm: 300,
      elevationGainM: 100,
      elevationLossM: 95,
      sport: "run",
      includeSplits: true,
      includeRoute: false,
      seedIndex: 999,
    }),
  });

  // Hash fallback duplicate candidate (no sourceActivityId, same canonical fields as row 8).
  const dupOccurredAt = addDays(SEED_WEEK_START, Math.floor(8 / 2) * 7 + (8 % 2) * 2);
  dupOccurredAt.setUTCHours(6 + (8 % 3), 0, 0, 0);
  const dupDistanceM = 8000 + (8 % 6) * 1200;
  const dupAvgPaceSecPerKm = 265;
  const dupElapsedTimeS = Math.round((dupDistanceM / 1000) * dupAvgPaceSecPerKm);
  const dupEndedAt = new Date(dupOccurredAt.getTime() + dupElapsedTimeS * 1000);
  rows.push({
    id: "stg_completed_dup_hash",
    importId: COMPLETED_IMPORT_ID,
    rawFileId: COMPLETED_RAW_FILE_ID,
    athleteId: SEED_ATHLETE_ID,
    sourceType: "csv",
    sourceActivityId: null,
    occurredAt: dupOccurredAt,
    endedAt: dupEndedAt,
    elapsedTimeS: dupElapsedTimeS,
    distanceM: dec(dupDistanceM.toFixed(3)),
    sport: "run",
    payloadJson: makePayload({
      sourceActivityId: null,
      occurredAt: dupOccurredAt,
      endedAt: dupEndedAt,
      elapsedTimeS: dupElapsedTimeS,
      distanceM: dupDistanceM,
      avgPaceSecPerKm: dupAvgPaceSecPerKm,
      elevationGainM: 70 + (8 % 20),
      elevationLossM: 65 + (8 % 20),
      sport: "run",
      includeSplits: true,
      includeRoute: false,
      seedIndex: 1000,
    }),
  });

  // Invalid row to force error path.
  rows.push({
    id: "stg_completed_invalid",
    importId: COMPLETED_IMPORT_ID,
    rawFileId: COMPLETED_RAW_FILE_ID,
    athleteId: SEED_ATHLETE_ID,
    sourceType: "tcx",
    sourceActivityId: "seed_v1_invalid",
    payloadJson: {
      sourceActivityId: "seed_v1_invalid",
      occurredAt: "2026-04-01T08:00:00.000Z",
      // missing required endedAt/elapsedTimeS/distance/pace on purpose
    },
  });

  return rows;
};

const buildInProgressStagingRows = () => {
  const rows = [];
  for (let i = 0; i < 10; i += 1) {
    const occurredAt = addDays(SEED_WEEK_START, 120 + i);
    occurredAt.setUTCHours(7, 30, 0, 0);
    const distanceM = 7000 + i * 300;
    const avgPaceSecPerKm = 315 + (i % 3) * 15;
    const elapsedTimeS = Math.round((distanceM / 1000) * avgPaceSecPerKm);
    const endedAt = new Date(occurredAt.getTime() + elapsedTimeS * 1000);
    rows.push({
      id: `stg_inprogress_${i.toString().padStart(3, "0")}`,
      importId: IN_PROGRESS_IMPORT_ID,
      rawFileId: IN_PROGRESS_RAW_FILE_ID,
      athleteId: SEED_ATHLETE_ID,
      sourceType: "csv",
      sourceActivityId: `seed_v1_inp_${i.toString().padStart(3, "0")}`,
      occurredAt,
      endedAt,
      elapsedTimeS,
      distanceM: dec(distanceM.toFixed(3)),
      sport: "run",
      payloadJson: makePayload({
        sourceActivityId: `seed_v1_inp_${i.toString().padStart(3, "0")}`,
        occurredAt,
        endedAt,
        elapsedTimeS,
        distanceM,
        avgPaceSecPerKm,
        elevationGainM: 50 + i,
        elevationLossM: 45 + i,
        sport: "run",
        includeSplits: i % 2 === 0,
        includeRoute: false,
        seedIndex: 2000 + i,
      }),
    });
  }
  return rows;
};

const upsertByIdWithStats = async (model, id, createData, statsKey, summary) => {
  const existing = await model.findUnique({ where: { id } });
  if (existing) {
    summary[statsKey].skipped += 1;
    return existing;
  }
  const created = await model.create({ data: createData });
  summary[statsKey].created += 1;
  return created;
};

const ensureImports = async (prisma, summary) => {
  await upsertByIdWithStats(
    prisma.import,
    COMPLETED_IMPORT_ID,
    {
      id: COMPLETED_IMPORT_ID,
      athleteId: SEED_ATHLETE_ID,
      status: "uploaded",
      parseWarnings: [],
      hasMore: false,
    },
    "imports",
    summary,
  );

  await upsertByIdWithStats(
    prisma.import,
    IN_PROGRESS_IMPORT_ID,
    {
      id: IN_PROGRESS_IMPORT_ID,
      athleteId: SEED_ATHLETE_ID,
      status: "uploaded",
      parseWarnings: [],
      hasMore: true,
    },
    "imports",
    summary,
  );
};

const ensureRawFiles = async (prisma, summary) => {
  await upsertByIdWithStats(
    prisma.rawFile,
    COMPLETED_RAW_FILE_ID,
    {
      id: COMPLETED_RAW_FILE_ID,
      importId: COMPLETED_IMPORT_ID,
      athleteId: SEED_ATHLETE_ID,
      sourceType: "csv",
      filename: "seed-completed-batch.csv",
      checksum: "seed_checksum_completed_v1",
      parserVersion: "seed-v1",
      parseWarnings: [],
    },
    "rawFiles",
    summary,
  );

  await upsertByIdWithStats(
    prisma.rawFile,
    IN_PROGRESS_RAW_FILE_ID,
    {
      id: IN_PROGRESS_RAW_FILE_ID,
      importId: IN_PROGRESS_IMPORT_ID,
      athleteId: SEED_ATHLETE_ID,
      sourceType: "csv",
      filename: "seed-inprogress-batch.csv",
      checksum: "seed_checksum_inprogress_v1",
      parserVersion: "seed-v1",
      parseWarnings: [],
    },
    "rawFiles",
    summary,
  );
};

const upsertStagingRows = async (prisma, rows, summary) => {
  for (const row of rows) {
    const existing = await prisma.stagingActivity.findUnique({ where: { id: row.id } });
    if (existing) {
      summary.stagingRows.skipped += 1;
      continue;
    }
    await prisma.stagingActivity.create({ data: row });
    summary.stagingRows.created += 1;
  }
};

const prepareCompletedImportForNormalization = async (prisma, summary) => {
  const normalizedActivities = await prisma.activity.count({
    where: {
      athleteId: SEED_ATHLETE_ID,
      sourceFileId: COMPLETED_RAW_FILE_ID,
    },
  });

  if (normalizedActivities > 0) {
    return;
  }

  await prisma.stagingActivity.updateMany({
    where: {
      importId: COMPLETED_IMPORT_ID,
      status: { in: ["normalized", "duplicate", "error", "rejected"] },
    },
    data: {
      status: "staged",
      errorCode: null,
      errorMessage: null,
    },
  });

  await prisma.import.update({
    where: { id: COMPLETED_IMPORT_ID },
    data: {
      status: "uploaded",
      stagedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      normalizedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      nextCursor: null,
      hasMore: false,
      startedAt: null,
      completedAt: null,
    },
  });

  summary.idempotencyActions.push("recovered_completed_import_for_replay");
};

const runCompletedImportNormalization = async (prisma, summary) => {
  let cursor = null;
  let hasMore = true;
  while (hasMore) {
    const batch = await normalizeImportBatch(
      {
        importId: COMPLETED_IMPORT_ID,
        cursor,
        batchSize: 100,
      },
      prisma,
    );
    summary.normalizationBatches += 1;
    summary.normalizeResults.normalized += batch.normalizedCount;
    summary.normalizeResults.skipped += batch.skippedCount;
    summary.normalizeResults.errors += batch.errorCount;
    cursor = batch.nextCursor;
    hasMore = batch.hasMore;
  }
};

export const computeWeeklyFeaturesForSeed = async (prisma, athleteId, weekStart = SEED_WEEK_START, weeks = SEED_WEEKS) => {
  const summary = { created: 0, updated: 0, skipped: 0 };
  const lastWeekStart = addDays(weekStart, (weeks - 1) * 7);
  const weekEndBoundary = weekEndUtc(lastWeekStart);

  const activities = await prisma.activity.findMany({
    where: {
      athleteId,
      occurredAt: {
        gte: weekStart,
        lte: weekEndBoundary,
      },
    },
    orderBy: { occurredAt: "asc" },
  });

  const byWeek = new Map();
  for (const activity of activities) {
    const ws = weekStartUtc(activity.occurredAt).toISOString();
    if (!byWeek.has(ws)) byWeek.set(ws, []);
    byWeek.get(ws).push(activity);
  }

  for (let i = 0; i < weeks; i += 1) {
    const currentWeekStart = addDays(weekStart, i * 7);
    currentWeekStart.setUTCHours(0, 0, 0, 0);
    const key = currentWeekStart.toISOString();
    const weekActivities = byWeek.get(key) ?? [];

    let totalDistanceM = 0;
    let totalElapsedTimeS = 0;
    let totalElevationGainM = 0;
    let easyDistanceM = 0;
    let moderateDistanceM = 0;
    let hardDistanceM = 0;
    let paceNumerator = 0;
    let paceDenominator = 0;
    let hrTotal = 0;
    let hrCount = 0;
    let longestRunId = null;
    let longRunDistanceM = 0;

    for (const a of weekActivities) {
      const distance = toNumber(a.distanceM) ?? 0;
      const elapsed = toNumber(a.elapsedTimeS) ?? 0;
      const elev = toNumber(a.elevationGainM) ?? 0;
      const pace = toNumber(a.avgPaceSecPerKm);

      totalDistanceM += distance;
      totalElapsedTimeS += elapsed;
      totalElevationGainM += elev;

      if (distance > longRunDistanceM) {
        longRunDistanceM = distance;
        longestRunId = a.id;
      }

      if (pace !== null) {
        paceNumerator += pace * distance;
        paceDenominator += distance;
        if (pace >= EASY_PACE_MIN) {
          easyDistanceM += distance;
        } else if (pace >= MODERATE_PACE_MIN) {
          moderateDistanceM += distance;
        } else {
          hardDistanceM += distance;
        }
      }

      if (a.avgHrBpm !== null && a.avgHrBpm !== undefined) {
        const hrValue = toNumber(a.avgHrBpm);
        if (hrValue !== null) {
          hrTotal += hrValue;
          hrCount += 1;
        }
      }
    }

    const avgPaceSecPerKm = paceDenominator > 0 ? paceNumerator / paceDenominator : null;
    const avgHrBpm = hrCount > 0 ? Math.round(hrTotal / hrCount) : null;
    // Deterministic completeness rule: 3 activities/week is treated as "full" coverage for seed quality checks.
    const completeness = Math.min(1, weekActivities.length / 3);
    const weeklyData = {
      weekEndDate: weekEndUtc(currentWeekStart),
      runCount: weekActivities.length,
      totalDistanceM: dec(totalDistanceM.toFixed(3)),
      totalElapsedTimeS: Math.round(totalElapsedTimeS),
      totalElevationGainM: dec(totalElevationGainM.toFixed(3)),
      longRunDistanceM: dec(longRunDistanceM.toFixed(3)),
      longestRunId,
      easyDistanceM: dec(easyDistanceM.toFixed(3)),
      moderateDistanceM: dec(moderateDistanceM.toFixed(3)),
      hardDistanceM: dec(hardDistanceM.toFixed(3)),
      avgPaceSecPerKm: avgPaceSecPerKm === null ? null : dec(avgPaceSecPerKm.toFixed(3)),
      avgHrBpm,
      dataCompleteness: dec(completeness.toFixed(4)),
    };

    const existing = await prisma.weeklyFeature.findUnique({
      where: {
        athleteId_weekStartDate: {
          athleteId,
          weekStartDate: currentWeekStart,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.weeklyFeature.update({
        where: { id: existing.id },
        data: weeklyData,
      });
      summary.updated += 1;
      summary.skipped += 1;
    } else {
      await prisma.weeklyFeature.create({
        data: {
          athleteId,
          weekStartDate: currentWeekStart,
          ...weeklyData,
        },
      });
      summary.created += 1;
    }
  }

  return summary;
};

export async function seedDatabase(prisma = new PrismaClient()) {
  const summary = {
    imports: { created: 0, skipped: 0 },
    rawFiles: { created: 0, skipped: 0 },
    stagingRows: { created: 0, skipped: 0 },
    activities: { created: 0, skipped: 0 },
    splits: { created: 0, skipped: 0 },
    routeSignatures: { created: 0, skipped: 0 },
    weeklyFeatures: { created: 0, skipped: 0, updated: 0 },
    idempotencyActions: [],
    normalizationBatches: 0,
    normalizeResults: { normalized: 0, skipped: 0, errors: 0 },
  };

  const [beforeActivityCount, beforeSplitCount, beforeRouteCount] = await prisma.$transaction([
    prisma.activity.count({
      where: {
        athleteId: SEED_ATHLETE_ID,
        sourceFileId: COMPLETED_RAW_FILE_ID,
      },
    }),
    prisma.activitySplitKm.count({
      where: {
        athleteId: SEED_ATHLETE_ID,
        activity: { sourceFileId: COMPLETED_RAW_FILE_ID },
      },
    }),
    prisma.routeSignature.count({
      where: {
        athleteId: SEED_ATHLETE_ID,
        activity: { sourceFileId: COMPLETED_RAW_FILE_ID },
      },
    }),
  ]);

  await ensureImports(prisma, summary);
  await ensureRawFiles(prisma, summary);

  const completedRows = buildCompletedStagingRows();
  const inProgressRows = buildInProgressStagingRows();

  await upsertStagingRows(prisma, completedRows, summary);
  await upsertStagingRows(prisma, inProgressRows, summary);

  await prepareCompletedImportForNormalization(prisma, summary);
  await runCompletedImportNormalization(prisma, summary);

  // Ensure in-progress import remains in-progress with staged rows available.
  await prisma.import.update({
    where: { id: IN_PROGRESS_IMPORT_ID },
    data: {
      status: "normalizing",
      hasMore: true,
      nextCursor: null,
    },
  });

  const weeklySummary = await computeWeeklyFeaturesForSeed(prisma, SEED_ATHLETE_ID, SEED_WEEK_START, SEED_WEEKS);
  summary.weeklyFeatures.created = weeklySummary.created;
  summary.weeklyFeatures.updated = weeklySummary.updated;
  summary.weeklyFeatures.skipped = weeklySummary.skipped;

  const counts = await prisma.$transaction([
    prisma.import.count({ where: { id: { in: [COMPLETED_IMPORT_ID, IN_PROGRESS_IMPORT_ID] } } }),
    prisma.stagingActivity.count({ where: { importId: { in: [COMPLETED_IMPORT_ID, IN_PROGRESS_IMPORT_ID] } } }),
    prisma.activity.count({ where: { athleteId: SEED_ATHLETE_ID, sourceFileId: COMPLETED_RAW_FILE_ID } }),
    prisma.activitySplitKm.count({
      where: {
        athleteId: SEED_ATHLETE_ID,
        activity: { sourceFileId: COMPLETED_RAW_FILE_ID },
      },
    }),
    prisma.routeSignature.count({
      where: {
        athleteId: SEED_ATHLETE_ID,
        activity: { sourceFileId: COMPLETED_RAW_FILE_ID },
      },
    }),
    prisma.weeklyFeature.count({
      where: {
        athleteId: SEED_ATHLETE_ID,
        weekStartDate: {
          gte: SEED_WEEK_START,
          lte: addDays(SEED_WEEK_START, (SEED_WEEKS - 1) * 7),
        },
      },
    }),
  ]);

  summary.activities.created = Math.max(0, counts[2] - beforeActivityCount);
  summary.activities.skipped = beforeActivityCount;
  summary.splits.created = Math.max(0, counts[3] - beforeSplitCount);
  summary.splits.skipped = beforeSplitCount;
  summary.routeSignatures.created = Math.max(0, counts[4] - beforeRouteCount);
  summary.routeSignatures.skipped = beforeRouteCount;

  if (summary.imports.skipped > 0) summary.idempotencyActions.push("skipped_existing_imports");
  if (summary.rawFiles.skipped > 0) summary.idempotencyActions.push("skipped_existing_raw_files");
  if (summary.stagingRows.skipped > 0) summary.idempotencyActions.push("skipped_existing_staging_rows");
  if (summary.activities.skipped > 0) summary.idempotencyActions.push("preserved_existing_normalized_activities");
  if (summary.weeklyFeatures.skipped > 0) summary.idempotencyActions.push("updated_existing_weekly_features");

  summary.finalCounts = {
    imports: counts[0],
    stagingRows: counts[1],
    normalizedActivitiesFromCompletedImport: counts[2],
    splits: counts[3],
    routeSignatures: counts[4],
    weeklyFeatures: counts[5],
  };

  return summary;
}
