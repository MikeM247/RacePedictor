"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { DeploymentEnvironment } from "../../lib/server/deployment-environment";
type DashboardFeatures = {
  deploymentEnvironment?: DeploymentEnvironment;
  coachAvailable: boolean;
  milestoneHomeEnabled?: boolean;
  calendarMonthSummaryEnabled?: boolean;
};
const DashboardFeaturesContext = createContext<DashboardFeatures>({
  coachAvailable: false,
});
export function DashboardFeaturesProvider({
  deploymentEnvironment = "Unknown",
  coachAvailable,
  milestoneHomeEnabled = false,
  calendarMonthSummaryEnabled = false,
  children,
}: DashboardFeatures & {
  children: ReactNode;
}) {
  return (
    <DashboardFeaturesContext.Provider
      value={{ coachAvailable, milestoneHomeEnabled, calendarMonthSummaryEnabled, deploymentEnvironment }}
    >
      {children}
    </DashboardFeaturesContext.Provider>
  );
}
export function useDashboardFeatures() {
  return useContext(DashboardFeaturesContext);
}
