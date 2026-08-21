import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import type { DashboardDataSource } from "../../lib/dashboard-data-source";
import { LocalDashboardDataSource } from "../../lib/local-dashboard-data-source";
import { MockDashboardDataSource } from "../../lib/mock-dashboard-data-source";
import { toDashboardViewModel } from "../../lib/dashboard-view-model";
import { readCloudEnvironment } from "../../lib/server/cloud-environment.ts";
import { shouldRenderOnlineUi } from "../../lib/server/online-ui-mode.ts";
import { OnlineDashboardShell } from "../../components/dashboard/online-dashboard-shell.tsx";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (shouldRenderOnlineUi(readCloudEnvironment())) return <OnlineDashboardShell />;
  const dataSource: DashboardDataSource = process.env.RACEPREDICTOR_DATA_SOURCE === "mock"
    ? new MockDashboardDataSource()
    : new LocalDashboardDataSource();
  const data = await dataSource.getDashboardData();

  return <DashboardShell {...toDashboardViewModel(data)} />;
}
