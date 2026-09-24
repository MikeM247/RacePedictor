import type { FeatureTrendPointView } from "../../lib/dashboard-view-model";
import { groupTrendSeries } from "../../lib/readiness-evidence";
import { PanelCard } from "./panel-card";

type FeatureTrendListProps = {
  points: FeatureTrendPointView[];
};

export function FeatureTrendList({ points }: FeatureTrendListProps) {
  const series = groupTrendSeries(points);

  return (
    <PanelCard title="Observed feature trends" className="chart-card">
      <p>Supplied weekly observations can have gaps and do not establish readiness, adherence, or target-race performance.</p>
      {series.map((trend) => <section key={trend.id} aria-label={`${trend.featureLabel} trend`}>
        <h4>{trend.featureLabel} · {trend.unit}</h4>
        <p>{trend.periodLabel}</p>
        <ul className="trend-list">
          {trend.points.map((point) => <li key={`${point.weekStart}-${point.value}`} className="trend-row">
            <time dateTime={point.weekStart}>Week starting {point.weekStart}</time>
            <strong>{point.value} {point.unit}</strong>
          </li>)}
        </ul>
      </section>)}
    </PanelCard>
  );
}
