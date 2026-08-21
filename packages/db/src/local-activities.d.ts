import type { ActivitiesListResponse, ActivityDetail } from "../../core/src/contracts/activity";

export const defaultLocalDatabasePath: string;

export type ListLocalActivitiesOptions = {
  databasePath?: string;
  athleteId?: string;
  cursor?: string | null;
  limit?: number;
  sport?: "run" | "trail_run" | "treadmill_run" | "other" | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
};

export function listLocalActivities(options?: ListLocalActivitiesOptions): ActivitiesListResponse;
export function getLocalActivity(options: {
  activityId: string;
  databasePath?: string;
  athleteId?: string;
}): ActivityDetail | null;
