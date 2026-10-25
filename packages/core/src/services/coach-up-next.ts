export type CoachSessionCandidate = {
  id: string;
  effectiveDate: string;
  kind: string;
  status: string;
  startTime?: string | null;
};

export type CoachActivityCandidate = {
  id: string;
  localDate: string;
  sport: string;
  occurredAt?: string | null;
  elapsedTimeSeconds: number;
};

/** Shared policy used by the existing Today card and the Coach server context. */
export function resolveCoachUpNext(input: {
  today: string;
  todaySessions: readonly CoachSessionCandidate[];
  sessions: readonly CoachSessionCandidate[];
  activities: readonly CoachActivityCandidate[];
  timezone: string;
  activitiesAvailable: boolean;
  apiNextSession?: CoachSessionCandidate | null;
  now?: Date;
}): { kind: "selected"; session: CoachSessionCandidate; advancedByRecordedRun: boolean } | { kind: "ambiguous"; candidates: CoachSessionCandidate[] } | { kind: "none" } {
  const todaySessions = input.todaySessions.filter((candidate) =>
    candidate.effectiveDate === input.today && candidate.kind !== "rest" && candidate.status !== "skipped",
  );
  const todayRuns = input.activities.filter((activity) => {
    if (activity.localDate !== input.today || !["run", "trail_run", "treadmill_run"].includes(activity.sport)) return false;
    if (!activity.occurredAt) return true;
    return Date.parse(activity.occurredAt) <= (input.now ?? new Date()).valueOf();
  });
  const latestRunFinish = todayRuns.reduce<string | null>((latest, activity) => {
    if (!activity.occurredAt) return latest;
    const finish = new Date(Date.parse(activity.occurredAt) + activity.elapsedTimeSeconds * 1_000);
    if (!Number.isFinite(finish.valueOf())) return latest;
    const clock = localClock(finish.toISOString(), input.timezone);
    return latest === null || clock > latest ? clock : latest;
  }, null);
  const runSessions = todaySessions.filter((candidate) => candidate.kind === "run");
  const laterToday = latestRunFinish
    ? todaySessions.filter((candidate) => candidate.kind !== "run" || !candidate.startTime || candidate.startTime > latestRunFinish)
    : [];
  const todayHasAmbiguity = input.activitiesAvailable && (
    todayRuns.length > 0 && (runSessions.length !== 1 || laterToday.length > 1)
    || todayRuns.length === 0 && todaySessions.length > 1
  );
  if (todayHasAmbiguity) return { kind: "ambiguous", candidates: todaySessions };

  const advancedByRecordedRun = input.activitiesAvailable
    && todayRuns.length > 0
    && todaySessions.length === 1
    && runSessions.length === 1
    && !(runSessions[0].startTime && latestRunFinish && runSessions[0].startTime > latestRunFinish);
  const laterSessions = input.sessions.filter((candidate) =>
    candidate.effectiveDate > input.today && candidate.kind !== "rest" && candidate.status !== "skipped",
  );
  const selected = advancedByRecordedRun
    ? laterSessions[0] ?? input.apiNextSession ?? null
    : input.activitiesAvailable && todayRuns.length > 0
      ? laterToday[0] ?? (laterToday.length === 0 ? laterSessions[0] ?? input.apiNextSession ?? null : null)
      : input.activitiesAvailable ? todaySessions[0] ?? laterSessions[0] ?? input.apiNextSession ?? null
        : todaySessions[0] ?? laterSessions[0] ?? input.apiNextSession ?? null;
  return selected ? { kind: "selected", session: selected, advancedByRecordedRun } : { kind: "none" };
}

function localClock(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.hour}:${fields.minute}`;
}
