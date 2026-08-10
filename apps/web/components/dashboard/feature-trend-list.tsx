import type { FeatureTrendPointView } from "../../lib/dashboard-view-model";
import { PanelCard } from "./panel-card";

type FeatureTrendListProps = {
  points: FeatureTrendPointView[];
};

export function FeatureTrendList({ points }: FeatureTrendListProps) {
  const maximum = Math.max(1, ...points.map((point) => point.value));

  return (
    <PanelCard title="Weekly distance · last 12 weeks" className="chart-card">
      <ul className="trend-list" aria-label="Weekly distance trend">
        {points.map((point) => (
          <li key={`${point.featureKey}-${point.weekStart}`} className="trend-row">
            <time dateTime={point.weekStart}>{point.weekStart.slice(5)}</time>
            <span className="trend-track" aria-hidden="true">
              <span className="trend-fill" style={{ width: `${Math.max(2, point.value / maximum * 100)}%` }} />
            </span>
            <strong>{point.value} {point.unit}</strong>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}
