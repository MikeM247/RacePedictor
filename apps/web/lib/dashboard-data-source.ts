import { z } from "zod";
import {
  driverContributionListSchema,
  featureTrendPointListSchema,
  importProgressSchema,
  predictionSummarySchema,
} from "../../../packages/core/src/contracts";

export const predictionSummaryViewSchema = predictionSummarySchema.pick({
  predictedTimeS: true,
  predictedPaceSecPerKm: true,
  bandLowS: true,
  bandHighS: true,
  modelVersion: true,
});

export const dashboardDataSchema = z.object({
  predictionSummary: predictionSummaryViewSchema,
  driverContributions: driverContributionListSchema,
  featureTrendPoints: featureTrendPointListSchema,
  importProgress: importProgressSchema,
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;

export interface DashboardDataSource {
  getDashboardData(): Promise<DashboardData>;
}
