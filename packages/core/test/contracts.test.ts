import assert from "node:assert/strict";
import test from "node:test";
import {
  activitiesListResponseSchema,
  activityDetailResponseSchema,
} from "../src/contracts/activity.ts";
import { dashboardOverviewResponseSchema } from "../src/contracts/dashboard.ts";
import {
  importNormalizeResponseSchema,
  importUploadApiErrorResponseSchema,
  importUploadApiResponseSchema,
  importUploadRequestSchema,
} from "../src/contracts/imports.ts";
import { weeklyFeaturesResponseSchema } from "../src/contracts/weekly.ts";
import {
  validateActivityDetailResponse,
  validateDashboardOverviewResponse,
  validateImportNormalizeResponse,
  validateWeeklyFeaturesResponse,
} from "../src/contracts/runtime-validators.ts";

const prediction = {
  athleteId: "athlete_001",
  targetDistanceM: 21_097.5,
  predictedTimeS: 8094,
  predictedPaceSecPerKm: 383.6,
  bandLowS: 7541,
  bandHighS: 8647,
  modelVersion: "test-v1",
  generatedAt: "2026-08-04T00:00:00.000Z",
};

const successDashboard = {
  fetchStatus: "success" as const,
  stale: { isStale: false },
  requestId: "additive-field-is-allowed",
  data: {
    predictionSummary: prediction,
    predictionOptions: [prediction],
    driverContributions: [{
      key: "consistency", label: "Training consistency", contributionPct: 25,
      direction: "positive", confidence: 0.8,
    }],
    featureTrendPoints: [{
      weekStart: "2026-08-03", featureKey: "weekly_distance_km",
      featureLabel: "Weekly distance", value: 42, unit: "km",
    }],
    importProgress: {
      importId: "import_1", status: "completed", stagedCount: 12,
      normalizedCount: 11, duplicateCount: 1, rejectedCount: 0,
      updatedAt: "2026-08-04T00:00:00.000Z",
    },
  },
};

test("dashboard schema accepts truthful success, empty, and error variants", () => {
  assert.equal(dashboardOverviewResponseSchema.safeParse(successDashboard).success, true);
  assert.equal(dashboardOverviewResponseSchema.safeParse({
    fetchStatus: "empty", stale: { isStale: false },
  }).success, true);
  assert.equal(dashboardOverviewResponseSchema.safeParse({
    fetchStatus: "error",
    errorMessage: "Snapshot unavailable",
    stale: {
      isStale: true,
      staleReason: "Last refresh failed",
      staleAtIso: "2026-08-04T00:00:00.000Z",
    },
  }).success, true);
});

test("dashboard schema rejects status-shape mixing and invalid stale metadata", () => {
  assert.equal(dashboardOverviewResponseSchema.safeParse({
    fetchStatus: "success", stale: { isStale: false },
  }).success, false);
  assert.equal(dashboardOverviewResponseSchema.safeParse({
    fetchStatus: "empty", stale: { isStale: false }, data: successDashboard.data,
  }).success, false);
  assert.equal(dashboardOverviewResponseSchema.safeParse({
    fetchStatus: "error", stale: { isStale: "false" }, errorMessage: "Unavailable",
  }).success, false);
  assert.equal(dashboardOverviewResponseSchema.safeParse({
    fetchStatus: "error", stale: { isStale: false }, errorMessage: "",
  }).success, false);
});

test("activity schemas match route DTO booleans, optional cursor, and nullable route", () => {
  const summary = {
    id: "activity_1", athleteId: "athlete_001", title: null,
    occurredAt: "2026-08-03T05:00:00.000Z", localOccurredAt: null,
    sport: "run" as const, distanceM: 5000, elapsedTimeS: 1800,
    avgPaceSecPerKm: 360, elevationGainM: 30,
    hrAvailable: true, cadenceAvailable: false,
  };
  assert.equal(activitiesListResponseSchema.safeParse({ items: [summary] }).success, true);
  const detail = {
    ...summary,
    sourceType: "gpx" as const,
    sourceFileId: null,
    sourceActivityId: null,
    endedAt: "2026-08-03T05:30:00.000Z",
    movingTimeS: null,
    elevationLossM: 30,
    avgHrBpm: null,
    dedupeHash: "hash",
    createdAt: "2026-08-03T06:00:00.000Z",
    splits: [],
    routeSignature: null,
  };
  assert.equal(activityDetailResponseSchema.safeParse({ activity: detail }).success, true);
  assert.equal(validateActivityDetailResponse({ activity: detail }).success, true);
  assert.equal(activityDetailResponseSchema.safeParse({
    activity: { ...detail, hrAvailable: "true" },
  }).success, false);
});

test("weekly and normalize schemas honor nullable metrics and boolean pagination", () => {
  const weekly = {
    id: "week_1", athleteId: "athlete_001",
    weekStartDate: "2026-08-03T00:00:00.000Z",
    weekEndDate: "2026-08-09T23:59:59.000Z",
    runCount: 0, totalDistanceM: 0, totalElapsedTimeS: 0,
    totalElevationGainM: 0, longRunDistanceM: 0, longestRunId: null,
    easyDistanceM: 0, moderateDistanceM: 0, hardDistanceM: 0,
    avgPaceSecPerKm: null, avgHrBpm: null, strainScore: null,
    monotonyScore: null, consistencyScore: null, dataCompleteness: 0,
    createdAt: "2026-08-10T00:00:00.000Z",
  };
  assert.equal(weeklyFeaturesResponseSchema.safeParse({ items: [weekly] }).success, true);
  assert.equal(validateWeeklyFeaturesResponse({ items: [weekly] }).success, true);

  const normalized = {
    importId: "import_1", normalizedCount: 1, skippedCount: 0,
    errorCount: 0, hasMore: false,
  };
  assert.equal(importNormalizeResponseSchema.safeParse(normalized).success, true);
  assert.equal(validateImportNormalizeResponse(normalized).success, true);
  assert.equal(importNormalizeResponseSchema.safeParse({ ...normalized, hasMore: "false" }).success, false);
});

test("runtime validator reports the same dashboard rejection with a useful path", () => {
  const result = validateDashboardOverviewResponse({
    fetchStatus: "error", stale: { isStale: "false" }, errorMessage: "Unavailable",
  });
  assert.equal(result.success, false);
  assert.equal(result.issues.some((issue) => issue.path === "stale.isStale"), true);
});

test("shared upload API schemas match the standard success and error envelopes", () => {
  const upload = {
    importId: "import_1",
    status: "completed",
    sourceType: "gpx",
    reused: false,
    stagedCount: 1,
    normalizedCount: 1,
    duplicateCount: 0,
    rejectedCount: 0,
    parseWarnings: [],
    analyticsRefreshed: true,
  };
  assert.equal(importUploadRequestSchema.safeParse({ name: "activity.gpx", type: "application/gpx+xml", size: 1024 }).success, true);
  assert.equal(importUploadRequestSchema.safeParse({ name: "", type: "application/gpx+xml", size: 0 }).success, false);
  assert.equal(importUploadApiResponseSchema.safeParse({ data: upload }).success, true);
  assert.equal(importUploadApiResponseSchema.safeParse(upload).success, false);
  assert.equal(importUploadApiErrorResponseSchema.safeParse({
    error: {
      code: "VALIDATION_ERROR",
      message: "Multipart field 'file' is required",
      details: [{ path: ["file"], message: "Required" }],
    },
  }).success, true);
});
