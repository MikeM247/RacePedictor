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
import { createRecoveryContext, dataQualityHref, readRecoveryContext, restoreRecoveryFocus } from "../../lib/recovery-context";
import { groupTrendSeries, selectOutlookReason } from "../../lib/readiness-evidence";
import { createTargetRequestGate, initialTargetContextState, retainedTarget, targetContextFromNetworkFailure, targetContextFromResponse, targetContextLoading, type TargetContextState } from "../../lib/target-context-state";
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
            <p>A short race outlook, recent training meaning, and one clear next step.</p>
          </div>
        </header>

        <section className="dashboard-content" aria-label="Home content">
          {analyticsLoading ? (
            <section className="content-group home-group home-outlook" aria-labelledby="race-outlook-heading">
              <p className="eyebrow">Race outlook</p><h2 id="race-outlook-heading" className="group-heading">Loading supported outlook…</h2>
              <p className="state-copy">Today&apos;s approved coaching remains available while prediction data loads.</p>
            </section>
          ) : null}

          {!analyticsLoading && uiState.showErrorState ? (
            <section className="content-group home-group home-outlook state-panel--error" role="alert" aria-labelledby="race-outlook-heading">
              <p className="eyebrow">Race outlook</p><h2 id="race-outlook-heading" className="group-heading">Outlook unavailable</h2>
              <p>{errorMessage ?? "Please refresh the page and try again."}</p>
              {onAnalyticsRetry ? <button className="button button-secondary state-panel-action" type="button" onClick={onAnalyticsRetry}>Try again</button> : null}
            </section>
          ) : null}

          {!analyticsLoading && uiState.showEmptyState ? (
            <section className="content-group home-group home-outlook" aria-labelledby="race-outlook-heading">
              <p className="eyebrow">Race outlook</p><h2 id="race-outlook-heading" className="group-heading">No supported outlook yet</h2>
              <p>Import training and settle a target before an outlook can be assessed. Recorded training and today&apos;s prescription remain available below.</p>
              <RecoveryDataQualityLink label="Improve data coverage" issue="The outlook cannot yet be assessed from the available history." />
            </section>
          ) : null}

          {!analyticsLoading && uiState.showContent ? (
            <section className="content-group home-group home-outlook" aria-labelledby="race-outlook-heading">
              <div className="group-heading-row"><div><p className="eyebrow">Race outlook</p><h2 id="race-outlook-heading" className="group-heading">{predictionDistanceLabel(selectedPrediction.targetDistanceM)} prediction</h2></div><p>Updated {formatHomeDate(selectedPrediction.generatedAt)}</p></div>
              {predictionOptions.length > 1 ? <details className="home-prediction-settings"><summary>Prediction settings</summary><label className="distance-selector home-distance-selector" htmlFor="home-race-distance"><span>Show estimate for</span><select id="home-race-distance" value={selectedDistanceM} onChange={(event) => setSelectedDistanceM(Number(event.target.value))}>{predictionOptions.map((candidate) => <option key={candidate.targetDistanceM} value={candidate.targetDistanceM}>{predictionDistanceLabel(candidate.targetDistanceM)}</option>)}</select></label><p>This changes which supported estimate is shown. It does not change your race goal or calculation inputs.</p></details> : null}
              {uiState.showStaleState ? <p className="home-inline-status state-panel--stale" role="status">Showing the last available outlook. {staleInfo.staleReason ?? "Live updates are delayed."}{staleInfo.staleAtIso ? ` Last update: ${formatHomeDate(staleInfo.staleAtIso, true)}.` : ""}</p> : null}
              <div className="home-outlook-main"><div><strong className="home-outlook-value">{selectedKpis[0]?.value}</strong><span className="home-outlook-label">current-fitness estimate · {selectedKpis[1]?.value}</span></div><div className="home-outlook-copy"><p><strong>What this says:</strong> {outlookReason.text}</p><p><strong>Uncertainty:</strong> The supplied estimate range is {selectedKpis[2]?.value}. It is the model&apos;s low-to-high estimate span, not a probability or confidence score.</p><HomeReadinessContext /></div></div>
              <div className="home-evidence-control"><button id="view-readiness" ref={readinessLauncher} className="text-link" type="button" aria-expanded={readinessOpen} aria-controls="readiness" onClick={openReadiness}>View readiness</button></div>
              {readinessOpen ? <section id="readiness" className="home-evidence" aria-labelledby="readiness-heading" tabIndex={-1}><div className="home-evidence-heading"><div><p className="eyebrow">Readiness evidence</p><h3 id="readiness-heading">Evidence for this outlook</h3></div><button className="button button-secondary" type="button" onClick={closeReadiness}>Back to Home</button></div><p><strong>Assessment basis:</strong> imported activity history. Model {selectedPrediction.modelVersion}. The supplied drivers and trends are overview-level evidence; changing the displayed distance changes the estimate, not this shared evidence.</p><DriverEvidence drivers={driverContributions} /><TrendEvidence series={trendSeries} /><p className="home-evidence-caveat">Use this evidence to understand the estimate, not to infer an on-track verdict. The app does not have a supported target-race comparison.</p><div className="home-evidence-actions"><RecoveryDataQualityLink label="Review data coverage" issue="Readiness is limited by the available imported history." selectedDistanceM={selectedDistanceM} /><Link className="text-link" href="/dashboard/activities">Review training history</Link></div></section> : null}
              {onlineStatus ? <details className="home-freshness"><summary>Data freshness</summary><OnlineStatusPanel status={onlineStatus} /></details> : null}
              {onlineStatusLoading ? <p className="quiet-copy" role="status">Checking data freshness…</p> : null}
              {onlineStatusError ? <p className="quiet-copy" role="status">Freshness details are unavailable. Your approved coaching is independent.</p> : null}
            </section>
          ) : null}

          <section className="content-group home-group home-recent" aria-labelledby="recent-training-heading"><p className="eyebrow">Recent training</p><h2 id="recent-training-heading" className="group-heading">What changed recently</h2><HomeRecentTraining /></section>
          <section className="content-group home-group home-next" aria-labelledby="next-action-heading"><p className="eyebrow">Next action</p><h2 id="next-action-heading" className="group-heading">What to do next</h2><TodayCoachingCard compact /></section>
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

