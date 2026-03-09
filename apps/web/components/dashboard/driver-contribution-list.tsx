import type { DriverContributionView } from "../../lib/dashboard-view-model";
import { PanelCard } from "./panel-card";

type DriverContributionListProps = {
  drivers: DriverContributionView[];
};

export function DriverContributionList({ drivers }: DriverContributionListProps) {
  return (
    <PanelCard title="Driver contributions">
      <ul>
        {drivers.map((driver) => (
          <li key={driver.key}>
            <span>{driver.label}</span>
            <strong>{driver.contributionPct}%</strong>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}
