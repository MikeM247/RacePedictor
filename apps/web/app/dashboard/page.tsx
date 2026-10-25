import { DashboardShell } from "../../components/dashboard/dashboard-shell";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <DashboardShell initialNow={new Date().toISOString()} />;
}
