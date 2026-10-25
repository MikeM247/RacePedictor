"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { goalContextApiResponseSchema, type GoalContextRouteData } from "../../../../packages/core/src/contracts/coaching.ts";
import { raceHistoryResponseSchema, type RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import { buildRaceJourney, type JourneyTarget } from "../../../../packages/core/src/services/race-journey.ts";
import { formatCoachingDate, localDateInTimezone } from "../../lib/coaching-ui-state";
import { formatDuration } from "../../lib/activity-formatters";
import { useDashboardFeatures } from "./dashboard-feature-context";

const defaultHeroImage = "/road-to-comrades-v2.webp";
const legacyHeroImage = "/road-to-comrades.webp";

export function raceTargetLabel(title: string, seconds?: number) {
  const explicit = /\b(sub[- ]?\s*\d{1,3}(?::\d{2}){0,2}|under\s+\d{1,3}\s*(?:hours?|hrs?|minutes?|mins?)?)\b/iu.exec(title)?.[0];
  return explicit?.trim() ?? (seconds ? `Target ${formatDuration(seconds)}` : "Finish goal");
}

function TargetStop({ target, nextId }: { target: JourneyTarget; nextId: string | null }) {
  return <li className={`road-stop${target.id === nextId ? " road-stop--next" : ""}`}>
    <span className="road-node" aria-hidden="true" />
    <span className="road-stop-title">{target.eventName || target.title}</span>
  </li>;
}

function AchievementStop({ record }: { record: RaceHistoryRecord }) {
  return <li className="road-stop road-stop--achieved">
    <span className="road-node" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 4 4L19 6" /></svg></span>
    <span className="road-stop-title">{record.title}</span>
  </li>;
}

function OrbitLaunch({ coachAvailable, imageAvailable, onImageError }: { coachAvailable: boolean; imageAvailable: boolean; onImageError: () => void }) {
  if (!coachAvailable) return null;
  return <Link className="road-orbit-launch" href="/dashboard/coach" aria-label="Talk to Orbit">
    {imageAvailable
      ? <Image className="road-orbit-image" src="/images/orbit-coach-full.webp" alt="" width={124} height={186} sizes="(max-width: 767px) 82px, 124px" priority onError={onImageError} />
      : <span className="road-orbit-fallback" aria-hidden="true">O</span>}
    <span className="road-orbit-launch-label">Talk to Orbit <span aria-hidden="true">→</span></span>
  </Link>;
}

export function HomeGoalContext({ now, onTimezone, refreshKey = 0, heroHeader }: { now: Date; onTimezone?: (timezone: string) => void; refreshKey?: number; heroHeader?: ReactNode }) {
  const { coachAvailable } = useDashboardFeatures();
  const [context, setContext] = useState<GoalContextRouteData | null>(null);
  const [goalState, setGoalState] = useState<"loading" | "ready" | "error">("loading");
  const [history, setHistory] = useState<RaceHistoryRecord[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [heroImage, setHeroImage] = useState(defaultHeroImage);
  const [orbitImageAvailable, setOrbitImageAvailable] = useState(true);
  const [goalRetry, setGoalRetry] = useState(0);
  const [historyRetry, setHistoryRetry] = useState(0);
  const sceneRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let frame = 0;
    let scenePageTop: number | null = null;
    let collapsedPanelHeight = 0;
    let lastHeroHeight = Number.NaN;
    let disposed = false;

    const measure = () => {
      frame = 0;
      if (disposed) return;
      const hero = scene.querySelector<HTMLElement>(".road-hero");
      const date = scene.querySelector<HTMLElement>(".road-hero-greeting p");
      const imageFrame = scene.querySelector<HTMLElement>(".road-hero-image-frame");
      const content = scene.querySelector<HTMLElement>(".road-hero-content");
      const panel = scene.querySelector<HTMLElement>(".road-journey");
      const orbitLaunch = scene.querySelector<HTMLElement>(".road-orbit-launch");
      if (!hero || !date || !imageFrame || !content || !panel) return;

      if (window.innerWidth < 1100) {
        scene.style.removeProperty("--road-hero-min-height");
        imageFrame.style.removeProperty("left");
        imageFrame.style.removeProperty("width");
        imageFrame.style.removeProperty("top");
        return;
      }

      const sceneBox = scene.getBoundingClientRect();
      const sceneWidth = scene.clientWidth;
      if (!sceneWidth) return;
      scenePageTop ??= sceneBox.top + window.scrollY;

      if (heroImage === defaultHeroImage) {
        const scale = 0.9 * sceneWidth / 1672;
        const dateBottom = date.getBoundingClientRect().bottom - sceneBox.top;
        imageFrame.style.left = String(sceneWidth * 0.05) + "px";
        imageFrame.style.width = String(sceneWidth * 0.9) + "px";
        imageFrame.style.top = String(dateBottom + 12 - 240 * scale) + "px";
      } else {
        imageFrame.style.removeProperty("left");
        imageFrame.style.removeProperty("width");
        imageFrame.style.removeProperty("top");
      }

      const contentBottom = content.getBoundingClientRect().bottom - sceneBox.top;
      const orbitBottom = orbitLaunch ? orbitLaunch.getBoundingClientRect().bottom - sceneBox.top : 0;
      const naturalHeroHeight = Math.max(350, contentBottom + 20, orbitBottom + 12);
      const idealPanelTop = 115 + 499 * sceneWidth / 1672;
      collapsedPanelHeight = panel.getBoundingClientRect().height;
      const availableHeight = Math.max(0, window.innerHeight - scenePageTop);
      const maximumPanelTop = availableHeight - collapsedPanelHeight - 16;
      const targetHeroHeight = Math.max(naturalHeroHeight, Math.min(idealPanelTop, maximumPanelTop));

      if (!Number.isFinite(lastHeroHeight) || Math.abs(targetHeroHeight - lastHeroHeight) >= 0.5) {
        scene.style.setProperty("--road-hero-min-height", String(targetHeroHeight) + "px");
        lastHeroHeight = targetHeroHeight;
      }
    };

    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    const resizeObserver = new ResizeObserver(schedule);
    for (const selector of [".road-home-scene", ".road-hero-header", ".road-hero-greeting", ".road-hero-content", ".road-orbit-launch", ".road-journey"]) {
      const element = scene.querySelector<HTMLElement>(selector);
      if (element) resizeObserver.observe(element);
    }

    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    void document.fonts.ready.then(schedule);

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [heroImage]);

  const timezone = context?.plan?.timezone ?? "Africa/Johannesburg";
  const today = localDateInTimezone(timezone, now);
  const journey = buildRaceJourney(context, history, today);
  const goal = context?.goal;
  const performance = goal?.target.kind === "performance" ? goal.target : null;
  const stateMessage = context?.state === "projection_pending" ? "Your approved goal is syncing."
    : context?.state === "unavailable" ? "Your approved goal could not be verified." : "Set a race goal to start your next chapter.";

  return <div className="home-goal-context road-goal-context">
    <section ref={sceneRef} className="road-home-scene" aria-label="Your goal and running journey">
      <div className={`road-hero${coachAvailable ? " road-hero--with-orbit" : ""}`}>
        <div className="road-hero-photo" aria-hidden="true">
          <div className="road-hero-image-frame" data-background-source={heroImage === defaultHeroImage ? "default" : "custom"}>
            {heroImage ? <Image className="road-hero-image" src={heroImage} unoptimized={heroImage.startsWith("/api/")} onError={() => setHeroImage((current) => current === defaultHeroImage ? legacyHeroImage : current === legacyHeroImage ? "" : defaultHeroImage)} alt="" fill sizes={heroImage === defaultHeroImage ? "(max-width: 767px) 100vw, (max-width: 1099px) calc(100vw - 160px), calc((100vw - 180px) * 0.9)" : "(max-width: 767px) 100vw, (max-width: 1099px) calc(100vw - 160px), calc(100vw - 180px)"} priority /> : null}
          </div>
          <div className="road-hero-shade" />
        </div>
        {heroHeader}
        <div className="road-hero-content">
          <p className="eyebrow">Your goal</p>
          <h2>{goal ? performance?.eventName || goal.title : "Your next finish line."}</h2>
          {goal ? <>
            <p className="road-hero-target">{performance ? raceTargetLabel(goal.title, performance.targetTimeSeconds) : goal.title}</p>
            {performance ? <p className="road-hero-date"><time dateTime={performance.targetDate}>{formatCoachingDate(performance.targetDate, timezone)}</time><span>{(performance.distanceMeters / 1000).toLocaleString("en-ZA", { maximumFractionDigits: 1 })} km</span></p> : null}
          </> : <p className="road-hero-state" role="status">{goalState === "loading" ? "Loading your goal…" : goalState === "error" ? "Your goal is temporarily unavailable." : stateMessage}</p>}
        </div>
        <OrbitLaunch coachAvailable={coachAvailable} imageAvailable={orbitImageAvailable} onImageError={() => setOrbitImageAvailable(false)} />
      </div>
      <section className="road-journey" aria-labelledby="road-journey-heading">
        <h3 id="road-journey-heading" className="road-screen-reader-only">Your running journey</h3>
        {goalState === "error" ? <p className="road-inline-state" role="status">{context ? "Showing the last loaded goal. Refresh unavailable." : "Your goal could not be loaded."} <button className="text-link" onClick={() => setGoalRetry((value) => value + 1)}>Retry goal</button></p> : null}
        {context?.state === "goal_only" ? <p className="road-inline-state">Your approved plan is not available right now.</p> : null}
        <div className="road-timeline">
          <div className="road-timeline-group road-timeline-group--achieved"><h4>Achieved</h4>
            {journey.achieved.length ? <ol className="road-stops">{journey.achieved.map((record) => <AchievementStop key={record.id} record={record} />)}</ol> : <p className="road-empty" role="status">{historyState === "loading" ? "Loading your achievements…" : historyState === "error" ? "Your achievements could not be loaded." : "No completed milestones yet."}</p>}
          </div>
          <div className="road-now"><strong>Now</strong><span aria-hidden="true"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="16.7" cy="4.4" r="2" /><path d="m13.6 8.6 3.1 2.3 3.1.3M9.1 21l3.5-6.1-3.2-2.7 2.7-4.6c.4-.7 1.3-.9 2-.5l1.6 1.1M9.4 12.2l-3.1 4.5m7.7-1.8 3.8 1.5 1.8 4.1" /></svg></span></div>
          <div className="road-timeline-group road-timeline-group--ahead"><h4>Ahead</h4>
            {journey.ahead.length ? <ol className="road-stops">{journey.ahead.map((target) => <TargetStop key={target.id} target={target} nextId={journey.nextId} />)}</ol> : <p className="road-empty">{goalState === "loading" ? "Loading your next goals…" : goalState === "error" || context?.state === "unavailable" || context?.state === "projection_pending" ? "Upcoming races are unavailable." : "No upcoming milestones."}</p>}
          </div>
        </div>
        {historyState === "error" ? <p className="road-inline-state" role="status">{history.length ? "Showing saved achievements; history could not be refreshed." : "Race history is temporarily unavailable."} <button className="text-link" onClick={() => setHistoryRetry((value) => value + 1)}>Retry history</button></p> : null}
      </section>
    </section>
  </div>;
}
