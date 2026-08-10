export const DEFAULT_TARGET_DISTANCE_M: number;

export function runLocalAnalytics(options: {
  databasePath: string;
  snapshotPath: string;
  athleteId?: string;
  targetDistanceM?: number;
}): Promise<{
  snapshotPath: string;
  weeklyFeatureCount: number;
}>;
