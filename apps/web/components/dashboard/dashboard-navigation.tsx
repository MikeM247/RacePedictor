"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDashboardPageCurrent, type DashboardPage } from "./dashboard-navigation-state";

type DashboardNavigationProps = {
  activePage: DashboardPage;
};

export function DashboardNavigation({ activePage }: DashboardNavigationProps) {
  const pathname = usePathname();
  const primaryLinks: Array<{ page: DashboardPage; href: string; label: string }> = [
    { page: "home", href: "/dashboard", label: "Home" },
    { page: "training", href: "/dashboard/activities", label: "Training" },
    { page: "plan", href: "/dashboard/plan", label: "Plan" },
  ];
  const secondaryLinks: Array<{ page: DashboardPage; href: string; label: string }> = [
    { page: "data-quality", href: "/dashboard/data-quality", label: "Data Quality" },
    { page: "settings", href: "/dashboard/settings", label: "Settings" },
  ];

  const isCurrent = (link: { page: DashboardPage; href: string }) => {
    return isDashboardPageCurrent(link.page, pathname, activePage);
  };

  const renderLink = (link: { page: DashboardPage; href: string; label: string }) => {
    const current = isCurrent(link);
    return (
      <Link key={link.page} href={link.href} aria-current={current ? "page" : undefined}>
        <span>{link.label}</span>
      </Link>
    );
  };

  return (
    <>
      <a className="dashboard-skip-link" href="#dashboard-main-content">Skip to page content</a>
      <aside className="dashboard-nav" aria-label="Application navigation">
        <Link className="dashboard-brand" href="/dashboard" aria-label="Race Predictor Home">
          <span className="dashboard-brand-mark" aria-hidden="true" />
          <span className="dashboard-brand-copy"><strong>Race Predictor</strong><small>Night Ops</small></span>
        </Link>
        <nav className="dashboard-nav-primary" aria-label="Primary navigation">
          {primaryLinks.map(renderLink)}
        </nav>
        <nav className="dashboard-nav-secondary" aria-label="Secondary navigation">
          <span className="dashboard-nav-secondary-label">Utilities</span>
          {secondaryLinks.map(renderLink)}
        </nav>
        <p className="dashboard-nav-boundary">Approved plans stay owner-controlled.</p>
      </aside>
    </>
  );
}
