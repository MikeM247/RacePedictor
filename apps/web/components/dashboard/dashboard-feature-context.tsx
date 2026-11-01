"use client";
import { createContext, useContext, type ReactNode } from "react";
type DashboardFeatures = {
  coachAvailable: boolean;
  milestoneHomeEnabled?: boolean;
  calendarMonthSummaryEnabled?: boolean;
};
const DashboardFeaturesContext = createContext<DashboardFeatures>({
  coachAvailable: false,
});
export function DashboardFeaturesProvider({
  coachAvailable,
  milestoneHomeEnabled = false,
  calendarMonthSummaryEnabled = false,
  children,
}: DashboardFeatures & {
  children: ReactNode;
}) {
  return (
    <DashboardFeaturesContext.Provider
      value={{ coachAvailable, milestoneHomeEnabled, calendarMonthSummaryEnabled }}
    >
      {children}
    </DashboardFeaturesContext.Provider>
  );
}
export function useDashboardFeatures() {
  return useContext(DashboardFeaturesContext);
}
