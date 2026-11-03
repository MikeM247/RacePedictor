export function calendarMonthSummaryEnabled(
  source: Readonly<Record<string, string | undefined>> = process.env,
) {
  return source.RACEPREDICTOR_CALENDAR_MONTH_SUMMARY_ENABLED === "true";
}
