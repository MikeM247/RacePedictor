import type { PaceComparison, PaceComparisonRead } from "../../core/src/contracts/activity-pace-comparison.ts";
export function cachePaceComparison(input: { databasePath: string; comparison: PaceComparison }): void;
export function getLocalPaceComparison(input: { databasePath: string; athleteId: string; activityId: string }): PaceComparisonRead;
