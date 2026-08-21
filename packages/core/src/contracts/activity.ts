import { z } from "zod";

export const sourceTypeSchema = z.enum(["gpx", "tcx", "csv", "manual", "strava"]);
const sportSchema = z.enum(["run", "trail_run", "treadmill_run", "other"]);

export const activitySplitKmSchema = z.object({
  id: z.string().min(1),
  activityId: z.string().min(1),
  athleteId: z.string().min(1),
  splitIndex: z.number().int().nonnegative(),
  startOffsetS: z.number().int().nonnegative(),
  endOffsetS: z.number().int().nonnegative(),
  durationS: z.number().int().nonnegative(),
  distanceM: z.number().nonnegative(),
  paceSecPerKm: z.number().nonnegative(),
  elevGainM: z.number().nonnegative(),
  elevLossM: z.number().nonnegative(),
  avgHrBpm: z.number().nullable().optional(),
  maxHrBpm: z.number().nullable().optional(),
  avgCadenceSpm: z.number().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const routeSignatureSchema = z.object({
  id: z.string().min(1),
  activityId: z.string().min(1),
  athleteId: z.string().min(1),
  startLat: z.number(),
  startLon: z.number(),
  endLat: z.number(),
  endLon: z.number(),
  bboxMinLat: z.number(),
  bboxMinLon: z.number(),
  bboxMaxLat: z.number(),
  bboxMaxLon: z.number(),
  polyline: z.string().nullable().optional(),
  elevProfile: z.unknown().nullable().optional(),
  routeHash: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const activitySummarySchema = z.object({
  id: z.string().min(1),
  athleteId: z.string().min(1),
  title: z.string().nullable().optional(),
  occurredAt: z.string().datetime(),
  localOccurredAt: z.string().nullable().optional(),
  sport: sportSchema,
  distanceM: z.number().nonnegative(),
  elapsedTimeS: z.number().int().nonnegative(),
  avgPaceSecPerKm: z.number().nonnegative(),
  elevationGainM: z.number().nonnegative(),
  hrAvailable: z.boolean(),
  cadenceAvailable: z.boolean(),
});

export const activityDetailSchema = activitySummarySchema.extend({
  endedAt: z.string().datetime(),
  sourceType: sourceTypeSchema,
  sourceFileId: z.string().nullable().optional(),
  sourceActivityId: z.string().nullable().optional(),
  movingTimeS: z.number().int().nonnegative().nullable().optional(),
  elevationLossM: z.number().nonnegative(),
  avgHrBpm: z.number().nullable().optional(),
  maxHrBpm: z.number().nullable().optional(),
  minHrBpm: z.number().nullable().optional(),
  avgCadenceSpm: z.number().nullable().optional(),
  maxCadenceSpm: z.number().nullable().optional(),
  calories: z.number().nullable().optional(),
  aerobicTrainingEffect: z.number().nullable().optional(),
  avgStrideLengthM: z.number().nullable().optional(),
  avgVerticalRatioPct: z.number().nullable().optional(),
  avgVerticalOscillationCm: z.number().nullable().optional(),
  avgGroundContactTimeMs: z.number().nullable().optional(),
  normalizedPowerW: z.number().nullable().optional(),
  trainingStressScore: z.number().nullable().optional(),
  avgPowerW: z.number().nullable().optional(),
  maxPowerW: z.number().nullable().optional(),
  steps: z.number().nullable().optional(),
  bodyBatteryDrain: z.number().nullable().optional(),
  lapCount: z.number().nullable().optional(),
  minElevationM: z.number().nullable().optional(),
  maxElevationM: z.number().nullable().optional(),
  paceVariability: z.number().nullable().optional(),
  hrDriftPct: z.number().nullable().optional(),
  hillDifficulty: z.number().nullable().optional(),
  dedupeHash: z.string().min(1),
  createdAt: z.string().datetime(),
  splits: z.array(activitySplitKmSchema),
  routeSignature: routeSignatureSchema.nullable().optional(),
});

export const activitiesListResponseSchema = z.object({
  items: z.array(activitySummarySchema),
  nextCursor: z.string().min(1).optional(),
});

export const activityDetailResponseSchema = z.object({
  activity: activityDetailSchema,
});

export const activitySplitsResponseSchema = z.object({
  activityId: z.string().min(1),
  items: z.array(activitySplitKmSchema),
});

export type ActivitySplitKmDTO = {
  id: string;
  activityId: string;
  athleteId: string;
  splitIndex: number;
  startOffsetS: number;
  endOffsetS: number;
  durationS: number;
  distanceM: number;
  paceSecPerKm: number;
  elevGainM: number;
  elevLossM: number;
  avgHrBpm?: number | null;
  maxHrBpm?: number | null;
  avgCadenceSpm?: number | null;
  createdAt: string;
};

export type RouteSignatureDTO = {
  id: string;
  activityId: string;
  athleteId: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  bboxMinLat: number;
  bboxMinLon: number;
  bboxMaxLat: number;
  bboxMaxLon: number;
  polyline?: string | null;
  elevProfile?: unknown | null;
  routeHash: string;
  createdAt: string;
};

export type ActivitySummary = {
  id: string;
  athleteId: string;
  title?: string | null;
  occurredAt: string;
  localOccurredAt?: string | null;
  sport: "run" | "trail_run" | "treadmill_run" | "other";
  distanceM: number;
  elapsedTimeS: number;
  avgPaceSecPerKm: number;
  elevationGainM: number;
  hrAvailable: boolean;
  cadenceAvailable: boolean;
};

export type ActivityDetail = ActivitySummary & {
  sourceType: "gpx" | "tcx" | "csv" | "manual" | "strava";
  sourceFileId?: string | null;
  sourceActivityId?: string | null;
  endedAt: string;
  movingTimeS?: number | null;
  elevationLossM: number;
  avgHrBpm?: number | null;
  maxHrBpm?: number | null;
  minHrBpm?: number | null;
  avgCadenceSpm?: number | null;
  maxCadenceSpm?: number | null;
  calories?: number | null;
  aerobicTrainingEffect?: number | null;
  avgStrideLengthM?: number | null;
  avgVerticalRatioPct?: number | null;
  avgVerticalOscillationCm?: number | null;
  avgGroundContactTimeMs?: number | null;
  normalizedPowerW?: number | null;
  trainingStressScore?: number | null;
  avgPowerW?: number | null;
  maxPowerW?: number | null;
  steps?: number | null;
  bodyBatteryDrain?: number | null;
  lapCount?: number | null;
  minElevationM?: number | null;
  maxElevationM?: number | null;
  paceVariability?: number | null;
  hrDriftPct?: number | null;
  hillDifficulty?: number | null;
  dedupeHash: string;
  createdAt: string;
  splits: ActivitySplitKmDTO[];
  routeSignature?: RouteSignatureDTO | null;
};

export type ActivitiesListResponse = {
  items: ActivitySummary[];
  nextCursor?: string;
};

export type ActivityDetailResponse = {
  activity: ActivityDetail;
};

export type ActivitySplitsResponse = {
  activityId: string;
  items: ActivitySplitKmDTO[];
};
