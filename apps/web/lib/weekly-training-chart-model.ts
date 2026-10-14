import type { WeeklyTrainingRead, WeeklyTrainingWeek } from "../../../packages/core/src/contracts/weekly-training.ts";
import type { FeatureTrendPointView } from "./dashboard-view-model.ts";
import { groupTrendSeries } from "./readiness-evidence.ts";
import { addCalendarDays } from "../../../packages/core/src/services/weekly-training.ts";

export const overlays = [
  { key: "avgPaceSecPerKm", label: "Pace", detail: "Avg pace", symbol: "●" },
  { key: "elapsedTimeS", label: "Time", detail: "Elapsed time", symbol: "■" },
  { key: "elevationGainM", label: "Elevation", detail: "Elevation gain", symbol: "▲" },
] as const;
export type OverlayKey = typeof overlays[number]["key"];
export const isDistanceSeries = (point: { featureKey: string; unit: string }) => ["total_distance_km", "weekly_distance_km", "distance"].includes(point.featureKey) && point.unit === "km";

export function trainingChartData(read: WeeklyTrainingRead | undefined, points: FeatureTrendPointView[], error?: string) {
  if (error) return { weeks: [] as WeeklyTrainingWeek[], legacy: false, message: error, consumedDistance: false };
  if (read) return { weeks: read.weeks, legacy: false, consumedDistance: true, message: read.status === "unavailable" ? "Weekly training is temporarily unavailable." : read.status === "empty" ? "No recorded runs in the past 12 weeks." : null };
  const series = groupTrendSeries(points.filter(isDistanceSeries));
  const invalid = points.some(point => isDistanceSeries(point) && (!Number.isFinite(point.value) || point.value < 0));
  if (series.length !== 1 || invalid) return { weeks: [] as WeeklyTrainingWeek[], legacy: true, consumedDistance: false, message: series.length || invalid ? "A distance chart is unavailable for these observations. Original evidence is shown below." : "No supplied weekly training observations are available." };
  const supplied = series[0].points;
  const start = supplied[0].weekStart, end = supplied.at(-1)!.weekStart;
  const count = (Date.parse(end) - Date.parse(start)) / (7 * 86_400_000) + 1;
  if (!Number.isInteger(count) || count > 104 || supplied.some(point => new Date(point.weekStart).getUTCDay() !== 1 || new Date(point.weekStart).toISOString().slice(0, 10) !== point.weekStart) || new Set(supplied.map(point => point.weekStart)).size !== supplied.length) {
    return { weeks: [] as WeeklyTrainingWeek[], legacy: true, consumedDistance: false, message: "A distance chart is unavailable for these observations. Original evidence is shown below." };
  }
  const weeks: WeeklyTrainingWeek[] = Array.from({ length: count }, (_, index) => {
    const weekStart = addCalendarDays(start, index * 7);
    const point = supplied.find(candidate => candidate.weekStart === weekStart);
    return { weekStart, weekEndExclusive: addCalendarDays(weekStart, 7), isCurrentWeek: false, runCount: null, distanceM: point ? point.value * 1000 : null, elapsedTimeS: null, avgPaceSecPerKm: null, elevationGainM: null, coverage: point ? "recorded" : "unknown" };
  });
  return { weeks, legacy: true, consumedDistance: true, message: null };
}

export function distanceCeiling(weeks: WeeklyTrainingWeek[]) {
  const maximum = Math.max(0, ...weeks.map(week => (week.distanceM ?? 0) / 1000));
  if (maximum === 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 5));
  const step = [1, 2, 5, 10].map(value => value * magnitude).find(value => value >= maximum / 5)!;
  return Math.ceil(maximum / step) * step;
}
export function relativeValues(weeks: WeeklyTrainingWeek[], key: OverlayKey) {
  const values = weeks.map(week => week[key]);
  const valid = values.filter((value): value is number => value !== null);
  const min = Math.min(...valid), max = Math.max(...valid);
  return values.map(value => value === null ? null : min === max ? 0.5 : (value - min) / (max - min));
}
export const weekLabel = (date: string) => new Intl.DateTimeFormat("en-ZA", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));
export function metricText(key: OverlayKey | "distanceM", value: number | null) {
  if (value === null) return "Unavailable";
  if (key === "distanceM") return `${(value / 1000).toFixed(1)} km`;
  const rounded = Math.round(value);
  if (key === "avgPaceSecPerKm") return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} /km`;
  if (key === "elevationGainM") return `${rounded.toLocaleString("en-ZA")} m`;
  return `${Math.floor(rounded / 3600)}h ${String(Math.floor(rounded % 3600 / 60)).padStart(2, "0")}m ${String(rounded % 60).padStart(2, "0")}s`;
}
