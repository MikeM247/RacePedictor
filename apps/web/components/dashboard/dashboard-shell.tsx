"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DashboardViewModel } from "../../lib/dashboard-view-model";
import { predictionDistanceLabel, toSummaryKpis } from "../../lib/dashboard-view-model";
import { DashboardNavigation } from "./dashboard-navigation";
import { TodayCoachingCard } from "../coaching/today-coaching-card";
import type { OnlineStatus } from "../../../../packages/core/src/contracts/sync.ts";
import { OnlineStatusPanel } from "./online-status-panel";
import { HomeRecentTraining } from "./home-recent-training";
import { HomeGoalContext } from "./home-goal-context";
import { createRecoveryContext, dataQualityHref, readRecoveryContext, restoreRecoveryFocus } from "../../lib/recovery-context";
import { groupTrendSeries, selectOutlookReason } from "../../lib/readiness-evidence";
import "./dashboard.css";

type DashboardShellProps = DashboardViewModel & {
  onlineStatus?: OnlineStatus | null;
  analyticsLoading?: boolean;
  onlineStatusLoading?: boolean;
  onlineStatusError?: string | null;
  onAnalyticsRetry?: () => void;
};

const formatHomeDate = (iso: string, includeTime = false) => new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
}).format(new Date(iso));

