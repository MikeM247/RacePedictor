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
  distanceM: number;
  avgPaceSecPerKm: number;
  elevationGainM: number;
  elevationLossM: number;
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
  distanceM: number;
  paceSecPerKm: number;
  elevGainM: number;
  elevLossM: number;
  avgHrBpm: number | null;
  maxHrBpm: number | null;
  avgCadenceSpm: number | null;
  createdAt: Date;
}
