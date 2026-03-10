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
