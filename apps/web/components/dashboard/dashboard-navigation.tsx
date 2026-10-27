"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { isDashboardPageCurrent, type DashboardPage } from "./dashboard-navigation-state";
import { useDashboardFeatures } from "./dashboard-feature-context";
import { dashboardDestinations, type MenuMode } from "./dashboard-destinations";

type DashboardNavigationProps = {
  activePage: DashboardPage;
  mode?: MenuMode;
  onToggle?: () => void;
  onNavigate?: (href: string) => void;
};

export function DashboardNavigation({ activePage, mode = "expanded", onToggle, onNavigate }: DashboardNavigationProps) {
  const pathname = usePathname();
  const { coachAvailable } = useDashboardFeatures();
  const primaryLinks = dashboardDestinations.filter(link => link.primary && link.page !== "settings" && (link.page !== "coach" || coachAvailable));
  const secondaryLinks = dashboardDestinations.filter(link => link.page === "settings");

  const isCurrent = (link: { page: DashboardPage; href: string }) => {
    return isDashboardPageCurrent(link.page, pathname, activePage);
  };

  const renderLink = (link: { page: DashboardPage; href: string; label: string }) => {
    const current = isCurrent(link);
    return (
      <Link key={link.page} href={link.href} id={link.page === "readiness" ? (onNavigate ? "view-readiness-mobile" : "view-readiness") : undefined} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) onNavigate?.(link.href); }} aria-current={current ? "page" : undefined} aria-label={link.label}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={link.page === "home" ? "M3 10 12 3l9 7v11h-6v-7H9v7H3Z" : link.page === "coach" ? "M4 4h16v12H9l-5 4V4Z" : link.page === "calendar" ? "M4 5h16v16H4ZM4 10h16M8 2v6M16 2v6" : link.page === "readiness" ? "M4 19V9M10 19V5M16 19v-7M22 19H2" : "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"} /></svg>
        <span className="nav-label">{link.label}</span>{mode === "icons" ? <span className="nav-tooltip" aria-hidden="true">{link.label}</span> : null}
      </Link>
    );
  };

  return (
    <>
      <aside className={`dashboard-nav dashboard-nav--${mode}`} aria-label="Application navigation">
        <Link className="dashboard-brand" href="/dashboard" aria-label="Race Predictor Home" onClick={() => onNavigate?.("/dashboard")}>
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
        {onToggle ? <button className="shell-icon-button rail-toggle" type="button" aria-label={mode === "icons" ? "Expand navigation" : "Collapse navigation"} aria-expanded={mode === "expanded"} onClick={onToggle}><span aria-hidden="true">{mode === "icons" ? "»" : "«"}</span></button> : null}
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
