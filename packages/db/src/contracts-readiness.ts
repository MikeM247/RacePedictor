import { PrismaClient } from "@prisma/client";
import {
  validateActivitiesListResponse,
  validateActivityDetailResponse,
  validateActivitySplitsResponse,
  validateDashboardOverviewResponse,
  validateImportNormalizeResponse,
  validateImportUploadResponse,
  validateWeeklyFeaturesByAthleteResponse,
  validateWeeklyFeaturesResponse,
} from "../../core/src/contracts/runtime-validators.ts";
import {
  COMPLETED_IMPORT_ID,
  COMPLETED_RAW_FILE_ID,
  IN_PROGRESS_IMPORT_ID,
  SEED_ATHLETE_ID,
  seedDatabase,
} from "./seed.js";

type ValidationIssue = {
  path: string;
  message: string;
};

type CheckResult = {
  name: string;
  passed: boolean;
  errors: ValidationIssue[];
};

type AreaResult = {
  area: string;
  passed: boolean;
  checks: CheckResult[];
  sampleIds?: Record<string, string | number | boolean | null>;
};

type ContractReadinessSummary = {
  story: "DB-5";
  passed: boolean;
  timestamp: string;
  areas: AreaResult[];
  failures: Array<{
    area: string;
    check: string;
    path: string;
    message: string;
  }>;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number(value.toString());
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const warningsToStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
};

const toIso = (value: Date) => value.toISOString();

const parseCheck = (
  name: string,
  validator: (payload: unknown) => { success: boolean; issues: Array<{ path: string; message: string }> },
  payload: unknown,
): CheckResult => {
  const parsed = validator(payload);
  if (parsed.success) {
    return { name, passed: true, errors: [] };
  }
  return {
    name,
    passed: false,
    errors: parsed.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })),
  };
};

const conditionCheck = (name: string, condition: boolean, message: string): CheckResult => {
  if (condition) {
    return { name, passed: true, errors: [] };
  }
  return { name, passed: false, errors: [{ path: "<condition>", message }] };
};

const mapSplit = (split: any) => ({
  id: split.id,
  activityId: split.activityId,
  athleteId: split.athleteId,
  splitIndex: split.splitIndex,
  startOffsetS: split.startOffsetS,
  endOffsetS: split.endOffsetS,
  durationS: split.durationS,
  distanceM: toNumber(split.distanceM),
  paceSecPerKm: toNumber(split.paceSecPerKm),
  elevGainM: toNumber(split.elevGainM),
  elevLossM: toNumber(split.elevLossM),
  avgHrBpm: split.avgHrBpm,
  maxHrBpm: split.maxHrBpm,
  avgCadenceSpm: split.avgCadenceSpm === null ? null : toNumber(split.avgCadenceSpm),
  createdAt: toIso(split.createdAt),
});

const mapRoute = (route: any) => {
  if (!route) return null;
  return {
    id: route.id,
    activityId: route.activityId,
    athleteId: route.athleteId,
    startLat: toNumber(route.startLat),
    startLon: toNumber(route.startLon),
    endLat: toNumber(route.endLat),
    endLon: toNumber(route.endLon),
    bboxMinLat: toNumber(route.bboxMinLat),
    bboxMinLon: toNumber(route.bboxMinLon),
    bboxMaxLat: toNumber(route.bboxMaxLat),
    bboxMaxLon: toNumber(route.bboxMaxLon),
    polyline: route.polyline,
    elevProfile: route.elevProfile,
    routeHash: route.routeHash,
    createdAt: toIso(route.createdAt),
  };
};

const mapActivitySummary = (activity: any) => ({
  id: activity.id,
  athleteId: activity.athleteId,
  occurredAt: toIso(activity.occurredAt),
  sport: activity.sport,
  distanceM: toNumber(activity.distanceM),
  elapsedTimeS: activity.elapsedTimeS,
  avgPaceSecPerKm: toNumber(activity.avgPaceSecPerKm),
  elevationGainM: toNumber(activity.elevationGainM),
  hrAvailable: activity.hrAvailable,
  cadenceAvailable: activity.cadenceAvailable,
});

const mapActivityDetail = (activity: any) => ({
  ...mapActivitySummary(activity),
  sourceType: activity.sourceType,
  sourceFileId: activity.sourceFileId,
  sourceActivityId: activity.sourceActivityId,
  endedAt: toIso(activity.endedAt),
  movingTimeS: activity.movingTimeS,
  elevationLossM: toNumber(activity.elevationLossM),
  avgHrBpm: activity.avgHrBpm,
  maxHrBpm: activity.maxHrBpm,
  minHrBpm: activity.minHrBpm,
  avgCadenceSpm: activity.avgCadenceSpm === null ? null : toNumber(activity.avgCadenceSpm),
  maxCadenceSpm: activity.maxCadenceSpm === null ? null : toNumber(activity.maxCadenceSpm),
  paceVariability: activity.paceVariability === null ? null : toNumber(activity.paceVariability),
  hrDriftPct: activity.hrDriftPct === null ? null : toNumber(activity.hrDriftPct),
  hillDifficulty: activity.hillDifficulty === null ? null : toNumber(activity.hillDifficulty),
  dedupeHash: activity.dedupeHash,
  createdAt: toIso(activity.createdAt),
  splits: activity.splits.map(mapSplit),
  routeSignature: mapRoute(activity.routeSignature),
});

