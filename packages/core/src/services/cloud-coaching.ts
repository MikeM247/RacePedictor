import {
  calendarRouteDataSchema,
  todayRouteDataSchema,
  trainingPlanSchema,
  type TrainingPlan,
} from "../contracts/coaching.ts";

function localDateInTimezone(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function countdownLabel(days: number) {
  if (days === 0) return "Target day";
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} to target`;
  const elapsed = Math.abs(days);
  return `${elapsed} day${elapsed === 1 ? "" : "s"} since target`;
}

function toCalendarSession(plan: TrainingPlan, workout: TrainingPlan["workouts"][number]) {
  return {
    ...workout,
    prescribedDate: workout.scheduledDate,
    effectiveDate: workout.scheduledDate,
    originalDate: workout.scheduledDate,
    status: "upcoming" as const,
    revision: plan.revision,
    warnings: [],
  };
}

export function projectCloudCalendar(input: {
  plan: TrainingPlan | null;
  from: string;
  to: string;
}) {
  const plan = input.plan ? trainingPlanSchema.parse(input.plan) : null;
  return calendarRouteDataSchema.parse({
    from: input.from,
    to: input.to,
    sessions: (plan?.workouts ?? [])
      .filter((workout) => workout.scheduledDate >= input.from && workout.scheduledDate <= input.to)
      .map((workout) => toCalendarSession(plan!, workout)),
  });
}

export function projectCloudToday(input: {
  athleteId: string;
  plan: TrainingPlan | null;
  date?: string;
  generatedAt?: Date;
}) {
  const generatedAt = input.generatedAt ?? new Date();
  const plan = input.plan ? trainingPlanSchema.parse(input.plan) : null;
  const timezone = plan?.timezone ?? "UTC";
  const today = localDateInTimezone(generatedAt, timezone);
  const date = input.date ?? today;
  const workout = plan?.workouts.find((candidate) => candidate.scheduledDate === date) ?? null;
  const session = plan && workout ? toCalendarSession(plan, workout) : null;
  const state = !plan
    ? "no-plan" as const
    : workout?.kind === "rest"
      ? "rest" as const
      : workout
        ? date < today ? "missed" as const : "upcoming" as const
        : "rest" as const;
  const message = state === "no-plan"
    ? "No approved plan has been synced to the online dashboard yet."
    : state === "rest"
      ? "No workout is prescribed for this date in the approved plan."
      : state === "missed"
        ? "This approved session is in the past and remains unconfirmed."
        : "Follow the approved session as written; the online dashboard has not adapted it.";

  return todayRouteDataSchema.parse({
    athleteId: input.athleteId,
    date,
    sessionId: session?.id ?? null,
    message,
    source: "fallback",
    generatedAt: generatedAt.toISOString(),
    idempotencyKey: `cloud-today:${input.athleteId}:${date}:${session?.id ?? "no-session"}`,
    timezone,
    state,
    status: state,
    goal: null,
    plan: plan ? { id: plan.id, version: plan.version, startsOn: plan.startsOn, endsOn: plan.endsOn } : null,
    planVersion: plan?.version ?? null,
    session,
    localCue: "This is a read-only view of the last explicitly approved structured plan.",
    scheduleWarnings: [],
    stale: { isStale: false, reason: null },
    links: {
      plan: "/dashboard/plan",
      calendar: "/dashboard/calendar",
      session: session ? `/dashboard/calendar?date=${date}&session=${encodeURIComponent(session.id)}` : null,
    },
  });
}
