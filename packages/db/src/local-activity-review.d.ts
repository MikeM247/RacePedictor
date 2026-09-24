import type {
  ActivityCoachReview,
  ActivityCoachReviewResponse,
  ActivityReviewRequestStatus,
} from "../../core/src/contracts/activity-review";

export function queueLocalActivityReview(options: { databasePath: string; athleteId?: string; activityId: string }): {
  activityId: string; requestId: string; status: "queued"; reused: boolean; updatedAt: string;
};
export function getLocalActivityReview(options: { databasePath: string; athleteId?: string; activityId: string }): ActivityCoachReviewResponse["data"];
export function listLocalActivityReviews(options: { databasePath: string; athleteId?: string; limit?: number }): ActivityCoachReview[];
export function queueUnreviewedLocalActivities(options: { databasePath: string; athleteId?: string; now?: () => string }): number;
export function claimLocalActivityReview(options: { databasePath: string; athleteId?: string; now?: () => string }): { activityId: string; attemptCount: number } | null;
export function markLocalActivityReviewFailure(options: { databasePath: string; athleteId?: string; activityId: string; code: string; retry?: boolean; now?: () => string }): void;
export function saveLocalActivityReview(options: { databasePath: string; athleteId?: string; activityId: string; review: ActivityCoachReview; now?: () => string }): ActivityCoachReview;
export function buildLocalReviewInput(options: { databasePath: string; athleteId?: string; activityId: string }): { activity: any; sessions: any[] };
