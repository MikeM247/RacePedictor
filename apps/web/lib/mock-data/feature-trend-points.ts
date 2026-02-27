import {
  featureTrendPointListSchema,
  type FeatureTrendPoint,
} from "../../../../packages/core/src/contracts";

export const featureTrendPointsFixture: FeatureTrendPoint[] =
  featureTrendPointListSchema.parse([
    {
      weekStart: "2026-01-12",
      featureKey: "weekly_distance_km",
      featureLabel: "Weekly distance",
      value: 52.4,
      unit: "km",
    },
    {
      weekStart: "2026-01-19",
      featureKey: "weekly_distance_km",
      featureLabel: "Weekly distance",
      value: 58.1,
      unit: "km",
    },
    {
      weekStart: "2026-01-26",
      featureKey: "weekly_distance_km",
      featureLabel: "Weekly distance",
      value: 60.8,
      unit: "km",
    },
    {
      weekStart: "2026-02-02",
      featureKey: "weekly_distance_km",
      featureLabel: "Weekly distance",
      value: 63.2,
      unit: "km",
    },
    {
      weekStart: "2026-02-09",
      featureKey: "weekly_distance_km",
      featureLabel: "Weekly distance",
      value: 61.5,
      unit: "km",
    },
  ]);
