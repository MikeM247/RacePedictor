import type {
  DriverContribution,
  FeatureTrendPoint,
  ImportProgress,
  PredictionSummary,
} from "@racepredictor/core/contracts";

export type DashboardData = {
  predictionSummary: PredictionSummary;
  driverContributions: DriverContribution[];
  featureTrendPoints: FeatureTrendPoint[];
  importProgress: ImportProgress;
};

export interface DashboardDataSource {
  getDashboardData(): Promise<DashboardData>;
}
