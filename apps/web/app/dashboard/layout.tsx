import type { ReactNode } from "react";
import { DashboardFeaturesProvider } from "../../components/dashboard/dashboard-feature-context";
import { readCloudEnvironment } from "../../lib/server/cloud-environment";
import { shouldRenderOnlineUi } from "../../lib/server/online-ui-mode";
import { milestoneHomeEnabled } from "../../lib/server/milestone-home-feature";
import { calendarMonthSummaryEnabled } from "../../lib/server/calendar-month-summary-feature";
import "./shared-dashboard-theme.css";
export const dynamic = "force-dynamic";
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const environment = readCloudEnvironment();
  const coachAvailable =
    shouldRenderOnlineUi(environment) && environment.features.coachUi;
  return (
    <DashboardFeaturesProvider
      coachAvailable={coachAvailable}
      milestoneHomeEnabled={milestoneHomeEnabled()}
      calendarMonthSummaryEnabled={calendarMonthSummaryEnabled()}
    >
      <div className={calendarMonthSummaryEnabled() ? "shared-dashboard-theme" : undefined}>{children}</div>
    </DashboardFeaturesProvider>
  );
}
