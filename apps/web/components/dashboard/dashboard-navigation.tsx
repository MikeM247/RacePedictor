"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardPage = "today" | "plan" | "calendar" | "activities" | "data-quality" | "settings";

type DashboardNavigationProps = {
  activePage: DashboardPage;
};

export function DashboardNavigation({ activePage }: DashboardNavigationProps) {
  const pathname = usePathname();
  const links: Array<{ page: DashboardPage; href: string; label: string; index: string }> = [
    { page: "today", href: "/dashboard", label: "Today", index: "01" },
    { page: "plan", href: "/dashboard/plan", label: "Plan", index: "02" },
    { page: "calendar", href: "/dashboard/calendar", label: "Calendar", index: "03" },
    { page: "activities", href: "/dashboard/activities", label: "Activities", index: "04" },
    { page: "data-quality", href: "/dashboard/data-quality", label: "Data Quality", index: "05" },
    { page: "settings", href: "/dashboard/settings", label: "Settings", index: "06" },
  ];
  return (
    <>
      <a className="dashboard-skip-link" href="#dashboard-main-content">Skip to page content</a>
      <aside className="dashboard-nav" aria-label="Primary navigation">
        <Link className="dashboard-brand" href="/dashboard" aria-label="Race Predictor Today">
          <span className="dashboard-brand-mark" aria-hidden="true">RP</span>
          <span className="dashboard-brand-copy"><strong>Race Predictor</strong><small>Night Ops</small></span>
        </Link>
        <nav aria-label="Dashboard pages">
          {links.map((link) => {
            const current = link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link key={link.page} href={link.href} aria-current={current || (!pathname && activePage === link.page) ? "page" : undefined}>
                <span className="dashboard-nav-index" aria-hidden="true">{link.index}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
        <p className="dashboard-nav-boundary">Approved plans stay owner-controlled.</p>
      </aside>
      <span className="dashboard-skip-target" id="dashboard-main-content" tabIndex={-1}>Page content</span>
    </>
  );
}
