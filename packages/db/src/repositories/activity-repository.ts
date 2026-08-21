import type { Prisma } from "@prisma/client";

export type ActivityCreateInput = Prisma.ActivityCreateInput;
export type ActivityWhereUniqueInput = Prisma.ActivityWhereUniqueInput;

export interface ActivityRepository {
  create(data: ActivityCreateInput): Promise<{ id: string }>;
  findByUnique(where: ActivityWhereUniqueInput): Promise<ActivityRecord | null>;
}

export interface ActivityRecord {
  id: string;
  athleteId: string;
  sourceType: string;
  sourceActivityId: string | null;
  dedupeHash: string;
  occurredAt: Date;
  endedAt: Date;
  elapsedTimeS: number;
  movingTimeS: number | null;
  sport: string;
  distanceM: Prisma.Decimal;
  avgPaceSecPerKm: Prisma.Decimal;
  elevationGainM: Prisma.Decimal;
  elevationLossM: Prisma.Decimal;
  hrAvailable: boolean;
  cadenceAvailable: boolean;
  createdAt: Date;
}

export type ActivitySplitKmCreateManyInput = Prisma.ActivitySplitKmCreateManyInput;

export interface ActivitySplitKmRecord {
  id: string;
  activityId: string;
  athleteId: string;
  splitIndex: number;
  startOffsetS: number;
  endOffsetS: number;
  durationS: number;
  distanceM: Prisma.Decimal;
  paceSecPerKm: Prisma.Decimal;
  elevGainM: Prisma.Decimal;
  elevLossM: Prisma.Decimal;
  avgHrBpm: number | null;
  maxHrBpm: number | null;
  avgCadenceSpm: Prisma.Decimal | null;
  createdAt: Date;
}

export type WeeklyFeatureCreateInput = Prisma.WeeklyFeatureCreateInput;
export type WeeklyFeatureWhereUniqueInput = Prisma.WeeklyFeatureWhereUniqueInput;

export interface WeeklyFeatureRecord {
  id: string;
  athleteId: string;
  weekStartDate: Date;
  weekEndDate: Date;
  runCount: number;
  totalDistanceM: Prisma.Decimal;
  totalElapsedTimeS: number;
  totalElevationGainM: Prisma.Decimal;
  longRunDistanceM: Prisma.Decimal;
  longestRunId: string | null;
  easyDistanceM: Prisma.Decimal;
  moderateDistanceM: Prisma.Decimal;
  hardDistanceM: Prisma.Decimal;
  avgPaceSecPerKm: Prisma.Decimal | null;
  avgHrBpm: number | null;
  strainScore: Prisma.Decimal | null;
  monotonyScore: Prisma.Decimal | null;
  consistencyScore: Prisma.Decimal | null;
  dataCompleteness: Prisma.Decimal;
  createdAt: Date;
}
