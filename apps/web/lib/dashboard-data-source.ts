import type {
  DriverContribution,
  FeatureTrendPoint,
  ImportProgress,
  PredictionSummary,
} from "../../../packages/core/src/contracts";

export type DashboardData = {
  predictionSummary: PredictionSummary;
  driverContributions: DriverContribution[];
  featureTrendPoints: FeatureTrendPoint[];
  importProgress: ImportProgress;
};

export interface DashboardDataSource {
  getDashboardData(): Promise<DashboardData>;
}
