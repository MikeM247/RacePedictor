import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { MockDashboardDataSource } from "../../lib/mock-dashboard-data-source";

export default async function DashboardPage() {
  const dataSource = new MockDashboardDataSource();
  const data = await dataSource.getDashboardData();

  return <DashboardShell {...data} />;
}
