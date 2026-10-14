import { weeklyTrainingReadSchema, type WeeklyTrainingRead } from "../contracts/weekly-training.ts";

export const RUNNING_SPORTS = ["run", "trail_run", "treadmill_run"];
export const DEFAULT_TRAINING_TIMEZONE = "Africa/Johannesburg";
export const addCalendarDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export function trainingLocalDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}
export function trainingMonday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addCalendarDays(date, day === 0 ? -6 : 1 - day);
}
export function trainingWindow(generatedAt: string, timezone = DEFAULT_TRAINING_TIMEZONE) {
  const current = trainingMonday(trainingLocalDate(generatedAt, timezone));
  return { timezone, generatedAt, windowStart: addCalendarDays(current, -77), windowEnd: addCalendarDays(current, 7) };
}

export type TrainingActivity = {
  athleteId: string; occurredAt: string; sport: string; deletedAt?: unknown;
  distanceM: number | null; elapsedTimeS: number | null;
  avgPaceSecPerKm: number | null; elevationGainM: number | null;
};
const valid = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;
export function aggregateWeeklyTraining(input: {
  athleteId: string; activities: readonly TrainingActivity[]; generatedAt: string; timezone?: string;
}): WeeklyTrainingRead {
  const window = trainingWindow(input.generatedAt, input.timezone);
  const groups = new Map<string, TrainingActivity[]>();
  for (const activity of input.activities) {
    if (activity.athleteId !== input.athleteId || activity.deletedAt || !RUNNING_SPORTS.includes(activity.sport)) continue;
    const localDate = trainingLocalDate(activity.occurredAt, window.timezone);
    if (localDate < window.windowStart || localDate >= window.windowEnd || Date.parse(activity.occurredAt) > Date.parse(input.generatedAt)) continue;
    const monday = trainingMonday(localDate);
    const group = groups.get(monday) ?? [];
    group.push(activity);
    groups.set(monday, group);
  }
  if (!groups.size) return weeklyTrainingReadSchema.parse({ ...window, status: "empty", weeks: [] });
  const weeks = Array.from({ length: 12 }, (_, index) => {
    const weekStart = addCalendarDays(window.windowStart, index * 7);
    const rows = groups.get(weekStart) ?? [];
    const sum = (key: "distanceM" | "elapsedTimeS" | "elevationGainM") => rows.every(row => valid(row[key])) ? rows.reduce((total, row) => total + row[key]!, 0) : null;
    const distanceM = sum("distanceM");
    const paceRows = rows.filter(row => row.distanceM !== null && row.distanceM > 0);
    const paceAvailable = distanceM !== null && distanceM > 0 && paceRows.every(row => valid(row.avgPaceSecPerKm) && row.avgPaceSecPerKm > 0);
    return {
      weekStart, weekEndExclusive: addCalendarDays(weekStart, 7), isCurrentWeek: index === 11,
      runCount: rows.length, distanceM, elapsedTimeS: sum("elapsedTimeS"), elevationGainM: sum("elevationGainM"),
      avgPaceSecPerKm: paceAvailable ? paceRows.reduce((total, row) => total + row.avgPaceSecPerKm! * row.distanceM!, 0) / distanceM : null,
      coverage: rows.length ? "recorded" : "no_recorded_runs",
    };
  });
  return weeklyTrainingReadSchema.parse({ ...window, status: "ready", weeks });
}
