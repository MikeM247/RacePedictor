import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { e2eSnapshotPath } from "./fixture-paths.ts";

export default async function prepareHomeLocalFixture() {
  const snapshot = {
    fetchStatus: "success",
    stale: { isStale: false, staleReason: null, staleAtIso: null },
    data: {
      predictionSummary: { athleteId: "f02-athlete", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "f02-local", generatedAt: "2026-09-15T08:00:00.000Z" },
      predictionOptions: [
        { athleteId: "f02-athlete", targetDistanceM: 5000, predictedTimeS: 1440, predictedPaceSecPerKm: 288, bandLowS: 1380, bandHighS: 1500, modelVersion: "f02-local", generatedAt: "2026-09-15T08:00:00.000Z" },
        { athleteId: "f02-athlete", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "f02-local", generatedAt: "2026-09-15T08:00:00.000Z" },
      ], driverContributions: [{ key: "load", label: "Recent load", contributionPct: -12, direction: "negative", confidence: 0.8 }], featureTrendPoints: [],
      importProgress: { status: "completed", stagedCount: 1, normalizedCount: 1, duplicateCount: 0, rejectedCount: 0 },
    },
  };
  await mkdir(path.dirname(e2eSnapshotPath), { recursive: true });
  await writeFile(e2eSnapshotPath, JSON.stringify(snapshot), "utf8");
}
