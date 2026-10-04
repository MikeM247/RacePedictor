import type { CalendarActivityView, CalendarSessionView } from "./coaching-ui-state.ts";

/** Calendar summaries prefer a supplied distance; missing/zero metrics never imply a zero workout. */
export function compactCalendarMetric(distanceMeters: number | undefined, durationSeconds: number | undefined) {
  if (Number.isFinite(distanceMeters) && distanceMeters! > 0) {
    const km = Number((distanceMeters! / 1000).toFixed(2));
    return km > 0 ? `${km} km` : `${distanceMeters} m`;
  }
  if (Number.isFinite(durationSeconds) && durationSeconds! > 0) {
    return `${Number((durationSeconds! / 60).toFixed(1))} min`;
  }
  return "N/A";
}

export function calendarDayRecords(date: string, sessions: CalendarSessionView[], activities: CalendarActivityView[]) {
  const planned = sessions.filter((session) => session.effectiveDate === date)
    .sort((left, right) => (left.startTime ?? "").localeCompare(right.startTime ?? "") || left.id.localeCompare(right.id));
  const recorded = activities.filter((activity) => activity.localDate === date)
    .sort((left, right) => left.id.localeCompare(right.id));
  return { planned, recorded, hiddenCount: Math.max(0, planned.length - 1) + Math.max(0, recorded.length - 1) };
}

export function shiftDisplayDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function displayWeekDates(date: string) {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const monday = shiftDisplayDate(date, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDisplayDate(monday, index));
}

// These are calendar dates in an already-resolved saved timezone, not instants.
export function relativeCalendarLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === shiftDisplayDate(today, 1)) return "Tomorrow";
  if (date === shiftDisplayDate(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
}
