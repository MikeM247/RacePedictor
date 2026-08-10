import {
  dashboardFetchResultSchema,
  type DashboardFetchResult,
  type ImportProgress,
} from "../contracts/dashboard.ts";

const TARGET_DISTANCES = [5_000, 10_000, 21_097.5, 42_195] as const;
const MODEL_VERSION = "riegel-1.06-cloud-live-v1";

export type CloudDashboardActivity = Readonly<{
  id: string;
  athleteId: string;
  occurredAt: string;
  distanceM: number;
  elapsedTimeS: number;
}>;

export function buildCloudDashboard(input: {
  athleteId: string;
  activities: readonly CloudDashboardActivity[];
  latestImport: ImportProgress | null;
  generatedAt: string;
}): DashboardFetchResult {
  const generatedAt = iso(input.generatedAt);
  const activities = input.activities
    .filter((activity) => activity.athleteId === input.athleteId)
    .map((activity) => ({ ...activity, occurredAt: iso(activity.occurredAt) }))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  if (activities.length === 0) {
    return dashboardFetchResultSchema.parse({ fetchStatus: "empty", stale: { isStale: false } });
  }

  const weeks = weeklyDistance(activities);
  const predictions = TARGET_DISTANCES
    .map((targetDistanceM) => prediction(activities, targetDistanceM, generatedAt))
    .filter((value): value is NonNullable<typeof value> => value !== null);
  if (predictions.length !== TARGET_DISTANCES.length) {
    return dashboardFetchResultSchema.parse({ fetchStatus: "empty", stale: { isStale: false } });
  }
  const summary = predictions.find((value) => value.targetDistanceM === 21_097.5)!;
  const recent = weeks.slice(-4);
  const prior = weeks.slice(-8, -4);
  const recentAverage = mean(recent.map((week) => week.distanceKm));
  const priorAverage = mean(prior.map((week) => week.distanceKm));
  const longestRun = Math.max(...activities.slice(-90).map((activity) => activity.distanceM), 0);
  const activeRatio = recent.length === 0 ? 0 : recent.filter((week) => week.runCount > 0).length / recent.length;
  const volumeTrend = priorAverage > 0 ? clamp(((recentAverage - priorAverage) / priorAverage) * 20, -25, 25) : 0;

  return dashboardFetchResultSchema.parse({
    fetchStatus: "success",
    stale: { isStale: false },
    data: {
      predictionSummary: summary,
      predictionOptions: predictions,
      driverContributions: [
        driver("consistency", "Recent training consistency", activeRatio * 25, 0.8),
        driver("long_run", "Long-run readiness", clamp((longestRun / 21_097.5) * 25, 0, 25), 0.78),
        driver("volume_trend", "Four-week volume trend", volumeTrend, prior.length === 4 ? 0.72 : 0.5),
      ],
      featureTrendPoints: weeks.slice(-12).map((week) => ({
        weekStart: week.weekStart,
        featureKey: "total_distance_km",
        featureLabel: "Weekly distance",
        value: round(week.distanceKm, 1),
        unit: "km",
      })),
      importProgress: input.latestImport ?? {
        importId: "cloud-automatic-ingestion",
        status: "completed",
        stagedCount: 0,
        normalizedCount: activities.length,
        duplicateCount: 0,
        rejectedCount: 0,
        updatedAt: generatedAt,
      },
    },
  });
}

function prediction(activities: readonly CloudDashboardActivity[], targetDistanceM: number, generatedAt: string) {
  const latest = Date.parse(activities.at(-1)!.occurredAt);
  const cutoff = latest - 180 * 24 * 60 * 60 * 1_000;
  const basis = activities
    .filter((activity) => Date.parse(activity.occurredAt) >= cutoff && activity.distanceM >= 5_000 && activity.distanceM <= 30_000)
    .map((activity) => ({
      activity,
      projected: activity.elapsedTimeS * (targetDistanceM / activity.distanceM) ** 1.06,
    }))
    .sort((left, right) => left.projected - right.projected)[0];
  if (!basis) return null;
  const predictedTimeS = Math.round(basis.projected);
  const margin = clamp(0.13 - Math.min(activities.length, 20) * 0.002, 0.07, 0.13);
  return {
    athleteId: basis.activity.athleteId,
    targetDistanceM,
    predictedTimeS,
    predictedPaceSecPerKm: round(predictedTimeS / (targetDistanceM / 1_000), 1),
    bandLowS: Math.round(predictedTimeS * (1 - margin)),
    bandHighS: Math.round(predictedTimeS * (1 + margin)),
    modelVersion: MODEL_VERSION,
    generatedAt,
  };
}

function weeklyDistance(activities: readonly CloudDashboardActivity[]) {
  const groups = new Map<string, { distanceKm: number; runCount: number }>();
  for (const activity of activities) {
    const weekStart = monday(activity.occurredAt);
    const current = groups.get(weekStart) ?? { distanceKm: 0, runCount: 0 };
    current.distanceKm += activity.distanceM / 1_000;
    current.runCount += 1;
    groups.set(weekStart, current);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([weekStart, values]) => ({ weekStart, ...values }));
}

function monday(value: string) {
  const date = new Date(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function driver(key: string, label: string, value: number, confidence: number) {
  return {
    key,
    label,
    contributionPct: round(value, 1),
    direction: value > 0.05 ? "positive" : value < -0.05 ? "negative" : "neutral",
    confidence,
  } as const;
}

function mean(values: readonly number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function iso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Cloud dashboard date is invalid");
  return date.toISOString();
}
