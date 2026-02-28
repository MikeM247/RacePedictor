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

      <section className="dashboard-content">
        <header className="dashboard-header">
          <h2>Overview Dashboard</h2>
          <p>Model version: {predictionSummary.modelVersion}</p>
        </header>

        <section className="card-grid kpis">
          <article className="card">
            <h3>Predicted finish</h3>
            <p className="big">{formatDuration(predictionSummary.predictedTimeS)}</p>
          </article>
          <article className="card">
            <h3>Predicted pace</h3>
            <p className="big">{Math.round(predictionSummary.predictedPaceSecPerKm)} sec/km</p>
          </article>
          <article className="card">
            <h3>Confidence band</h3>
            <p className="big">
              {formatDuration(predictionSummary.bandLowS)} - {formatDuration(predictionSummary.bandHighS)}
            </p>
          </article>
        </section>

        <section className="card-grid primary">
          <article className="card chart-card">
            <h3>Feature trend</h3>
            <ul>
              {featureTrendPoints.map((point) => (
                <li key={`${point.featureKey}-${point.weekStart}`}>
                  <strong>{point.weekStart}</strong> {point.value} {point.unit}
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <h3>Driver contributions</h3>
            <ul>
              {driverContributions.map((driver) => (
                <li key={driver.key}>
                  <span>{driver.label}</span>
                  <strong>{driver.contributionPct}%</strong>
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <h3>Import progress</h3>
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
        </section>
      </section>
    </main>
  );
}
