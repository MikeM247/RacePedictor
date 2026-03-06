import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { MockDashboardDataSource } from "../../lib/mock-dashboard-data-source";
import { toDashboardViewModel } from "../../lib/dashboard-view-model";

export default async function DashboardPage() {
  const dataSource = new MockDashboardDataSource();
  const data = await dataSource.getDashboardData();

  return <DashboardShell {...toDashboardViewModel(data)} />;
}
