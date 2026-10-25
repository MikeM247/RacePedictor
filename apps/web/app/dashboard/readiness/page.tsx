import type { DashboardDataSource } from "../../../lib/dashboard-data-source";
import { LocalDashboardDataSource } from "../../../lib/local-dashboard-data-source";
import { MockDashboardDataSource } from "../../../lib/mock-dashboard-data-source";
import { toDashboardViewModel } from "../../../lib/dashboard-view-model";
import { readCloudEnvironment } from "../../../lib/server/cloud-environment.ts";
import { shouldRenderOnlineUi } from "../../../lib/server/online-ui-mode.ts";
import { OnlineDashboardShell } from "../../../components/dashboard/online-dashboard-shell.tsx";
import { ReadinessShell } from "../../../components/dashboard/readiness-shell.tsx";

export const dynamic = "force-dynamic";

export default async function ReadinessPage() {
  const environment = readCloudEnvironment();
  if (shouldRenderOnlineUi(environment)) return <OnlineDashboardShell homeLabel={environment.features.coachUi ? "Coach" : "Home"} />;
  const dataSource: DashboardDataSource = process.env.RACEPREDICTOR_DATA_SOURCE === "mock"
    ? new MockDashboardDataSource()
    : new LocalDashboardDataSource();
  const data = await dataSource.getDashboardData();
  return <ReadinessShell {...toDashboardViewModel(data)} />;
}
