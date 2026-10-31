"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OptionNineHome } from "./option-nine-home";
import "./dashboard.css";
import { useDashboardFeatures } from "./dashboard-feature-context";
import { LegacyDashboardShell } from "./legacy-dashboard-shell";
function LegacyReadinessRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash !== "#readiness") return;
    router.replace(`/dashboard/readiness${window.location.search}`);
  }, [router]);
  return null;
}
function MilestoneDashboardShell({ initialNow }: { initialNow: string }) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshNow = useCallback(() => {
    setNow(new Date());
    setRefreshKey((value) => value + 1);
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        refreshNow();
      }
    };
    setNow(new Date());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [refreshNow]);
  return (
    <div className="option-nine-layout">
      <LegacyReadinessRedirect />
      <OptionNineHome
        now={now}
        refreshKey={refreshKey}
        onRefresh={refreshNow}
      />
    </div>
  );
}
export function DashboardShell(props: { initialNow: string }) {
  return useDashboardFeatures().milestoneHomeEnabled ? (
    <MilestoneDashboardShell {...props} />
  ) : (
    <LegacyDashboardShell {...props} />
  );
}
