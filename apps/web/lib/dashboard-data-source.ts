import type { DashboardFetchResult } from "../../../packages/core/src/contracts";

export interface DashboardDataSource {
  getDashboardData(): Promise<DashboardFetchResult>;
}
