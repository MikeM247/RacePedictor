"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardNavigation } from "./dashboard-navigation";
import { TodayCoachingCard } from "../coaching/today-coaching-card";
import { HomeRecentTraining } from "./home-recent-training";
import { HomeGoalContext } from "./home-goal-context";
import { DailyWellbeingCheckIn } from "../coaching/daily-wellbeing-check-in";
import { localDateInTimezone } from "../../lib/coaching-ui-state";
import "./dashboard.css";

function HomeDate({ timezone, now }: { timezone: string; now: Date }) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12);
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const date = new Intl.DateTimeFormat("en-ZA", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(now);
  return <><h1 id="dashboard-page-title">{greeting}</h1><p>{date}</p></>;
}

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
  const [planTimezone, setPlanTimezone] = useState<string | null>(null);
  const [coachingTimezone, setCoachingTimezone] = useState<string | null>(null);
  const timezone = planTimezone ?? coachingTimezone ?? "Africa/Johannesburg";
  const date = localDateInTimezone(timezone, now);

  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  return <div className="dashboard-layout home-layout">
    <LegacyReadinessRedirect />
    <DashboardNavigation activePage="home" />
    <main id="dashboard-main-content" className="dashboard-main" tabIndex={-1} aria-labelledby="dashboard-page-title">
      <header className="dashboard-toolbar home-toolbar">
        <div className="dashboard-toolbar-title"><HomeDate timezone={timezone} now={now} /></div>
        <Link className="text-link home-calendar-shortcut" href="/dashboard/calendar">Calendar →</Link>
      </header>
      <section className="dashboard-content home-content" aria-label="Home">
        <section className="content-group home-group home-goal" aria-labelledby="goal-and-milestone-heading">
          <h2 id="goal-and-milestone-heading" className="sr-only">Your goal</h2>
          <div className="home-goal-panel"><HomeGoalContext now={now} onTimezone={setPlanTimezone} /></div>
        </section>
        <section className="content-group home-group home-today" aria-labelledby="today-focus-heading">
          <h2 id="today-focus-heading" className="sr-only">Today&apos;s focus</h2>
          <div className="home-workout-surface">
            <TodayCoachingCard compact headingLevel={2} homeAction currentDate={date} onTimezone={setCoachingTimezone} />
            <DailyWellbeingCheckIn key={`${timezone}:${date}`} timezone={timezone} date={date} compact />
          </div>
        </section>
        <section className="content-group home-group home-activity" aria-labelledby="latest-activity-heading">
          <h2 id="latest-activity-heading" className="sr-only">Latest activity</h2>
          <HomeRecentTraining timezone={timezone} compact />
        </section>
      </section>
    </main>
  </div>;
}
