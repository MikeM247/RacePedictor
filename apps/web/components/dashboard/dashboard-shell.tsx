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

type DashboardShellProps = DashboardViewModel & { onlineStatus?: OnlineStatus | null };

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
}: DashboardShellProps) {
  const [selectedDistanceM, setSelectedDistanceM] = useState(
    predictionSummary.targetDistanceM ?? predictionOptions[0]?.targetDistanceM ?? 21097.5,
  );
  const selectedPrediction = predictionOptions.find(
    (candidate) => candidate.targetDistanceM === selectedDistanceM,
  ) ?? predictionSummary;
  const selectedKpis = toSummaryKpis(selectedPrediction);

  return (
    <main className="dashboard-layout">
      <DashboardNavigation activePage="today" />

      <div className="dashboard-main">
        <header className="dashboard-toolbar">
          <div>
            <h2>Today</h2>
            <p>Daily coaching context · {selectedPrediction.modelVersion}</p>
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
            <span>Profile: Single athlete</span>
            <span>Status: {onlineStatus ? `Workout data ${onlineStatus.activityData.state.replace("_", " ")}` : fetchStatus === "success" ? "Imported history ready" : "Refresh required"}</span>
          </div>
        </header>

        <section className="dashboard-content" aria-label="Overview content panels">
          {onlineStatus ? <OnlineStatusPanel status={onlineStatus} /> : null}
          <TodayCoachingCard />
          {uiState.showErrorState ? (
            <section className="state-panel" role="status" aria-live="polite">
              <h3>Unable to load dashboard data</h3>
              <p>{errorMessage ?? "Please refresh the page and try again."}</p>
            </section>
          ) : null}

          {uiState.showEmptyState ? (
            <section className="state-panel" role="status" aria-live="polite">
              <h3>No dashboard data available</h3>
              <p>Data will appear after your next import is processed.</p>
            </section>
          ) : null}

          {uiState.showContent && uiState.showStaleState ? (
            <section className="state-panel state-panel--stale" role="status" aria-live="polite">
              <h3>Showing last available snapshot</h3>
              <p>
                {staleInfo.staleReason ?? "Live updates are delayed."}
                {staleInfo.staleAtIso ? ` Last update: ${new Date(staleInfo.staleAtIso).toLocaleString()}.` : ""}
              </p>
            </section>
          ) : null}

          {uiState.showContent ? (
            <>
              <section className="content-group" aria-labelledby="summary-metrics-heading">
                <h3 id="summary-metrics-heading" className="group-heading">Summary metrics</h3>
                <div className="card-grid kpis">
                  {selectedKpis.map((kpi) => (
                    <KpiCard key={kpi.key} title={kpi.title} value={kpi.value} />
                  ))}
                </div>
              </section>

              <section className="content-group" aria-labelledby="visualizations-heading">
                <h3 id="visualizations-heading" className="group-heading">Visualizations</h3>
                <div className="card-grid visualizations-grid">
                  <FeatureTrendList points={featureTrendPoints} />
                  <DriverContributionList drivers={driverContributions} />
                </div>
              </section>

              <section className="content-group" aria-labelledby="insights-data-heading">
                <h3 id="insights-data-heading" className="group-heading">Insights and data panels</h3>
                <div className="card-grid">
                  <ImportProgressPanel progress={importProgress} />
                </div>
              </section>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
