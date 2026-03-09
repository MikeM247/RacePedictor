import type { DashboardViewModel } from "../../lib/dashboard-view-model";
import "./dashboard.css";

type DashboardShellProps = DashboardViewModel;

const formatDuration = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}`;
};

export function DashboardShell({
  predictionSummary,
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
              <article className="card">
                <h4>Predicted finish</h4>
                <p className="big">{formatDuration(predictionSummary.predictedTimeS)}</p>
              </article>
              <article className="card">
                <h4>Predicted pace</h4>
                <p className="big">{Math.round(predictionSummary.predictedPaceSecPerKm)} sec/km</p>
              </article>
              <article className="card">
                <h4>Confidence band</h4>
                <p className="big">
                  {formatDuration(predictionSummary.bandLowS)} - {formatDuration(predictionSummary.bandHighS)}
                </p>
              </article>
            </div>
          </section>

          <section className="content-group" aria-labelledby="visualizations-heading">
            <h3 id="visualizations-heading" className="group-heading">Visualizations</h3>
            <div className="card-grid visualizations-grid">
              <article className="card chart-card">
                <h4>Feature trend</h4>
                <ul>
                  {featureTrendPoints.map((point) => (
                    <li key={`${point.featureKey}-${point.weekStart}`}>
                      <strong>{point.weekStart}</strong> {point.value} {point.unit}
                    </li>
                  ))}
                </ul>
              </article>

              <article className="card">
                <h4>Driver contributions</h4>
                <ul>
                  {driverContributions.map((driver) => (
                    <li key={driver.key}>
                      <span>{driver.label}</span>
                      <strong>{driver.contributionPct}%</strong>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </section>

          <section className="content-group" aria-labelledby="insights-data-heading">
            <h3 id="insights-data-heading" className="group-heading">Insights and data panels</h3>
            <div className="card-grid">
              <article className="card">
                <h4>Import progress</h4>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{importProgress.status}</dd>
                  </div>
                  <div>
                    <dt>Staged</dt>
                    <dd>{importProgress.stagedCount}</dd>
                  </div>
                  <div>
                    <dt>Normalized</dt>
                    <dd>{importProgress.normalizedCount}</dd>
                  </div>
                  <div>
                    <dt>Duplicates</dt>
                    <dd>{importProgress.duplicateCount}</dd>
                  </div>
                  <div>
                    <dt>Rejected</dt>
                    <dd>{importProgress.rejectedCount}</dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
