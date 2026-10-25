import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { CoachChatShell } from "../../components/coaching/coach-chat-shell";
import { readCloudEnvironment } from "../../lib/server/cloud-environment";
import { shouldRenderOnlineUi } from "../../lib/server/online-ui-mode";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const environment = readCloudEnvironment();
  if (shouldRenderOnlineUi(environment) && environment.features.coachUi) return <CoachChatShell />;
  return <DashboardShell initialNow={new Date().toISOString()} />;
}
