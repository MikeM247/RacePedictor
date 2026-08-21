export const todayCoachingStates = [
  "no-plan",
  "rest",
  "upcoming",
  "skipped",
  "missed",
  "stale",
] as const;

export type TodayCoachingState = typeof todayCoachingStates[number];

export type TargetCountdown = {
  days: number;
  label: string;
};

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function localDateInIanaTimezone(value: Date, timezone: string): string {
  if (!isIanaTimezone(timezone)) throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildTargetCountdown(today: string, targetDate: string): TargetCountdown {
  if (!isCalendarDate(today) || !isCalendarDate(targetDate)) {
    throw new RangeError("Countdown dates must use valid YYYY-MM-DD values");
  }
  const days = Math.round(
    (Date.parse(`${targetDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000,
  );
  const label = days === 0
    ? "Target day"
    : days > 0
      ? `${days} ${days === 1 ? "day" : "days"} to target`
      : `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} past target`;
  return { days, label };
}

export function buildDeterministicLocalCue(state: TodayCoachingState, sessionTitle?: string): string {
  switch (state) {
    case "no-plan":
      return "Settle a goal and approve a plan before relying on daily coaching.";
    case "upcoming":
      return `Start controlled and keep ${sessionTitle || "today's session"} aligned with its approved purpose.`;
    case "skipped":
      return "Keep the skip intentional and check the next approved session in Calendar.";
    case "missed":
      return "Check the past session in Calendar before choosing today's training; no plan change has been made.";
    case "stale":
      return "Review the latest app-owned context before relying on the approved schedule; no plan change has been made.";
    case "rest":
      return "Protect recovery today so the next approved session stays purposeful.";
  }
}
