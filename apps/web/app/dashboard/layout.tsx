import type { ReactNode } from "react";
import { DashboardFeaturesProvider } from "../../components/dashboard/dashboard-feature-context";
import { ApplicationShell } from "../../components/dashboard/application-shell";
import { readCloudEnvironment } from "../../lib/server/cloud-environment";
import { shouldRenderOnlineUi } from "../../lib/server/online-ui-mode";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const environment = readCloudEnvironment();
  const coachAvailable = shouldRenderOnlineUi(environment) && environment.features.coachUi;
  return <DashboardFeaturesProvider coachAvailable={coachAvailable}><ApplicationShell>{children}</ApplicationShell></DashboardFeaturesProvider>;
}