function HomeReadinessContext() {
  const [state, setState] = useState<TargetContextState>(initialTargetContextState);
  const requestGate = useRef(createTargetRequestGate());

  const loadTarget = () => {
    const generation = requestGate.current.begin();
    const previous = retainedTarget(state);
    setState(targetContextLoading(previous));
    void fetch("/api/v1/coaching/today", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => undefined);
      if (requestGate.current.isCurrent(generation)) setState(targetContextFromResponse(response, body, previous));
    }).catch(() => {
      if (requestGate.current.isCurrent(generation)) setState(targetContextFromNetworkFailure(previous));
    });
  };

  useEffect(() => {
    loadTarget();
    // The initial target read is intentionally independent from outlook/freshness reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "loading") return <p role="status"><strong>Target and timeframe:</strong> {state.previous ? `${state.previous.title} on ${state.previous.targetDate} · checking for an updated settled target…` : "Loading your settled target…"}</p>;
  if (state.kind === "target") return <p><strong>Target and timeframe:</strong> {state.target.title} on {state.target.targetDate} · {state.target.countdown}. An on-track comparison is not available from this assessment.</p>;
  if (state.kind === "absence") return <p><strong>Target and timeframe:</strong> No settled target is confirmed. An on-track comparison cannot be assessed.</p>;
  if (state.authorizationLost) return <p role="alert"><strong>Target and timeframe:</strong> Your settled target could not be checked because this session is no longer authorized. Sign in again; no target status is being inferred.</p>;
  return <p role="alert"><strong>Target and timeframe:</strong> {state.previous ? `${state.previous.title} on ${state.previous.targetDate} was previously confirmed, but the current target read failed.` : "Could not load your settled target."} No target status is being inferred. <button className="text-link" type="button" onClick={loadTarget}>Retry target</button></p>;
}

function DriverEvidence({ drivers }: { drivers: DashboardViewModel["driverContributions"] }) {
  if (drivers.length === 0) return <p className="quiet-copy">No supplied driver contributions are available.</p>;
  return <section className="home-evidence-section" aria-labelledby="readiness-drivers-heading"><h4 id="readiness-drivers-heading">Supplied training signals</h4><p className="quiet-copy">These are supplied signal contributions for training context. They are not finish-time attribution, race probabilities, or percentages that need total 100%.</p><ul className="home-driver-list">{drivers.map((driver) => <li key={driver.key}><span>{driver.label}</span><strong>{driver.contributionPct > 0 ? "+" : ""}{driver.contributionPct}%</strong></li>)}</ul></section>;
}

function TrendEvidence({ series }: { series: ReturnType<typeof groupTrendSeries> }) {
  if (series.length === 0) return <p className="quiet-copy">No supplied feature trends are available.</p>;
  return <section className="home-evidence-section" aria-labelledby="readiness-trends-heading"><h4 id="readiness-trends-heading">Observed feature trends</h4><p className="quiet-copy">Weekly observations can have gaps. Observed training data alone does not establish readiness, adherence, or target-race performance.</p>{series.map((trend) => <div className="home-trend-summary" key={trend.id}><strong>{trend.featureLabel} · {trend.unit}</strong><span>{trend.periodLabel}</span><ul>{trend.points.map((point) => <li key={`${point.weekStart}-${point.value}`}><time dateTime={point.weekStart}>Week starting {point.weekStart}</time><strong>{point.value} {point.unit}</strong></li>)}</ul></div>)}</section>;
}
