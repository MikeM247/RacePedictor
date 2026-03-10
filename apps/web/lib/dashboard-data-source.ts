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

export type DashboardStaleMetadata = {
  isStale: boolean;
  staleReason?: string;
  staleAtIso?: string;
};

export type DashboardFetchResult =
  | {
      fetchStatus: "success";
      data: DashboardData;
      stale: DashboardStaleMetadata;
    }
  | {
      fetchStatus: "empty";
      stale: DashboardStaleMetadata;
    }
  | {
      fetchStatus: "error";
      errorMessage: string;
      stale: DashboardStaleMetadata;
    };

export interface DashboardDataSource {
  getDashboardData(): Promise<DashboardFetchResult>;
}
