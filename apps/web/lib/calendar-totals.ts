import type { CalendarActivityView, CalendarSessionView } from "./coaching-ui-state";

export type CalendarReadStatus = "available" | "unavailable";
export type CalendarPlanReadStatus = "active" | "none" | "unavailable";
export type CalendarScheduleReadStatus = "effective" | "approved_fallback" | "unavailable";

export type CalendarTotals = {
  recorded: {
    distanceMeters: number;
    durationSeconds: number;
    activityCount: number;
    complete: boolean;
    missingRecordCount: number;
  };
  planned: {
    distanceMeters: number;
    durationSeconds: number;
    sessionCount: number;
    complete: boolean;
    missingRecordCount: number;
  };
};

const eligibleSports = new Set(["run", "trail_run", "treadmill_run"]);

function isWithin(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

/** Pure, source-aware totals for a displayed date range (inclusive). */
export function calculateCalendarTotals(input: {
  from: string;
  to: string;
  sessions: CalendarSessionView[];
  activities: CalendarActivityView[];
  planReadStatus: CalendarPlanReadStatus;
  scheduleReadStatus: CalendarScheduleReadStatus;
  activitiesReadStatus: CalendarReadStatus;
}): CalendarTotals {
  const sessions = input.sessions.filter((session) =>
    isWithin(session.effectiveDate, input.from, input.to)
      && session.kind === "run"
      && session.status !== "skipped",
  );

  const activityMap = new Map<string, CalendarActivityView>();
  for (const activity of input.activities) {
    if (eligibleSports.has(activity.sport) && isWithin(activity.localDate, input.from, input.to)) {
      if (!activityMap.has(activity.id)) activityMap.set(activity.id, activity);
    }
  }
  const activities = [...activityMap.values()];
  const missingSessionMetrics = sessions.filter((session) => session.distanceMeters === undefined).length;
  const missingActivityMetrics = activities.filter((activity) =>
    !Number.isFinite(activity.distanceMeters) || !Number.isFinite(activity.elapsedTimeSeconds),
  ).length;

  return {
    recorded: {
      distanceMeters: activities.reduce((sum, activity) => sum + (Number.isFinite(activity.distanceMeters) ? activity.distanceMeters : 0), 0),
      durationSeconds: activities.reduce((sum, activity) => sum + (Number.isFinite(activity.elapsedTimeSeconds) ? activity.elapsedTimeSeconds : 0), 0),
      activityCount: activities.length,
      complete: input.activitiesReadStatus === "available" && missingActivityMetrics === 0,
      missingRecordCount: missingActivityMetrics,
    },
    planned: {
      distanceMeters: sessions.reduce((sum, session) => sum + (session.distanceMeters ?? 0), 0),
      durationSeconds: sessions.reduce((sum, session) => sum + session.durationMinutes * 60, 0),
      sessionCount: sessions.length,
      complete: input.planReadStatus === "active"
        && input.scheduleReadStatus === "effective"
        && missingSessionMetrics === 0,
      missingRecordCount: missingSessionMetrics,
    },
  };
}
