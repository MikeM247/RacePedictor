"use client";

import { useState } from "react";
import type { DashboardViewModel } from "../../lib/dashboard-view-model";
import { predictionDistanceLabel, toSummaryKpis } from "../../lib/dashboard-view-model";
import { DriverContributionList } from "./driver-contribution-list";
import { DashboardNavigation } from "./dashboard-navigation";
import { FeatureTrendList } from "./feature-trend-list";
import { ImportProgressPanel } from "./import-progress-panel";
import { KpiCard } from "./kpi-card";
import { TodayCoachingCard } from "../coaching/today-coaching-card";
import type { OnlineStatus } from "../../../../packages/core/src/contracts/sync.ts";
import { OnlineStatusPanel } from "./online-status-panel";
import "./dashboard.css";

type DashboardShellProps = DashboardViewModel & {
  onlineStatus?: OnlineStatus | null;
  analyticsLoading?: boolean;
  onlineStatusLoading?: boolean;
  onlineStatusError?: string | null;
  onAnalyticsRetry?: () => void;
};

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
  const selectedPrediction = predictionOptions.find(
    (candidate) => candidate.targetDistanceM === selectedDistanceM,
  ) ?? predictionSummary;
  const selectedKpis = toSummaryKpis(selectedPrediction);

  return (
    <div className="dashboard-layout">
      <DashboardNavigation activePage="today" />

      <main className="dashboard-main" aria-labelledby="dashboard-page-title">
        <header className="dashboard-toolbar">
          <div className="dashboard-toolbar-title">
            <p className="eyebrow">Training command centre</p>
            <h1 id="dashboard-page-title">Today</h1>
            <p>Your approved session first, with analytics and freshness kept in context.</p>
          </div>
          <div className="toolbar-meta" aria-label="Filters and status">
            {uiState.showContent && predictionOptions.length > 1 ? (
              <label className="distance-selector" htmlFor="race-distance">
                <span>Race distance</span>
                <select
                  id="race-distance"
                  value={selectedDistanceM}
                  onChange={(event) => setSelectedDistanceM(Number(event.target.value))}
                >
                  {predictionOptions.map((candidate) => (
                    <option key={candidate.targetDistanceM} value={candidate.targetDistanceM}>
                      {predictionDistanceLabel(candidate.targetDistanceM)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {onlineStatus ? <OnlineStatusPanel status={onlineStatus} /> : null}
            {onlineStatusLoading ? <p className="toolbar-status" role="status">Checking independent freshness…</p> : null}
            {onlineStatusError ? <p className="toolbar-status toolbar-status--warning" role="status">Freshness details unavailable · coaching remains independent</p> : null}
            {!onlineStatus && !onlineStatusLoading && !onlineStatusError ? (
              <p className={`toolbar-status${fetchStatus === "success" ? " toolbar-status--healthy" : " toolbar-status--warning"}`}>
                {fetchStatus === "success" ? "Imported history ready" : "Analytics refresh required"}
              </p>
            ) : null}
          </div>
        </header>

        <section className="dashboard-content" aria-label="Today content panels">
          <TodayCoachingCard />
          {analyticsLoading ? (
            <section className="state-panel" role="status" aria-live="polite" aria-busy="true">
              <p className="eyebrow">Recent analytics</p>
              <h2>Loading prediction and history context…</h2>
              <p>Today&apos;s approved coaching remains available while this loads.</p>
            </section>
          ) : null}

          {!analyticsLoading && uiState.showErrorState ? (
            <section className="state-panel state-panel--error" role="status" aria-live="polite">
              <p className="eyebrow">Recent analytics</p>
              <h2>{onAnalyticsRetry ? "Unable to load online data" : "Unable to load dashboard data"}</h2>
              <p>{errorMessage ?? "Please refresh the page and try again."}</p>
              <p>Today&apos;s approved coaching was requested separately and has not been changed.</p>
              {onAnalyticsRetry ? <button className="button button-secondary state-panel-action" type="button" onClick={onAnalyticsRetry}>Try again</button> : null}
            </section>
          ) : null}

          {!analyticsLoading && uiState.showEmptyState ? (
            <section className="state-panel" role="status" aria-live="polite">
              <p className="eyebrow">Recent analytics</p>
              <h2>No dashboard data available</h2>
              <p>Data will appear after your next import is processed.</p>
            </section>
          ) : null}

          {!analyticsLoading && uiState.showContent && uiState.showStaleState ? (
            <section className="state-panel state-panel--stale" role="status" aria-live="polite">
              <h2>Showing last available analytics snapshot</h2>
              <p>
                {staleInfo.staleReason ?? "Live updates are delayed."}
                {staleInfo.staleAtIso ? ` Last update: ${new Date(staleInfo.staleAtIso).toLocaleString()}.` : ""}
              </p>
            </section>
          ) : null}

          {!analyticsLoading && uiState.showContent ? (
            <>
              <section className="content-group analytics-group" aria-labelledby="summary-metrics-heading">
                <div className="group-heading-row">
                  <div>
                    <p className="eyebrow">Recent analytics</p>
                    <h2 id="summary-metrics-heading" className="group-heading">Prediction snapshot</h2>
                  </div>
                  <p>Model {selectedPrediction.modelVersion} · values reflect imported activity history</p>
                </div>
                <div className="card-grid kpis">
                  {selectedKpis.map((kpi) => (
                    <KpiCard key={kpi.key} title={kpi.title} value={kpi.value} />
                  ))}
                </div>
              </section>

              <section className="content-group" aria-labelledby="visualizations-heading">
                <h2 id="visualizations-heading" className="group-heading">Training signals</h2>
                <div className="card-grid visualizations-grid">
                  <FeatureTrendList points={featureTrendPoints} />
                  <DriverContributionList drivers={driverContributions} />
                </div>
              </section>

              <section className="content-group" aria-labelledby="insights-data-heading">
                <h2 id="insights-data-heading" className="group-heading">Data pipeline</h2>
                <div className="card-grid">
                  <ImportProgressPanel progress={importProgress} />
                </div>
              </section>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
}
