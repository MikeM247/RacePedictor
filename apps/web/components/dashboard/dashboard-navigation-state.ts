export type DashboardPage = "home" | "coach" | "readiness" | "training" | "plan" | "calendar" | "data-quality" | "settings";

export function isDashboardPageCurrent(page: DashboardPage, pathname: string | null, activePage?: DashboardPage): boolean {
  if (pathname) {
    if (page === "home") return pathname === "/dashboard";
    if (page === "coach") return pathname === "/dashboard/coach" || pathname.startsWith("/dashboard/coach/");
    if (page === "readiness") return pathname === "/dashboard/readiness" || pathname.startsWith("/dashboard/readiness/");
    if (page === "plan") return pathname === "/dashboard/plan" || pathname.startsWith("/dashboard/plan/");
    if (page === "calendar") return pathname === "/dashboard/calendar" || pathname.startsWith("/dashboard/calendar/");
    if (page === "training") return pathname === "/dashboard/activities" || pathname.startsWith("/dashboard/activities/");
    return pathname === `/dashboard/${page}` || pathname.startsWith(`/dashboard/${page}/`);
  }
  return activePage === page;
}
