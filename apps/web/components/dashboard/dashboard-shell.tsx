"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OptionNineHome } from "./option-nine-home";
import "./dashboard.css";

function LegacyReadinessRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash !== "#readiness") return;
    router.replace(`/dashboard/readiness${window.location.search}`);
  }, [router]);
  return null;
}

export function DashboardShell({ initialNow }: { initialNow: string }) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") { setNow(new Date()); setRefreshKey((value) => value + 1); }
    };
    setNow(new Date());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);
  return <div className="dashboard-layout home-layout road-layout option-nine-layout">
    <LegacyReadinessRedirect />
    <OptionNineHome now={now} refreshKey={refreshKey} />
  </div>;
}
