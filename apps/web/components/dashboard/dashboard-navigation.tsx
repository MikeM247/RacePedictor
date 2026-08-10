"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardPage = "today" | "plan" | "calendar" | "activities" | "data-quality" | "settings";

type DashboardNavigationProps = {
  activePage: DashboardPage;
};

export function DashboardNavigation({ activePage }: DashboardNavigationProps) {
  const pathname = usePathname();
  const links: Array<{ page: DashboardPage; href: string; label: string }> = [
    { page: "today", href: "/dashboard", label: "Today" },
    { page: "plan", href: "/dashboard/plan", label: "Plan" },
    { page: "calendar", href: "/dashboard/calendar", label: "Calendar" },
    { page: "activities", href: "/dashboard/activities", label: "Activities" },
    { page: "data-quality", href: "/dashboard/data-quality", label: "Data Quality" },
    { page: "settings", href: "/dashboard/settings", label: "Settings" },
  ];
  return (
    <aside className="dashboard-nav" aria-label="Primary">
      <Link className="dashboard-brand" href="/dashboard">
        Race Predictor
      </Link>
      <nav>
        {links.map((link) => {
          const current = link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
          return <Link key={link.page} href={link.href} aria-current={current || (!pathname && activePage === link.page) ? "page" : undefined}>{link.label}</Link>;
        })}
      </nav>
    </aside>
  );
}
