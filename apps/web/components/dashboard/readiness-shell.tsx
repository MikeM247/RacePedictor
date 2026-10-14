"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DashboardViewModel } from "../../lib/dashboard-view-model";
import { predictionDistanceLabel, toSummaryKpis } from "../../lib/dashboard-view-model";
import { goalContextApiResponseSchema } from "../../../../packages/core/src/contracts/coaching.ts";
import { DashboardNavigation } from "./dashboard-navigation";
import type { OnlineStatus } from "../../../../packages/core/src/contracts/sync.ts";
import { OnlineStatusPanel } from "./online-status-panel";
import { createRecoveryContext, dataQualityHref, readRecoveryContext, restoreRecoveryFocus } from "../../lib/recovery-context";
import { groupTrendSeries, selectOutlookReason } from "../../lib/readiness-evidence";
import "./dashboard.css";
import { WeeklyTrainingChart } from "./weekly-training-chart";
import { trainingChartData, isDistanceSeries } from "../../lib/weekly-training-chart-model";

type ReadinessShellProps = DashboardViewModel & {
  onlineStatus?: OnlineStatus | null;
  analyticsLoading?: boolean;
  onlineStatusLoading?: boolean;
  onlineStatusError?: string | null;
  onAnalyticsRetry?: () => void;
};

const formatDate = (iso: string, timezone: string, includeTime = false) => new Intl.DateTimeFormat("en-ZA", {
  timeZone: timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
}).format(new Date(iso));

export function ReadinessShell({
  uiState,
  errorMessage,
  staleInfo,
  predictionSummary,
  predictionOptions,
  driverContributions,
  featureTrendPoints,
  weeklyTraining,
  weeklyTrainingError,
  onlineStatus,
  analyticsLoading = false,
  onlineStatusLoading = false,
  onlineStatusError = null,
  onAnalyticsRetry,
}: ReadinessShellProps) {
  const [timezone, setTimezone] = useState("Africa/Johannesburg");
  const [selectedDistanceM, setSelectedDistanceM] = useState(predictionSummary.targetDistanceM ?? predictionOptions[0]?.targetDistanceM ?? 21_097.5);
  const recoveryApplied = useRef(false);
  const selectedPrediction = predictionOptions.find((candidate) => candidate.targetDistanceM === selectedDistanceM) ?? predictionSummary;
  const selectedKpis = toSummaryKpis(selectedPrediction);
  const outlookReason = selectOutlookReason(driverContributions, featureTrendPoints);
  const chart = trainingChartData(weeklyTraining, featureTrendPoints, weeklyTrainingError);
  const trendSeries = groupTrendSeries(chart.consumedDistance ? featureTrendPoints.filter(point => !isDistanceSeries(point)) : featureTrendPoints);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/coaching/goal-context/active", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const parsed = goalContextApiResponseSchema.safeParse(await response.json());
        return parsed.success ? parsed.data.data.context.plan?.timezone ?? null : null;
      })
      .then((savedTimezone) => {
        if (active && savedTimezone) setTimezone(savedTimezone);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (analyticsLoading) return;
    const context = readRecoveryContext(new URLSearchParams(window.location.search).get("recovery"));
    if (context?.disclosure !== "readiness") return;
    if (context.predictionDistanceM && predictionOptions.some((option) => option.targetDistanceM === context.predictionDistanceM)) {
      setSelectedDistanceM(context.predictionDistanceM);
    }
    if (recoveryApplied.current) return;
    recoveryApplied.current = true;
    restoreRecoveryFocus(context);
  }, [predictionOptions, analyticsLoading]);

  return <div className="dashboard-layout home-layout readiness-layout">
    <DashboardNavigation activePage="readiness" />
    <main id="dashboard-main-content" className="dashboard-main" tabIndex={-1} aria-labelledby="dashboard-page-title">
      <header className="dashboard-toolbar"><div className="dashboard-toolbar-title"><h1 id="dashboard-page-title">Readiness</h1><p>Current fitness and the evidence behind it</p></div><Link className="text-link" href="/dashboard">Back to Home</Link></header>
      <section className="dashboard-content readiness-content" aria-label="Readiness details">
        <section className="home-evidence" aria-labelledby="readiness-heading">
          <div className="home-evidence-heading"><div><p className="eyebrow">Training evidence</p><h2 id="readiness-heading">Current-fitness estimate</h2></div></div>
          {analyticsLoading ? <p role="status" aria-busy="true">Loading the current-fitness estimate…</p> : null}
          {!analyticsLoading && uiState.showErrorState ? <div role="alert"><p>{errorMessage ?? "Current-fitness details could not be loaded."}</p>{onAnalyticsRetry ? <button className="button button-secondary" type="button" onClick={onAnalyticsRetry}>Try again</button> : null}</div> : null}
          {!analyticsLoading && uiState.showEmptyState ? <div><p>No compatible current-fitness estimate is available from the imported history.</p><RecoveryDataQualityLink label="Review data coverage" issue="No compatible current-fitness estimate is available from the imported history." /></div> : null}
          {!analyticsLoading && uiState.showContent ? <>
            <div className="group-heading-row"><h3>{predictionDistanceLabel(selectedPrediction.targetDistanceM)} estimate</h3><p>Updated {formatDate(selectedPrediction.generatedAt, timezone)}</p></div>
            {predictionOptions.length > 1 ? <details className="home-prediction-settings"><summary>Estimate settings</summary><label className="distance-selector home-distance-selector" htmlFor="readiness-race-distance"><span>Show estimate for</span><select id="readiness-race-distance" value={selectedDistanceM} onChange={(event) => setSelectedDistanceM(Number(event.target.value))}>{predictionOptions.map((candidate) => <option key={candidate.targetDistanceM} value={candidate.targetDistanceM}>{predictionDistanceLabel(candidate.targetDistanceM)}</option>)}</select></label><p>This selects a current-fitness estimate. It does not change your approved goal.</p></details> : null}
            {uiState.showStaleState ? <p className="home-inline-status state-panel--stale" role="status">Showing the last available estimate. {staleInfo.staleReason ?? "Live updates are delayed."}{staleInfo.staleAtIso ? ` Last update: ${formatDate(staleInfo.staleAtIso, timezone, true)}.` : ""}</p> : null}
            <div className="home-outlook-main"><div><strong className="home-outlook-value">{selectedKpis[0]?.value}</strong><span className="home-outlook-label">current-fitness estimate · {selectedKpis[1]?.value}</span></div><div className="home-outlook-copy"><p><strong>Training signal:</strong> {outlookReason.text}</p><p><strong>Estimate range:</strong> {selectedKpis[2]?.value}. This is the model&apos;s low-to-high estimate span, not a probability or race-day forecast.</p></div></div>
            <p className="home-evidence-caveat">Race-day progress cannot yet be assessed from this current-fitness estimate.</p>
            <DriverEvidence drivers={driverContributions} />
            <div className="home-evidence-actions"><RecoveryDataQualityLink label="Review data coverage" issue="Current-fitness details are limited by the available imported history." selectedDistanceM={selectedDistanceM} /><Link className="text-link" href="/dashboard/activities">Review training history</Link></div>
          </> : null}
          <WeeklyTrainingChart
            key={weeklyTraining?.windowStart ?? "legacy"}
            {...chart}
            loading={analyticsLoading}
            stale={staleInfo.isStale}
            timezone={weeklyTraining?.timezone}
            generatedAt={weeklyTraining?.generatedAt}
            onRetry={weeklyTrainingError || weeklyTraining?.status === "unavailable" || uiState.showErrorState ? onAnalyticsRetry ?? (() => window.location.reload()) : undefined}
          />
          {!analyticsLoading && trendSeries.length > 0 ? <TrendEvidence series={trendSeries} /> : null}
          {onlineStatus ? <details className="home-freshness"><summary>Data freshness</summary><OnlineStatusPanel status={onlineStatus} /></details> : null}
          {onlineStatusLoading ? <p className="quiet-copy" role="status">Checking data freshness…</p> : null}
          {onlineStatusError ? <p className="quiet-copy" role="status">Freshness details are unavailable. Goal and coaching reads are independent.</p> : null}
        </section>
      </section>
    </main>
  </div>;
}

