import type { DashboardViewModel } from "../../lib/dashboard-view-model";
import { DriverContributionList } from "./driver-contribution-list";
import { FeatureTrendList } from "./feature-trend-list";
import { ImportProgressPanel } from "./import-progress-panel";
import { KpiCard } from "./kpi-card";
import "./dashboard.css";

type DashboardShellProps = DashboardViewModel;

export function DashboardShell({
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
        </section>
      </div>
    </main>
  );
}
