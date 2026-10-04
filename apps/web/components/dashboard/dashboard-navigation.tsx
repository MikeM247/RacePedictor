"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { isDashboardPageCurrent, type DashboardPage } from "./dashboard-navigation-state";

type DashboardNavigationProps = {
  activePage: DashboardPage;
};

export function DashboardNavigation({ activePage }: DashboardNavigationProps) {
  const pathname = usePathname();
  const primaryLinks: Array<{ page: DashboardPage; href: string; label: string }> = [
    { page: "home", href: "/dashboard", label: "Home" },
    { page: "calendar", href: "/dashboard/calendar", label: "Calendar" },
  ];
  const secondaryLinks: Array<{ page: DashboardPage; href: string; label: string }> = [
    { page: "settings", href: "/dashboard/settings", label: "Settings" },
  ];

  const isCurrent = (link: { page: DashboardPage; href: string }) => {
    return isDashboardPageCurrent(link.page, pathname, activePage);
  };

  const renderLink = (link: { page: DashboardPage; href: string; label: string }) => {
    const current = isCurrent(link);
    return (
      <Link key={link.page} href={link.href} aria-current={current ? "page" : undefined}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={link.page === "home" ? "M3 10 12 3l9 7v11h-6v-7H9v7H3Z" : link.page === "calendar" ? "M4 5h16v16H4ZM4 10h16M8 2v6M16 2v6" : "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"} /></svg>
        <span>{link.label}</span>
      </Link>
    );
  };

  return (
    <>
      <a className="dashboard-skip-link" href="#dashboard-main-content">Skip to page content</a>
      <aside className="dashboard-nav" aria-label="Application navigation">
        <Link className="dashboard-brand" href="/dashboard" aria-label="Race Predictor Home">
          <Image
            src="/racepredictor-brand.png"
            alt=""
            aria-hidden="true"
            width={782}
            height={616}
            sizes="(max-width: 767px) 160px, 190px"
            priority
          />
        </Link>
        <nav className="dashboard-nav-primary" aria-label="Primary navigation">
          {primaryLinks.map(renderLink)}
        </nav>
        <nav className="dashboard-nav-secondary" aria-label="Secondary navigation">
          <span className="dashboard-nav-secondary-label">Utilities</span>
          {secondaryLinks.map(renderLink)}
        </nav>
      </aside>
    </>
  );
}
