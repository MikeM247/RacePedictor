import { assertServerRuntime } from "./server/server-runtime.ts";

import type { ActivitiesListResponse, ActivityDetail } from "../../../packages/core/src/contracts";
import {
  getLocalActivity,
  listLocalActivities,
  type ListLocalActivitiesOptions,
} from "../../../packages/db/src/local-activities.js";

assertServerRuntime("local-activities-data-source");

export function getActivities(options: ListLocalActivitiesOptions = {}): ActivitiesListResponse {
  return listLocalActivities(options);
}

export function getActivity(activityId: string): ActivityDetail | null {
  return getLocalActivity({ activityId });
}
