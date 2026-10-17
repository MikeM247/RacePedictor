"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { goalContextApiResponseSchema, type GoalContextRouteData } from "../../../../packages/core/src/contracts/coaching.ts";
import { raceHistoryResponseSchema, type RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import { buildRaceJourney, type JourneyTarget } from "../../../../packages/core/src/services/race-journey.ts";
import { formatCoachingDate, localDateInTimezone } from "../../lib/coaching-ui-state";
import { formatDuration } from "../../lib/activity-formatters";
import { RaceAchievementManager } from "./race-achievement-manager";

export function raceTargetLabel(title: string, seconds?: number) {
  const explicit = /\b(sub[- ]?\s*\d{1,3}(?::\d{2}){0,2}|under\s+\d{1,3}\s*(?:hours?|hrs?|minutes?|mins?)?)\b/iu.exec(title)?.[0];
  return explicit?.trim() ?? (seconds ? `Target ${formatDuration(seconds)}` : "Finish goal");
}

function TargetStop({ target, nextId, today, timezone }: { target: JourneyTarget; nextId: string | null; today: string; timezone: string }) {
  const status = target.date < today ? "Result pending" : target.id === nextId ? "Next" : "Ahead";
  return <li className={`road-stop${target.id === nextId ? " road-stop--next" : ""}`}>
    <span className="road-node" aria-hidden="true" />
    <Link href="/dashboard/plan" className="road-stop-title">{target.eventName || target.title}</Link>
    <span className="road-stop-detail">{raceTargetLabel(target.title, target.targetTimeSeconds)}</span>
    <time dateTime={target.date}>{formatCoachingDate(target.date, timezone)}</time>
    <span className={`road-status${status === "Next" ? " road-status--next" : ""}`}>{status}</span>
  </li>;
}

function AchievementStop({ record, timezone }: { record: RaceHistoryRecord; timezone: string }) {
  return <li className="road-stop road-stop--achieved">
    <span className="road-node" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 4 4L19 6" /></svg></span>
    {record.activityId ? <Link className="road-stop-title" href={`/dashboard/activities?activityId=${encodeURIComponent(record.activityId)}&returnTo=%2Fdashboard`}>{record.title}</Link> : <span className="road-stop-title">{record.title}</span>}
    {record.elapsedTimeSeconds ? <span className="road-stop-detail">{formatDuration(record.elapsedTimeSeconds)}</span> : null}
    {record.raceDate ? <time dateTime={record.raceDate}>{formatCoachingDate(record.raceDate, timezone)}</time> : null}
    <span className="road-status road-status--achieved">Achieved{record.achievement === "personal_best" ? " · PB" : ""}</span>
  </li>;
}

export function HomeGoalContext({ now, onTimezone, refreshKey = 0 }: { now: Date; onTimezone?: (timezone: string) => void; refreshKey?: number }) {
  const [context, setContext] = useState<GoalContextRouteData | null>(null);
  const [goalState, setGoalState] = useState<"loading" | "ready" | "error">("loading");
  const [history, setHistory] = useState<RaceHistoryRecord[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [heroImage, setHeroImage] = useState("/road-to-comrades.webp");
  const [goalRetry, setGoalRetry] = useState(0);
  const [historyRetry, setHistoryRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/coaching/goal-context/active", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Goal unavailable");
      return goalContextApiResponseSchema.parse(await response.json()).data.context;
    }).then((next) => {
      if (controller.signal.aborted) return;
      setContext(next); setGoalState("ready");
      onTimezone?.(next.plan?.timezone ?? "Africa/Johannesburg");
    }).catch(() => {
      if (!controller.signal.aborted) { setGoalState("error"); if (!context) onTimezone?.("Africa/Johannesburg"); }
    });
    return () => controller.abort();
  }, [goalRetry, refreshKey, onTimezone]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/coaching/race-history", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("History unavailable");
      return raceHistoryResponseSchema.parse(await response.json()).data.items;
    }).then((items) => {
      if (!controller.signal.aborted) { setHistory(items); setHistoryState("ready"); }
    }).catch(() => { if (!controller.signal.aborted) setHistoryState("error"); });
    return () => controller.abort();
  }, [historyRetry, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/dashboard/appearance", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json();
      if (!controller.signal.aborted && typeof body.data?.heroImageUrl === "string") setHeroImage(body.data.heroImageUrl);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [refreshKey]);

  const timezone = context?.plan?.timezone ?? "Africa/Johannesburg";
  const today = localDateInTimezone(timezone, now);
  const journey = buildRaceJourney(context, history, today);
  const goal = context?.goal;
  const performance = goal?.target.kind === "performance" ? goal.target : null;
  const stateMessage = context?.state === "projection_pending" ? "Your approved goal is syncing."
    : context?.state === "unavailable" ? "Your approved goal could not be verified." : "Set a race goal to start your next chapter.";

  return <div className="home-goal-context road-goal-context">
    <div className="road-hero">
      <Image className="road-hero-image" src={heroImage} unoptimized={heroImage.startsWith("/api/")} onError={() => setHeroImage("/road-to-comrades.webp")} alt="" fill sizes="(max-width: 767px) 100vw, (max-width: 1400px) 85vw, 1200px" priority />
      <div className="road-hero-shade" />
      <div className="road-hero-content">
        <p className="eyebrow">Your big goal</p>
        <h2>{goal ? performance?.eventName || goal.title : "Your next finish line."}</h2>
        {goal ? <>
          <p className="road-hero-target">{performance ? raceTargetLabel(goal.title, performance.targetTimeSeconds) : goal.title}</p>
          {performance ? <p className="road-hero-date"><time dateTime={performance.targetDate}>{formatCoachingDate(performance.targetDate, timezone)}</time><span>{(performance.distanceMeters / 1000).toLocaleString("en-ZA", { maximumFractionDigits: 1 })} km</span></p> : null}
        </> : <p className="road-hero-state" role="status">{goalState === "loading" ? "Loading your goal…" : goalState === "error" ? "Your goal is temporarily unavailable." : stateMessage}</p>}
        <div className="road-hero-footer"><p>Every run has a reason.</p><Link className="text-link" href="/dashboard/plan">View plan →</Link></div>
      </div>
    </div>
    {goalState === "error" ? <p className="road-inline-state" role="status">{context ? "Showing the last loaded goal. Refresh unavailable." : "Your goal could not be loaded."} <button className="text-link" onClick={() => setGoalRetry((value) => value + 1)}>Retry goal</button></p> : null}
    {context?.state === "goal_only" ? <p className="road-inline-state">Your approved plan is not available right now.</p> : null}
    <section className="road-journey" aria-labelledby="road-journey-heading">
      <header className="road-journey-header"><div><p className="eyebrow">Every finish. Every fresh start.</p><h3 id="road-journey-heading">Your running journey</h3></div><RaceAchievementManager history={history} targets={buildRaceJourney(context, [], today).ahead} timezone={timezone} onChange={() => setHistoryRetry((value) => value + 1)} /></header>
      <div className="road-timeline">
        <div className="road-timeline-group road-timeline-group--achieved"><h4>Achieved</h4>
          {journey.achieved.length ? <ol className="road-stops">{journey.achieved.slice(-3).map((record) => <AchievementStop key={record.id} record={record} timezone={timezone} />)}</ol> : <p className="road-empty" role="status">{historyState === "loading" ? "Loading your achievements…" : historyState === "error" ? "Your achievements could not be loaded." : "Add your first confirmed achievement."}</p>}
        </div>
        <div className="road-now"><span aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6h12v12" /></svg></span><strong>Now</strong></div>
        <div className="road-timeline-group road-timeline-group--ahead"><h4>Ahead</h4>
          {journey.ahead.length ? <ol className="road-stops">{journey.ahead.slice(0, 3).map((target) => <TargetStop key={target.id} target={target} nextId={journey.nextId} today={today} timezone={timezone} />)}</ol> : <p className="road-empty">{goalState === "loading" ? "Loading your next goals…" : goalState === "error" || context?.state === "unavailable" || context?.state === "projection_pending" ? "Upcoming races are unavailable." : "Your next chapter is ready to plan."}</p>}
        </div>
      </div>
      {historyState === "error" ? <p className="road-inline-state" role="status">{history.length ? "Showing saved achievements; history could not be refreshed." : "Race history is temporarily unavailable."} <button className="text-link" onClick={() => setHistoryRetry((value) => value + 1)}>Retry history</button></p> : null}
      {journey.achieved.length > 3 || journey.ahead.length > 3 ? <details className="road-all-milestones"><summary>All {journey.achieved.length + journey.ahead.length} milestones</summary><div className="road-all-groups"><section aria-label="All achieved milestones"><h4>Achieved</h4><ol className="road-stops">{journey.achieved.map((record) => <AchievementStop key={record.id} record={record} timezone={timezone} />)}</ol></section><section aria-label="All upcoming milestones"><h4>Ahead</h4><ol className="road-stops">{journey.ahead.map((target) => <TargetStop key={target.id} target={target} nextId={journey.nextId} today={today} timezone={timezone} />)}</ol></section></div></details> : null}
    </section>
  </div>;
}
