"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardNavigation } from "./dashboard-navigation";
import { HomeGoalContext } from "./home-goal-context";
import "./dashboard.css";
import "./road-to-comrades.css";
function HomeDate({ timezone, now }: { timezone: string; now: Date }) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12);
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const date = new Intl.DateTimeFormat("en-ZA", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  return (
    <>
      <h1 id="dashboard-page-title">{greeting}</h1>
      <p>{date}</p>
    </>
  );
}
function HomeHeroHeader({ timezone, now }: { timezone: string; now: Date }) {
  return (
    <header className="road-hero-header">
      <div className="road-hero-greeting">
        <HomeDate timezone={timezone} now={now} />
      </div>
    </header>
  );
}
function LegacyReadinessRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash !== "#readiness") return;
    router.replace(`/dashboard/readiness${window.location.search}`);
  }, [router]);
  return null;
}
export function LegacyDashboardShell({ initialNow }: { initialNow: string }) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const [refreshKey, setRefreshKey] = useState(0);
  const [planTimezone, setPlanTimezone] = useState<string | null>(null);
  const timezone = planTimezone ?? "Africa/Johannesburg";
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        setRefreshKey((value) => value + 1);
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
  }, []);
  return (
    <div className="dashboard-layout home-layout road-layout">
      <LegacyReadinessRedirect />
      <DashboardNavigation activePage="home" />
      <main
        id="dashboard-main-content"
        className="dashboard-main"
        tabIndex={-1}
        aria-labelledby="dashboard-page-title"
      >
        <section className="dashboard-content home-content" aria-label="Home">
          <section
            className="content-group home-group home-goal"
            aria-labelledby="goal-and-milestone-heading"
          >
            <h2
              id="goal-and-milestone-heading"
              className="road-screen-reader-only"
            >
              Your goal
            </h2>
            <div className="home-goal-panel">
              <HomeGoalContext
                now={now}
                onTimezone={setPlanTimezone}
                refreshKey={refreshKey}
                heroHeader={<HomeHeroHeader timezone={timezone} now={now} />}
              />
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