export function DashboardShell({
  fetchStatus,
  uiState,
  errorMessage,
  staleInfo,
  predictionSummary,
  predictionOptions,
  driverContributions,
  featureTrendPoints,
  importProgress,
  onlineStatus,
  analyticsLoading = false,
  onlineStatusLoading = false,
  onlineStatusError = null,
  onAnalyticsRetry,
}: DashboardShellProps) {
  const [selectedDistanceM, setSelectedDistanceM] = useState(
    predictionSummary.targetDistanceM ?? predictionOptions[0]?.targetDistanceM ?? 21097.5,
  );
  const [readinessOpen, setReadinessOpen] = useState(false);
  const readinessLauncher = useRef<HTMLButtonElement>(null);
  const recoveryApplied = useRef(false);
  const openedReadinessFromHome = useRef(false);
  const wasReadinessOpen = useRef(false);
  const restoreLauncherFocus = useRef(false);
  const generalRecoveryFocusApplied = useRef(false);
  const selectedPrediction = predictionOptions.find(
    (candidate) => candidate.targetDistanceM === selectedDistanceM,
  ) ?? predictionSummary;
  const selectedKpis = toSummaryKpis(selectedPrediction);
  const outlookReason = selectOutlookReason(driverContributions, featureTrendPoints);
  const trendSeries = groupTrendSeries(featureTrendPoints);

  useEffect(() => {
    const updateReadinessFromLocation = () => {
      const open = window.location.hash === "#readiness";
      setReadinessOpen(open);
      if (wasReadinessOpen.current && !open) restoreLauncherFocus.current = true;
      wasReadinessOpen.current = open;
    };
    updateReadinessFromLocation();
    window.addEventListener("hashchange", updateReadinessFromLocation);
    window.addEventListener("popstate", updateReadinessFromLocation);
    return () => {
      window.removeEventListener("hashchange", updateReadinessFromLocation);
      window.removeEventListener("popstate", updateReadinessFromLocation);
    };
  }, []);

  useEffect(() => {
    if (readinessOpen || !restoreLauncherFocus.current) return;
    restoreLauncherFocus.current = false;
    requestAnimationFrame(() => readinessLauncher.current?.focus());
  }, [readinessOpen]);

  useEffect(() => {
    const context = readRecoveryContext(new URLSearchParams(window.location.search).get("recovery"));
    if (!readinessOpen || !uiState.showContent || context?.disclosure !== "readiness" || context.focusKey !== "view-readiness") return;
    // Native fragment restoration can focus the readiness section after React's
    // effects. Restore the launcher after that browser work has settled.
    const timer = window.setTimeout(() => readinessLauncher.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, [readinessOpen, uiState.showContent]);

  useEffect(() => {
    const context = readRecoveryContext(new URLSearchParams(window.location.search).get("recovery"));
    if (!context || context.disclosure !== "readiness") return;
    // Selection is safe presentation state and must be restored even while the
    // anchor effect is still opening the disclosure on a direct return.
    if (context.predictionDistanceM && predictionOptions.some((option) => option.targetDistanceM === context.predictionDistanceM)) {
      setSelectedDistanceM(context.predictionDistanceM);
    }
    if (!readinessOpen || recoveryApplied.current) return;
    recoveryApplied.current = true;
    restoreRecoveryFocus(context);
  }, [predictionOptions, readinessOpen]);

  useEffect(() => {
    const context = readRecoveryContext(new URLSearchParams(window.location.search).get("recovery"));
    if (!context || context.disclosure === "readiness" || generalRecoveryFocusApplied.current) return;
    let attempts = 0;
    let timer: number | undefined;
    const restoreWhenLauncherRenders = () => {
      const launcher = context.focusKey ? document.getElementById(context.focusKey) : null;
      if (launcher) {
        generalRecoveryFocusApplied.current = true;
        restoreRecoveryFocus(context);
        launcher.focus({ preventScroll: true });
        return;
      }
      if (attempts++ < 40) timer = window.setTimeout(restoreWhenLauncherRenders, 25);
    };
    restoreWhenLauncherRenders();
    return () => { if (timer) window.clearTimeout(timer); };
  }, [uiState.showContent]);

  const openReadiness = () => {
    if (window.location.hash !== "#readiness") {
      window.history.pushState(null, "", "/dashboard#readiness");
      openedReadinessFromHome.current = true;
    }
    wasReadinessOpen.current = true;
    setReadinessOpen(true);
  };
  const closeReadiness = () => {
    if (openedReadinessFromHome.current) {
      window.history.back();
    } else {
      window.history.replaceState(null, "", "/dashboard");
      setReadinessOpen(false);
      requestAnimationFrame(() => readinessLauncher.current?.focus());
    }
  };

  return (
    <div className="dashboard-layout">
      <DashboardNavigation activePage="home" />

      <main id="dashboard-main-content" className="dashboard-main" tabIndex={-1} aria-labelledby="dashboard-page-title">
        <header className="dashboard-toolbar">
          <div className="dashboard-toolbar-title">
            <p className="eyebrow">Training command centre</p>
            <h1 id="dashboard-page-title">Home</h1>
            <p>Your approved goal, today&apos;s focus, and latest recorded activity.</p>
          </div>
        </header>

        <section className="dashboard-content" aria-label="Home content">
          <section className="content-group home-group home-goal" aria-labelledby="goal-and-milestone-heading">
            <h2 id="goal-and-milestone-heading" className="group-heading">Your approved goal</h2>
            <div className="home-goal-panel"><HomeGoalContext readinessAction={<button id="view-readiness" ref={readinessLauncher} className="text-link" type="button" aria-label="View current-fitness details" aria-expanded={readinessOpen} aria-controls="readiness" onClick={openReadiness}><span>Readiness details</span></button>} /></div>
            {readinessOpen ? <section id="readiness" className="home-evidence" aria-labelledby="readiness-heading" tabIndex={-1}>
              <div className="home-evidence-heading"><div><p className="eyebrow">Readiness detail</p><h3 id="readiness-heading">Current-fitness estimate</h3></div><button className="button button-secondary" type="button" onClick={closeReadiness}>Back to Home</button></div>
              {analyticsLoading ? <p role="status">Loading the current-fitness estimate…</p> : null}
              {!analyticsLoading && uiState.showErrorState ? <div role="alert"><p>{errorMessage ?? "Current-fitness details could not be loaded."}</p>{onAnalyticsRetry ? <button className="button button-secondary" type="button" onClick={onAnalyticsRetry}>Try again</button> : null}</div> : null}
              {!analyticsLoading && uiState.showEmptyState ? <div><p>No compatible current-fitness estimate is available from the imported history.</p><RecoveryDataQualityLink label="Review data coverage" issue="No compatible current-fitness estimate is available from the current history." /></div> : null}
              {!analyticsLoading && uiState.showContent ? <>
                <div className="group-heading-row"><h4>{predictionDistanceLabel(selectedPrediction.targetDistanceM)} estimate</h4><p>Updated {formatHomeDate(selectedPrediction.generatedAt)}</p></div>
                {predictionOptions.length > 1 ? <details className="home-prediction-settings"><summary>Estimate settings</summary><label className="distance-selector home-distance-selector" htmlFor="home-race-distance"><span>Show estimate for</span><select id="home-race-distance" value={selectedDistanceM} onChange={(event) => setSelectedDistanceM(Number(event.target.value))}>{predictionOptions.map((candidate) => <option key={candidate.targetDistanceM} value={candidate.targetDistanceM}>{predictionDistanceLabel(candidate.targetDistanceM)}</option>)}</select></label><p>This selects a current-fitness estimate. It does not change your approved goal.</p></details> : null}
                {uiState.showStaleState ? <p className="home-inline-status state-panel--stale" role="status">Showing the last available estimate. {staleInfo.staleReason ?? "Live updates are delayed."}{staleInfo.staleAtIso ? ` Last update: ${formatHomeDate(staleInfo.staleAtIso, true)}.` : ""}</p> : null}
                <div className="home-outlook-main"><div><strong className="home-outlook-value">{selectedKpis[0]?.value}</strong><span className="home-outlook-label">current-fitness estimate · {selectedKpis[1]?.value}</span></div><div className="home-outlook-copy"><p><strong>Training signal:</strong> {outlookReason.text}</p><p><strong>Estimate range:</strong> {selectedKpis[2]?.value}. This is the model&apos;s low-to-high estimate span, not a probability or race-day forecast.</p></div></div>
                <p className="home-evidence-caveat">Race-day progress cannot yet be assessed from this current-fitness estimate.</p>
                <DriverEvidence drivers={driverContributions} /><TrendEvidence series={trendSeries} />
                <div className="home-evidence-actions"><RecoveryDataQualityLink label="Review data coverage" issue="Current-fitness details are limited by the available imported history." selectedDistanceM={selectedDistanceM} /><Link className="text-link" href="/dashboard/activities">Review training history</Link></div>
              </> : null}
              {onlineStatus ? <details className="home-freshness"><summary>Data freshness</summary><OnlineStatusPanel status={onlineStatus} /></details> : null}
              {onlineStatusLoading ? <p className="quiet-copy" role="status">Checking data freshness…</p> : null}
              {onlineStatusError ? <p className="quiet-copy" role="status">Freshness details are unavailable. Goal and coaching reads are independent.</p> : null}
            </section> : null}
          </section>

          <section className="content-group home-group home-today" aria-labelledby="today-focus-heading"><h2 id="today-focus-heading" className="group-heading">Today&apos;s focus</h2><TodayCoachingCard compact headingLevel={3} /></section>
          <section className="content-group home-group home-activity" aria-labelledby="latest-activity-heading"><h2 id="latest-activity-heading" className="group-heading">Latest activity</h2><HomeRecentTraining /></section>
        </section>
      </main>
    </div>
  );
}

function RecoveryDataQualityLink({ label, issue, selectedDistanceM }: { label: string; issue: string; selectedDistanceM?: number }) {
  return <Link className="text-link" href="/dashboard/data-quality" onClick={(event) => {
    event.preventDefault();
    const context = createRecoveryContext({
      kind: "home", path: "/dashboard", disclosure: "readiness", scrollY: window.scrollY,
      focusKey: "view-readiness", issue, predictionDistanceM: selectedDistanceM,
    });
    window.location.assign(dataQualityHref(context));
  }}>{label}</Link>;
}

function DriverEvidence({ drivers }: { drivers: DashboardViewModel["driverContributions"] }) {
  if (drivers.length === 0) return <p className="quiet-copy">No supplied driver contributions are available.</p>;
  return <section className="home-evidence-section" aria-labelledby="readiness-drivers-heading"><h4 id="readiness-drivers-heading">Supplied training signals</h4><p className="quiet-copy">These are supplied signal contributions for training context. They are not finish-time attribution, race probabilities, or percentages that need total 100%.</p><ul className="home-driver-list">{drivers.map((driver) => <li key={driver.key}><span>{driver.label}</span><strong>{driver.contributionPct > 0 ? "+" : ""}{driver.contributionPct}%</strong></li>)}</ul></section>;
}

function TrendEvidence({ series }: { series: ReturnType<typeof groupTrendSeries> }) {
  if (series.length === 0) return <p className="quiet-copy">No supplied feature trends are available.</p>;
  return <section className="home-evidence-section" aria-labelledby="readiness-trends-heading"><h4 id="readiness-trends-heading">Observed feature trends</h4><p className="quiet-copy">Weekly observations can have gaps. Observed training data alone does not establish readiness, adherence, or target-race performance.</p>{series.map((trend) => <div className="home-trend-summary" key={trend.id}><strong>{trend.featureLabel} · {trend.unit}</strong><span>{trend.periodLabel}</span><ul>{trend.points.map((point) => <li key={`${point.weekStart}-${point.value}`}><time dateTime={point.weekStart}>Week starting {point.weekStart}</time><strong>{point.value} {point.unit}</strong></li>)}</ul></div>)}</section>;
}
