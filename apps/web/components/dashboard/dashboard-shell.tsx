import type { DashboardViewModel } from "../../lib/dashboard-view-model";
import { DriverContributionList } from "./driver-contribution-list";
import { FeatureTrendList } from "./feature-trend-list";
import { ImportProgressPanel } from "./import-progress-panel";
import { KpiCard } from "./kpi-card";
import "./dashboard.css";

type DashboardShellProps = DashboardViewModel;

export function DashboardShell({
  uiState,
  errorMessage,
  staleInfo,
  predictionSummary,
  summaryKpis,
  driverContributions,
  featureTrendPoints,
  importProgress,
}: DashboardShellProps) {
  return (
    <main className="dashboard-layout">
      <aside className="dashboard-nav" aria-label="Primary">
        <h1>Race Predictor</h1>
        <nav>
          <a href="#" className="active">Overview</a>
          <a href="#">Activities</a>
          <a href="#">Performance</a>
          <a href="#">Data Quality</a>
          <a href="#">Settings</a>
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-toolbar">
          <div>
            <h2>Overview Dashboard</h2>
            <p>Model version: {predictionSummary.modelVersion}</p>
          </div>
          <div className="toolbar-meta" aria-label="Filters and status">
            <span>Filters: All athletes</span>
            <span>Status: Live feed healthy</span>
          </div>
        </header>

        <section className="dashboard-content" aria-label="Overview content panels">
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
                  {summaryKpis.map((kpi) => (
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
