import { z } from "zod";

export const weeklyFeatureSchema = z.object({
  id: z.string().min(1),
  athleteId: z.string().min(1),
  weekStartDate: z.string().datetime(),
  weekEndDate: z.string().datetime(),
  runCount: z.number().int().nonnegative(),
  totalDistanceM: z.number().nonnegative(),
  totalElapsedTimeS: z.number().int().nonnegative(),
  totalElevationGainM: z.number().nonnegative(),
  longRunDistanceM: z.number().nonnegative(),
  longestRunId: z.string().min(1).nullable().optional(),
  easyDistanceM: z.number().nonnegative(),
  moderateDistanceM: z.number().nonnegative(),
  hardDistanceM: z.number().nonnegative(),
  avgPaceSecPerKm: z.number().nonnegative().nullable().optional(),
  avgHrBpm: z.number().nonnegative().nullable().optional(),
  strainScore: z.number().nonnegative().nullable().optional(),
  monotonyScore: z.number().nonnegative().nullable().optional(),
  consistencyScore: z.number().nonnegative().nullable().optional(),
  dataCompleteness: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
});

export const weeklyFeaturesResponseSchema = z.object({
  items: z.array(weeklyFeatureSchema),
  nextCursor: z.string().min(1).optional(),
});

export const weeklyFeaturesByAthleteResponseSchema = z.object({
  athleteId: z.string().min(1),
  items: z.array(weeklyFeatureSchema),
});

export type WeeklyFeatureDTO = {
  id: string;
  athleteId: string;
  weekStartDate: string;
  weekEndDate: string;
  runCount: number;
  totalDistanceM: number;
  totalElapsedTimeS: number;
  totalElevationGainM: number;
  longRunDistanceM: number;
  longestRunId?: string | null;
  easyDistanceM: number;
  moderateDistanceM: number;
  hardDistanceM: number;
  avgPaceSecPerKm?: number | null;
  avgHrBpm?: number | null;
  strainScore?: number | null;
  monotonyScore?: number | null;
  consistencyScore?: number | null;
  dataCompleteness: number;
  createdAt: string;
};

export type WeeklyFeaturesResponse = {
  items: WeeklyFeatureDTO[];
  nextCursor?: string;
};

export type WeeklyFeaturesByAthleteResponse = {
  athleteId: string;
  items: WeeklyFeatureDTO[];
};