function RecoveryDataQualityLink({ label, issue, selectedDistanceM }: { label: string; issue: string; selectedDistanceM?: number }) {
  return <Link id="readiness-data-quality" className="text-link" href="/dashboard/data-quality" onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const context = createRecoveryContext({
      kind: "home", path: "/dashboard/readiness", disclosure: "readiness", scrollY: window.scrollY,
      focusKey: "readiness-data-quality", issue, predictionDistanceM: selectedDistanceM,
    });
    window.location.assign(dataQualityHref(context));
  }}>{label}</Link>;
}

function DriverEvidence({ drivers }: { drivers: DashboardViewModel["driverContributions"] }) {
  if (drivers.length === 0) return <p className="quiet-copy">No supplied driver contributions are available.</p>;
  return <section className="home-evidence-section" aria-labelledby="readiness-drivers-heading"><h3 id="readiness-drivers-heading">Supplied training signals</h3><p className="quiet-copy">These are supplied signal contributions for training context. They are not finish-time attribution, race probabilities, or percentages that need total 100%.</p><ul className="home-driver-list">{drivers.map((driver) => <li key={driver.key}><span>{driver.label}</span><strong>{driver.contributionPct > 0 ? "+" : ""}{driver.contributionPct}%</strong></li>)}</ul></section>;
}

function TrendEvidence({ series }: { series: ReturnType<typeof groupTrendSeries> }) {
  if (series.length === 0) return <p className="quiet-copy">No supplied feature trends are available.</p>;
  return <section className="home-evidence-section" aria-labelledby="readiness-trends-heading"><h3 id="readiness-trends-heading">Observed feature trends</h3><p className="quiet-copy">Weekly observations can have gaps. Observed training data alone does not establish readiness, adherence, or target-race performance.</p>{series.map((trend) => <div className="home-trend-summary" key={trend.id}><strong>{trend.featureLabel} · {trend.unit}</strong><span>{trend.periodLabel}</span><ul>{trend.points.map((point) => <li key={`${point.weekStart}-${point.value}`}><time dateTime={point.weekStart}>Week starting {point.weekStart}</time><strong>{point.value} {point.unit}</strong></li>)}</ul></div>)}</section>;
}
