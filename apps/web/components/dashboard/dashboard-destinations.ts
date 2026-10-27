import type { DashboardPage } from "./dashboard-navigation-state";

export type MenuMode = "icons" | "expanded";
export type DashboardDestination = { page: DashboardPage; href: string; label: string; titleId: string; primary: boolean };
export const menuPreferenceKey = "racepredictor.navigation.v1.mode";
export const dashboardDestinations: readonly DashboardDestination[] = [
  { page: "home", href: "/dashboard", label: "Home", titleId: "dashboard-page-title", primary: true },
  { page: "coach", href: "/dashboard/coach", label: "Coach", titleId: "coach-page-title", primary: true },
  { page: "calendar", href: "/dashboard/calendar", label: "Calendar", titleId: "calendar-page-title", primary: true },
  { page: "readiness", href: "/dashboard/readiness", label: "Readiness", titleId: "dashboard-page-title", primary: true },
  { page: "settings", href: "/dashboard/settings", label: "Settings", titleId: "settings-page-title", primary: true },
  { page: "plan", href: "/dashboard/plan", label: "Plan", titleId: "plan-page-title", primary: false },
  { page: "training", href: "/dashboard/activities", label: "Training", titleId: "activities-page-title", primary: false },
  { page: "data-quality", href: "/dashboard/data-quality", label: "Data Quality", titleId: "data-quality-page-title", primary: false },
];
export function readMenuMode(value: string | null): MenuMode { return value === "expanded" ? "expanded" : "icons"; }
export function destinationForPath(pathname: string) {
  return dashboardDestinations.find(item => item.page !== "home" && (pathname === item.href || pathname.startsWith(`${item.href}/`))) ?? dashboardDestinations[0];
}
