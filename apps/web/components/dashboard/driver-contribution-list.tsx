import type { DriverContributionView } from "../../lib/dashboard-view-model";
import { PanelCard } from "./panel-card";

type DriverContributionListProps = {
  drivers: DriverContributionView[];
};

export function DriverContributionList({ drivers }: DriverContributionListProps) {
  return (
    <PanelCard title="Driver contributions">
      <p>Supplied training-signal contributions provide context. They are not race probabilities, finish-time attribution, or a total of 100%.</p>
      <ul>
        {drivers.map((driver) => (
          <li key={driver.key}>
            <span>{driver.label}</span>
            <strong>{driver.contributionPct > 0 ? "+" : ""}{driver.contributionPct}%</strong>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}