const mapWeeklyFeature = (feature: any) => ({
  id: feature.id,
  athleteId: feature.athleteId,
  weekStartDate: toIso(feature.weekStartDate),
  weekEndDate: toIso(feature.weekEndDate),
  runCount: feature.runCount,
  totalDistanceM: toNumber(feature.totalDistanceM),
  totalElapsedTimeS: feature.totalElapsedTimeS,
  totalElevationGainM: toNumber(feature.totalElevationGainM),
  longRunDistanceM: toNumber(feature.longRunDistanceM),
  longestRunId: feature.longestRunId,
  easyDistanceM: toNumber(feature.easyDistanceM),
  moderateDistanceM: toNumber(feature.moderateDistanceM),
  hardDistanceM: toNumber(feature.hardDistanceM),
  avgPaceSecPerKm: feature.avgPaceSecPerKm === null ? null : toNumber(feature.avgPaceSecPerKm),
  avgHrBpm: feature.avgHrBpm,
  strainScore: feature.strainScore === null ? null : toNumber(feature.strainScore),
  monotonyScore: feature.monotonyScore === null ? null : toNumber(feature.monotonyScore),
  consistencyScore: feature.consistencyScore === null ? null : toNumber(feature.consistencyScore),
  dataCompleteness: toNumber(feature.dataCompleteness),
  createdAt: toIso(feature.createdAt),
});

const buildArea = (area: string, checks: CheckResult[], sampleIds?: Record<string, string | number | boolean | null>): AreaResult => ({
  area,
  passed: checks.every((check) => check.passed),
  checks,
  sampleIds,
});

const placeholderPredictionSummary = {
  athleteId: SEED_ATHLETE_ID,
  predictedTimeS: 5710,
  predictedPaceSecPerKm: 271.9,
  bandLowS: 5550,
  bandHighS: 5920,
  modelVersion: "seed-db5-v1",
  generatedAt: "2026-02-20T08:15:00.000Z",
};

const placeholderDrivers = [
  {
    key: "consistency",
    label: "Training consistency",
    contributionPct: 32.5,
    direction: "positive",
    confidence: 0.89,
  },
  {
    key: "acute_load",
    label: "Acute load",
    contributionPct: -18.4,
    direction: "negative",
    confidence: 0.78,
  },
  {
    key: "terrain_specificity",
    label: "Terrain specificity",
    contributionPct: 11.8,
    direction: "positive",
    confidence: 0.71,
  },
];

