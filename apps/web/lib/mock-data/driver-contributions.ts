import type { DriverContribution } from "../../../../packages/core/src/contracts";

export const driverContributionsFixture: DriverContribution[] = [
  {
    key: "consistency",
    label: "Training consistency",
    contributionPct: 32.5,
    direction: "positive",
    confidence: 0.89,
  },
  {
    key: "acute_load",
    label: "Acute load",
    contributionPct: -18.4,
    direction: "negative",
    confidence: 0.78,
  },
  {
    key: "sleep_efficiency",
    label: "Sleep efficiency",
    contributionPct: 14.2,
    direction: "positive",
    confidence: 0.74,
  },
  {
    key: "heat_stress",
    label: "Heat stress",
    contributionPct: -9.1,
    direction: "negative",
    confidence: 0.68,
  },
  {
    key: "terrain_specificity",
    label: "Terrain specificity",
    contributionPct: 11.8,
    direction: "positive",
    confidence: 0.71,
  },
];
