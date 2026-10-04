export type DashboardPage = "home" | "training" | "plan" | "calendar" | "data-quality" | "settings";

export function isDashboardPageCurrent(page: DashboardPage, pathname: string | null, activePage?: DashboardPage): boolean {
  if (pathname) {
    if (page === "home") return pathname === "/dashboard";
    if (page === "plan") return pathname === "/dashboard/plan" || pathname.startsWith("/dashboard/plan/");
    if (page === "calendar") return pathname === "/dashboard/calendar" || pathname.startsWith("/dashboard/calendar/");
    if (page === "training") return pathname === "/dashboard/activities" || pathname.startsWith("/dashboard/activities/");
    return pathname === `/dashboard/${page}` || pathname.startsWith(`/dashboard/${page}/`);
  }
  return activePage === page;
}
