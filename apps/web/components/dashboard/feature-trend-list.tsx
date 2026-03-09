import type { FeatureTrendPointView } from "../../lib/dashboard-view-model";
import { PanelCard } from "./panel-card";

type FeatureTrendListProps = {
  points: FeatureTrendPointView[];
};

export function FeatureTrendList({ points }: FeatureTrendListProps) {
  return (
    <PanelCard title="Feature trend" className="chart-card">
      <ul>
        {points.map((point) => (
          <li key={`${point.featureKey}-${point.weekStart}`}>
            <strong>{point.weekStart}</strong> {point.value} {point.unit}
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}
