import {
  predictionSummarySchema,
  type PredictionSummary,
} from "../../../../packages/core/src/contracts";

export const predictionSummaryFixture: PredictionSummary = predictionSummarySchema.parse({
  athleteId: "athlete_001",
  predictedTimeS: 5710,
  predictedPaceSecPerKm: 271.9,
  bandLowS: 5550,
  bandHighS: 5920,
  modelVersion: "v1.3.0",
  generatedAt: "2026-02-20T08:15:00.000Z",
});
