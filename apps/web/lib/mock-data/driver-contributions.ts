import {
  driverContributionListSchema,
  type DriverContribution,
} from "../../../../packages/core/src/contracts";

export const driverContributionsFixture: DriverContribution[] =
  driverContributionListSchema.parse([
    {
      key: "consistency",
      label: "Training consistency",
      contributionPct: 38,
      direction: "positive",
      confidence: 0.91,
    },
    {
      key: "threshold",
      label: "Threshold volume",
      contributionPct: 24,
      direction: "positive",
      confidence: 0.84,
    },
    {
      key: "heat",
      label: "Heat adaptation gap",
      contributionPct: -11,
      direction: "negative",
      confidence: 0.62,
    },
    {
      key: "recovery",
      label: "Recovery score",
      contributionPct: 9,
      direction: "neutral",
      confidence: 0.58,
    },
  ]);
