"use client";

import { createContext, useContext, type ReactNode } from "react";

type DashboardFeatures = { coachAvailable: boolean };

const DashboardFeaturesContext = createContext<DashboardFeatures>({ coachAvailable: false });

export function DashboardFeaturesProvider({ coachAvailable, children }: DashboardFeatures & { children: ReactNode }) {
  return <DashboardFeaturesContext.Provider value={{ coachAvailable }}>{children}</DashboardFeaturesContext.Provider>;
}

export function useDashboardFeatures() {
  return useContext(DashboardFeaturesContext);
}
