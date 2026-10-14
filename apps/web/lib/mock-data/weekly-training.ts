import { aggregateWeeklyTraining, addCalendarDays } from "../../../../packages/core/src/services/weekly-training.ts";

// Synthetic overlay values for mock mode and browser tests only.
// Distance values reproduce the owner's wireframe reference.
export const weeklyTrainingFixture = aggregateWeeklyTraining({
  athleteId: "weekly-chart-fixture",
  generatedAt: "2026-10-13T12:00:00.000Z",
  activities: [41.4, 27.4, 39.7, 39.6, 24.2, 29.4, 32.1, 34.3, 33.4, 31.9, 17.6, 5.1].map((distance, index) => ({
    athleteId: "weekly-chart-fixture", sport: "run",
    occurredAt: `${addCalendarDays("2026-07-27", index * 7)}T06:00:00.000Z`,
    distanceM: distance * 1000,
    elapsedTimeS: index === 8 ? 11400 : Math.round(distance * (340 + index % 3 * 12)),
    avgPaceSecPerKm: index === 8 ? 342 : 335 + index % 4 * 9,
    elevationGainM: index === 8 ? 420 : 150 + index % 5 * 65,
  })),
});
