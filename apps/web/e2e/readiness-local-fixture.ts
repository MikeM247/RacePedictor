import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { e2eSnapshotPath } from "./fixture-paths.ts";

export default async function prepareReadinessLocalFixture() {
  const snapshot = {
    fetchStatus: "success",
    stale: { isStale: true, staleReason: "A previous assessment is shown.", staleAtIso: "2026-08-18T08:00:00.000Z" },
    data: {
      predictionSummary: { athleteId: "f01-local", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "f01-local", generatedAt: "2026-08-18T07:00:00.000Z" },
      predictionOptions: [
        { athleteId: "f01-local", targetDistanceM: 5000, predictedTimeS: 1440, predictedPaceSecPerKm: 288, bandLowS: 1380, bandHighS: 1500, modelVersion: "f01-local", generatedAt: "2026-08-18T07:00:00.000Z" },
        { athleteId: "f01-local", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "f01-local", generatedAt: "2026-08-18T07:00:00.000Z" },
      ],
      driverContributions: [
        { key: "late", label: "Late array entry", contributionPct: 10, direction: "positive", confidence: 0.8 },
        { key: "load", label: "Recent load", contributionPct: -24, direction: "negative", confidence: 0.8 },
        { key: "zero", label: "Neutral data", contributionPct: 0, direction: "neutral", confidence: 0.8 },
      ],
      featureTrendPoints: [
        { weekStart: "2026-07-27", featureKey: "distance", featureLabel: "Weekly distance", value: -2, unit: "km" },
        { weekStart: "2026-08-10", featureKey: "distance", featureLabel: "Weekly distance", value: 0, unit: "km" },
        { weekStart: "2026-08-03", featureKey: "effort", featureLabel: "Weekly effort", value: 4, unit: "points" },
      ],
      importProgress: { importId: "f01-local-import", status: "completed", stagedCount: 1, normalizedCount: 1, duplicateCount: 0, rejectedCount: 0, updatedAt: "2026-08-18T07:00:00.000Z" },
    },
  };
  await mkdir(path.dirname(e2eSnapshotPath), { recursive: true });
  await writeFile(e2eSnapshotPath, JSON.stringify(snapshot), "utf8");
}
