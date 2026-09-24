import { defaultLocalDatabasePath } from "../../../packages/db/src/local-activities.js";
import {
  getLocalActivityReview as readReview,
  listLocalActivityReviews as readReviews,
  queueLocalActivityReview as queueReview,
} from "../../../packages/db/src/local-activity-review.js";
import { assertServerRuntime } from "./server/server-runtime.ts";

assertServerRuntime("local-activity-review-data-source");

const databasePath = () => process.env.RACEPREDICTOR_DATABASE_PATH || defaultLocalDatabasePath;
const athleteId = () => process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001";

export const getLocalActivityReview = (activityId: string) => readReview({ databasePath: databasePath(), athleteId: athleteId(), activityId });
export const listLocalActivityReviews = (limit?: number) => readReviews({ databasePath: databasePath(), athleteId: athleteId(), limit });
export const queueLocalActivityReview = (activityId: string) => queueReview({ databasePath: databasePath(), athleteId: athleteId(), activityId });
