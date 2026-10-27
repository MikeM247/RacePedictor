"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NativeModal } from "../coaching/native-modal";
import { DashboardNavigation } from "./dashboard-navigation";
import { destinationForPath, menuPreferenceKey, readMenuMode, type MenuMode } from "./dashboard-destinations";
import "./dashboard.css";
import "./responsive-shell.css";

const HeaderStatusContext = createContext<(status: string) => void>(() => {});
export function useShellStatus(status: string) {
  const setStatus = useContext(HeaderStatusContext);
  useEffect(() => { setStatus(status); return () => setStatus(""); }, [setStatus, status]);
}

export function ApplicationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/dashboard";
  const destination = destinationForPath(pathname);
  const [mode, setMode] = useState<MenuMode>("icons");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [status, setStatus] = useState("");
  const focusAfterNavigation = useRef(false);
  useEffect(() => {
    try { setMode(readMenuMode(localStorage.getItem(menuPreferenceKey))); } catch { /* presentation preference is optional */ }
    const storage = (event: StorageEvent) => { if (event.key === menuPreferenceKey) setMode(readMenuMode(event.newValue)); };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    setDrawerOpen(false);
    if (!focusAfterNavigation.current) return;
    focusAfterNavigation.current = false;
    const frame = requestAnimationFrame(() => document.getElementById(destination.titleId)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [pathname, destination.titleId]);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const resized = () => { if (query.matches) setDrawerOpen(false); };
    query.addEventListener("change", resized);
    return () => query.removeEventListener("change", resized);
  }, []);
  function toggleMenu() {
    const next = mode === "icons" ? "expanded" : "icons";
    setMode(next);
    try { localStorage.setItem(menuPreferenceKey, next); } catch { /* keep the in-memory choice */ }
  }
  return <HeaderStatusContext.Provider value={setStatus}>
    <div className={`app-shell app-shell--${mode} app-shell--${destination.page}`}>
      <a className="dashboard-skip-link" href="#dashboard-main-content">Skip to page content</a>
      <div className="app-rail"><DashboardNavigation activePage={destination.page} mode={mode} onToggle={toggleMenu} /></div>
      <div className="app-workspace">
        <header className="app-header">
          <button id="app-menu-button" className="shell-icon-button app-menu-button" type="button" aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="app-mobile-menu" onClick={() => setDrawerOpen(true)}><span aria-hidden="true">☰</span></button>
          <div className="app-heading"><h1 id={destination.titleId} tabIndex={-1}>{destination.page === "coach" ? <><span className="sr-only">Coach — </span>ORBIT</> : destination.label}</h1>{destination.page === "coach" ? <p>AI coach · <span>{status || "Loading"}</span></p> : null}</div>
          {!destination.primary ? <Link className="app-parent-link" href="/dashboard/settings">Settings</Link> : null}
          <Link className="app-home-shortcut" href="/dashboard" aria-label="Home"><Image src="/racepredictor-brand.png" alt="" width={56} height={44} /></Link>
        </header>
        <main id="dashboard-main-content" className="app-main" tabIndex={-1} aria-labelledby={destination.titleId}>{children}</main>
      </div>
      <NativeModal open={drawerOpen} titleId="app-menu-title" onClose={() => setDrawerOpen(false)} className="app-drawer" returnFocusId="app-menu-button">
        <div className="app-drawer-heading"><h2 id="app-menu-title">Menu</h2><button className="shell-icon-button" type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}>×</button></div>
        <div id="app-mobile-menu"><DashboardNavigation activePage={destination.page} mode="expanded" onNavigate={href => {
          setDrawerOpen(false);
          if (href === pathname) requestAnimationFrame(() => document.getElementById(destination.titleId)?.focus({ preventScroll: true }));
          else focusAfterNavigation.current = true;
        }} /></div>
      </NativeModal>
    </div>
  </HeaderStatusContext.Provider>;
}