export async function runContractReadinessValidation(prisma = new PrismaClient()): Promise<ContractReadinessSummary> {
  await seedDatabase(prisma);

  const [completedImport, inProgressImport, activities, weeklyFeatures] = await prisma.$transaction([
    prisma.import.findUnique({ where: { id: COMPLETED_IMPORT_ID } }),
    prisma.import.findUnique({ where: { id: IN_PROGRESS_IMPORT_ID } }),
    prisma.activity.findMany({
      where: {
        athleteId: SEED_ATHLETE_ID,
        sourceFileId: COMPLETED_RAW_FILE_ID,
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
      include: {
        splits: {
          orderBy: { splitIndex: "asc" },
        },
        routeSignature: true,
      },
    }),
    prisma.weeklyFeature.findMany({
      where: { athleteId: SEED_ATHLETE_ID },
      orderBy: { weekStartDate: "desc" },
      take: 24,
    }),
  ]);

  const preconditionChecks = [
    conditionCheck("Completed import exists", completedImport !== null, `Missing import ${COMPLETED_IMPORT_ID}`),
    conditionCheck("In-progress import exists", inProgressImport !== null, `Missing import ${IN_PROGRESS_IMPORT_ID}`),
    conditionCheck("Seeded activities exist", activities.length > 0, "Expected at least one seeded activity"),
    conditionCheck("Seeded weekly features exist", weeklyFeatures.length > 0, "Expected at least one weekly feature"),
  ];

  const listPayload = {
    items: activities.map(mapActivitySummary),
    nextCursor: activities.length > 0 ? activities[activities.length - 1].id : undefined,
  };

  const detailPayload = {
    activity: activities.length > 0 ? mapActivityDetail(activities[0]) : null,
  };

  const splitsPayload = {
    activityId: activities.length > 0 ? activities[0].id : "",
    items: activities.length > 0 ? activities[0].splits.map(mapSplit) : [],
  };

  const weeklyListPayload = {
    items: weeklyFeatures.map(mapWeeklyFeature),
    nextCursor: weeklyFeatures.length > 0 ? weeklyFeatures[weeklyFeatures.length - 1].id : undefined,
  };

  const weeklyByAthletePayload = {
    athleteId: SEED_ATHLETE_ID,
    items: weeklyFeatures.map(mapWeeklyFeature),
  };

  const uploadPayload = completedImport
    ? {
        importId: completedImport.id,
        status: completedImport.status,
        stagedCount: completedImport.stagedCount,
        duplicateCount: completedImport.duplicateCount,
        rejectedCount: completedImport.rejectedCount,
        parseWarnings: warningsToStrings(completedImport.parseWarnings),
      }
    : {};

  const normalizePayload = completedImport
    ? {
        importId: completedImport.id,
        normalizedCount: completedImport.normalizedCount,
        skippedCount: completedImport.skippedCount,
        errorCount: completedImport.errorCount,
        nextCursor: completedImport.nextCursor ?? undefined,
        hasMore: completedImport.hasMore,
      }
    : {};

  const importProgressSource = completedImport ?? inProgressImport;
  const trendPoints = weeklyFeatures.slice(0, 12).reverse().map((feature) => ({
    weekStart: feature.weekStartDate.toISOString().slice(0, 10),
    featureKey: "weekly_distance_km",
    featureLabel: "Weekly distance",
    value: Number((toNumber(feature.totalDistanceM) / 1000).toFixed(2)),
    unit: "km",
  }));

  const dashboardPayload = importProgressSource
    ? {
        fetchStatus: "success" as const,
        stale: {
          isStale: false,
        },
        data: {
          predictionSummary: placeholderPredictionSummary,
          driverContributions: placeholderDrivers,
          featureTrendPoints: trendPoints,
          importProgress: {
            importId: importProgressSource.id,
            status: importProgressSource.status,
            stagedCount: importProgressSource.stagedCount,
            normalizedCount: importProgressSource.normalizedCount,
            duplicateCount: importProgressSource.duplicateCount,
            rejectedCount: importProgressSource.rejectedCount,
            updatedAt: toIso(importProgressSource.updatedAt),
          },
        },
      }
    : {
        fetchStatus: "error" as const,
        errorMessage: "No imports available",
        stale: {
          isStale: true,
          staleReason: "Missing import data",
          staleAtIso: "2026-01-01T00:00:00.000Z",
        },
      };

  const areas: AreaResult[] = [
    buildArea("preconditions", preconditionChecks, {
      completedImportId: completedImport?.id ?? null,
      inProgressImportId: inProgressImport?.id ?? null,
      activityCount: activities.length,
      weeklyFeatureCount: weeklyFeatures.length,
    }),
    buildArea(
      "overview",
      [parseCheck("GET /api/v1/dashboard/overview", validateDashboardOverviewResponse, dashboardPayload)],
      {
        importId: importProgressSource?.id ?? null,
        trendPointCount: trendPoints.length,
      },
    ),
    buildArea(
      "activities",
      [
        parseCheck("GET /api/v1/activities", validateActivitiesListResponse, listPayload),
        parseCheck("GET /api/v1/activities/:activityId", validateActivityDetailResponse, detailPayload),
        parseCheck("GET /api/v1/activities/:activityId/splits", validateActivitySplitsResponse, splitsPayload),
      ],
      {
        sampleActivityId: activities.length > 0 ? activities[0].id : null,
        sampleSplitCount: activities.length > 0 ? activities[0].splits.length : 0,
      },
    ),
    buildArea(
      "performance",
      [
        parseCheck("GET /api/v1/features/weekly", validateWeeklyFeaturesResponse, weeklyListPayload),
        parseCheck("GET /api/v1/features/weekly/:athleteId", validateWeeklyFeaturesByAthleteResponse, weeklyByAthletePayload),
      ],
      {
        sampleWeekId: weeklyFeatures.length > 0 ? weeklyFeatures[0].id : null,
      },
    ),
    buildArea(
      "data_quality",
      [
        parseCheck("POST /api/v1/imports/upload (response shape)", validateImportUploadResponse, uploadPayload),
        parseCheck("POST /api/v1/imports/:id/normalize (response shape)", validateImportNormalizeResponse, normalizePayload),
      ],
      {
        completedImportId: completedImport?.id ?? null,
      },
    ),
    buildArea("validator_self_test", [
      conditionCheck(
        "Negative schema parse fails as expected",
        !validateDashboardOverviewResponse({
          fetchStatus: "success",
          stale: { isStale: false },
        }).success,
        "Expected invalid dashboard payload to fail schema validation",
      ),
    ]),
  ];

  const failures: ContractReadinessSummary["failures"] = [];
  for (const area of areas) {
    for (const check of area.checks) {
      if (!check.passed) {
        for (const error of check.errors) {
          failures.push({
            area: area.area,
            check: check.name,
            path: error.path,
            message: error.message,
          });
        }
      }
    }
  }

  return {
    story: "DB-5",
    passed: areas.every((area) => area.passed),
    timestamp: new Date().toISOString(),
    areas,
    failures,
  };
}
