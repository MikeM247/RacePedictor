"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { isDashboardPageCurrent, type DashboardPage } from "./dashboard-navigation-state";
import { useDashboardFeatures } from "./dashboard-feature-context";
import { NativeModal } from "../coaching/native-modal";

type DashboardNavigationProps = {
  activePage: DashboardPage;
  mobileIdentity?: ReactNode;
  mobileActions?: ReactNode;
};

type NavigationLink = { page: DashboardPage; href: string; label: string };

export function DashboardNavigation({ activePage, mobileIdentity, mobileActions }: DashboardNavigationProps) {
  const pathname = usePathname();
  const { coachAvailable } = useDashboardFeatures();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const primaryLinks: NavigationLink[] = [
    { page: "home", href: "/dashboard", label: "Home" },
    ...(coachAvailable ? [{ page: "coach" as const, href: "/dashboard/coach", label: "Coach" }] : []),
    { page: "calendar", href: "/dashboard/calendar", label: "Calendar" },
    { page: "readiness", href: "/dashboard/readiness", label: "Readiness" },
  ];
  const secondaryLinks: NavigationLink[] = [
    { page: "settings", href: "/dashboard/settings", label: "Settings" },
  ];
  const links = [...primaryLinks, ...secondaryLinks];
  const isCurrent = (link: NavigationLink) => isDashboardPageCurrent(link.page, pathname, activePage);
  const pageName = links.find(isCurrent)?.label ?? "Race Predictor";

  const renderLink = (link: NavigationLink, drawer = false) => {
    const current = isCurrent(link);
    const path = link.page === "home"
      ? "M3 10 12 3l9 7v11h-6v-7H9v7H3Z"
      : link.page === "coach"
        ? "M4 4h16v12H9l-5 4V4Z"
        : link.page === "calendar"
          ? "M4 5h16v16H4ZM4 10h16M8 2v6M16 2v6"
          : link.page === "readiness"
            ? "M4 19V9M10 19V5M16 19v-7M22 19H2"
            : "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z";
    return (
      <Link
        key={link.page}
        href={link.href}
        id={link.page === "readiness" ? drawer ? "mobile-view-readiness" : "view-readiness" : undefined}
        aria-current={current ? "page" : undefined}
        onClick={drawer ? () => setMobileMenuOpen(false) : undefined}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={path} /></svg>
        <span>{link.label}</span>
      </Link>
    );
  };

  return (
    <>
      <a className="dashboard-skip-link" href="#dashboard-main-content">Skip to page content</a>
      <aside className="dashboard-nav" aria-label="Application navigation">
        <div className="dashboard-mobile-header">
          <button
            ref={menuTriggerRef}
            className="dashboard-mobile-menu-trigger"
            type="button"
            aria-label="Open navigation"
            aria-haspopup="dialog"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="dashboard-mobile-identity">
            {mobileIdentity ?? <strong>{pageName}</strong>}
          </div>
          {mobileActions}
          <Link className="dashboard-mobile-home" href="/dashboard" aria-label="Race Predictor Home">
            <Image src="/racepredictor-brand.png" alt="" aria-hidden="true" width={52} height={42} sizes="52px" priority />
          </Link>
        </div>
        <Link className="dashboard-brand" href="/dashboard" aria-label="Race Predictor Home">
          <Image src="/racepredictor-brand.png" alt="" aria-hidden="true" width={782} height={616} sizes="(max-width: 767px) 160px, 190px" priority />
        </Link>
        <nav className="dashboard-nav-primary" aria-label="Primary navigation">
          {primaryLinks.map((link) => renderLink(link))}
        </nav>
        <nav className="dashboard-nav-secondary" aria-label="Secondary navigation">
          <span className="dashboard-nav-secondary-label">Utilities</span>
          {secondaryLinks.map((link) => renderLink(link))}
        </nav>
      </aside>
      <NativeModal
        open={mobileMenuOpen}
        titleId="dashboard-mobile-navigation-title"
        onClose={() => setMobileMenuOpen(false)}
        returnFocusRef={menuTriggerRef}
        className="dashboard-mobile-nav-dialog"
      >
        <header className="dashboard-mobile-nav-heading">
          <Link className="dashboard-mobile-drawer-brand" href="/dashboard" onClick={() => setMobileMenuOpen(false)} aria-label="Race Predictor Home">
            <Image src="/racepredictor-brand.png" alt="" aria-hidden="true" width={150} height={118} sizes="150px" />
          </Link>
          <h2 id="dashboard-mobile-navigation-title" className="sr-only">Navigation</h2>
          <button type="button" className="dashboard-mobile-nav-close" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)}>×</button>
        </header>
        <nav className="dashboard-mobile-drawer-links" aria-label="Mobile navigation">
          {primaryLinks.map((link) => renderLink(link, true))}
        </nav>
        <nav className="dashboard-mobile-drawer-utilities" aria-label="Utilities">
          {secondaryLinks.map((link) => renderLink(link, true))}
        </nav>
      </NativeModal>
    </>
  );
}
