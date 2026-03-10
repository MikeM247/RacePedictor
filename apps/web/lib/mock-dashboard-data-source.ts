import type { DashboardFetchResult } from "../../../packages/core/src/contracts";
import type { DashboardDataSource } from "./dashboard-data-source";
import { driverContributionsFixture } from "./mock-data/driver-contributions";
import { featureTrendPointsFixture } from "./mock-data/feature-trend-points";
import { importProgressFixture } from "./mock-data/import-progress";
import { predictionSummaryFixture } from "./mock-data/prediction-summary";

export class MockDashboardDataSource implements DashboardDataSource {
  async getDashboardData(): Promise<DashboardFetchResult> {
    return {
      fetchStatus: "success",
      stale: {
        isStale: false,
      },
      data: {
        predictionSummary: predictionSummaryFixture,
        driverContributions: driverContributionsFixture,
        featureTrendPoints: featureTrendPointsFixture,
        importProgress: importProgressFixture,
      },
    };
  }
}
