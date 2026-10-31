"use client";
import { createContext, useContext, type ReactNode } from "react";
type DashboardFeatures = {
  coachAvailable: boolean;
  milestoneHomeEnabled?: boolean;
};
const DashboardFeaturesContext = createContext<DashboardFeatures>({
  coachAvailable: false,
});
export function DashboardFeaturesProvider({
  coachAvailable,
  milestoneHomeEnabled = false,
  children,
}: DashboardFeatures & {
  children: ReactNode;
}) {
  return (
    <DashboardFeaturesContext.Provider
      value={{ coachAvailable, milestoneHomeEnabled }}
    >
      {children}
    </DashboardFeaturesContext.Provider>
  );
}
export function useDashboardFeatures() {
  return useContext(DashboardFeaturesContext);
}
