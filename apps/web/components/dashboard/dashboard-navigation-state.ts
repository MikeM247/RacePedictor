export type DashboardPage = "home" | "training" | "plan" | "calendar" | "data-quality" | "settings";

export function isDashboardPageCurrent(page: DashboardPage, pathname: string | null, activePage?: DashboardPage): boolean {
  if (pathname) {
    if (page === "home") return pathname === "/dashboard";
    if (page === "plan") return pathname.startsWith("/dashboard/plan") || pathname.startsWith("/dashboard/calendar");
    if (page === "calendar") return false;
    if (page === "training") return pathname === "/dashboard/activities" || pathname.startsWith("/dashboard/activities/");
    return pathname === `/dashboard/${page}` || pathname.startsWith(`/dashboard/${page}/`);
  }
  return activePage === page || (activePage === "calendar" && page === "plan");
}
