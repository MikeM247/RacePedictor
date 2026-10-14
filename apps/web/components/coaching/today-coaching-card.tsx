"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  formatCoachingDate,
  localDateInTimezone,
  normalizeCalendarSessions,
  normalizeCalendarActivities,
  weekRange,
  type CalendarActivityView,
  type CalendarSessionView,
} from "../../lib/coaching-ui-state";
import { todayCoachingStates, type TodayCoachingState } from "../../lib/today-coaching";
import { createRecoveryContext, readRecoveryContext, recoveryReturnHref, restoreRecoveryFocus } from "../../lib/recovery-context";
import "./coaching-ui.css";

type JsonRecord = Record<string, unknown>;
type RequestState = "loading" | "success" | "error";
type WeekRequestState = "idle" | "loading" | "success" | "error";

const asRecord = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as JsonRecord
  : {};

const asTodayState = (value: unknown): TodayCoachingState => todayCoachingStates.includes(value as TodayCoachingState)
  ? value as TodayCoachingState
  : "rest";

const stateLabels: Record<TodayCoachingState, string> = {
  "no-plan": "No active plan",
  rest: "Rest",
  upcoming: "Upcoming",
  skipped: "Skipped",
  missed: "Missed · unconfirmed",
  stale: "Stale context",
};

async function loadToday(): Promise<JsonRecord> {
  const response = await fetch("/api/v1/coaching/today", { cache: "no-store" });
  const body = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    const error = asRecord(body.error);
    throw new Error(typeof error.message === "string" ? error.message : "Today could not be loaded.");
  }
  return asRecord(body.data ?? body);
}

type CurrentWeekData = { sessions: CalendarSessionView[]; activities: CalendarActivityView[]; activitiesReadStatus: "available" | "unavailable"; timezone: string };

async function loadCurrentWeek(date: string): Promise<CurrentWeekData> {
  const range = weekRange(date);
  const params = new URLSearchParams(range);
  const response = await fetch(`/api/v1/coaching/calendar?${params}`, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = asRecord(asRecord(body).error);
    throw new Error(typeof error.message === "string" ? error.message : "The current week could not be loaded.");
  }
  const data = asRecord(asRecord(body).data ?? body);
  const sessions = normalizeCalendarSessions(body).sort((left, right) => {
    const byDate = left.effectiveDate.localeCompare(right.effectiveDate);
    return byDate || (left.startTime ?? "").localeCompare(right.startTime ?? "") || left.title.localeCompare(right.title);
  });
  return {
    sessions,
    activities: normalizeCalendarActivities(body),
    activitiesReadStatus: data.activitiesReadStatus === "unavailable" || !Array.isArray(data.activities) ? "unavailable" : "available",
    timezone: typeof data.timezone === "string" ? data.timezone : "Africa/Johannesburg",
  };
}

function localClock(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === "hour")?.value ?? "00"}:${parts.find((part) => part.type === "minute")?.value ?? "00"}`;
}

function homeNextDate(date: string, timezone: string) {
  return new Intl.DateTimeFormat("en-ZA", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00.000Z`));
}

function GoalSummary({ goal, noPlan = false }: { goal: JsonRecord; noPlan?: boolean }) {
  if (!goal.id) return null;
  const countdown = asRecord(goal.countdown);
  return <section className="today-goal-summary" aria-label={noPlan ? "Settled goal" : "Active goal"}>
    <p className="eyebrow">{noPlan ? "Settled goal" : "Active goal"}</p>
    <strong>{String(goal.title ?? "Current goal")}</strong>
    {typeof countdown.label === "string" ? <span>{countdown.label}</span> : null}
  </section>;
}

function PlanContext({ plan, timezone }: { plan: JsonRecord; timezone: string }) {
  if (!plan.id) return null;
  const startsOn = String(plan.startsOn ?? "");
  const endsOn = String(plan.endsOn ?? "");
  return (
    <section className="today-plan-context" aria-label="Active approved plan context">
      <p className="eyebrow">Active approved plan</p>
      <dl>
        <div><dt>Version</dt><dd>Plan v{String(plan.version ?? "—")}</dd></div>
        <div><dt>Approved dates</dt><dd>{formatCoachingDate(startsOn, timezone)} – {formatCoachingDate(endsOn, timezone)}</dd></div>
      </dl>
    </section>
  );
}

function effectiveSessionStatus(session: CalendarSessionView) {
  if (session.status === "skipped") return "Skipped";
  if (session.effectiveDate !== session.prescribedDate) return "Scheduled · moved";
  if (session.amendments.length > 0) return "Scheduled · amended";
  return "Scheduled";
}

function CurrentWeek({
  date,
  timezone,
  state,
  sessions,
  errorMessage,
  onRetry,
}: {
  date: string;
  timezone: string;
  state: WeekRequestState;
  sessions: CalendarSessionView[];
  errorMessage: string;
  onRetry: () => void;
}) {
  if (state === "idle") return null;
  const range = weekRange(date);
  return (
    <section className="today-week" aria-labelledby="today-week-heading">
      <header className="today-week-heading">
        <div>
          <p className="eyebrow">Approved calendar</p>
          <h3 id="today-week-heading">Current week</h3>
          <p>{formatCoachingDate(range.from, timezone)} – {formatCoachingDate(range.to, timezone)}</p>
        </div>
        <Link className="text-link" href={`/dashboard/calendar?date=${encodeURIComponent(date)}`}>Open full calendar</Link>
      </header>
      {state === "loading" ? <p className="today-week-state" role="status" aria-live="polite">Loading this week&apos;s effective schedule…</p> : null}
      {state === "error" ? (
        <div className="today-week-state today-week-state--error" role="alert">
          <p><strong>Current week unavailable.</strong> {errorMessage}</p>
          <button className="button button-secondary" type="button" onClick={onRetry}>Retry this week</button>
        </div>
      ) : null}
      {state === "success" && sessions.length === 0 ? <p className="today-week-state">No approved sessions fall within this week.</p> : null}
      {state === "success" && sessions.length > 0 ? (
        <ol className="today-week-list">
          {sessions.map((session) => {
            const isToday = session.effectiveDate === date;
            const changed = session.amendments.length > 0 || session.effectiveDate !== session.prescribedDate;
            return (
              <li key={session.id} className={`today-week-session${isToday ? " today-week-session--today" : ""}${session.status === "skipped" ? " today-week-session--skipped" : ""}`} aria-current={isToday ? "date" : undefined}>
                <div className="today-week-date">
                  <time dateTime={session.effectiveDate}>{formatCoachingDate(session.effectiveDate, timezone)}</time>
                  {isToday ? <span>Today</span> : null}
                </div>
                <div className="today-week-session-copy">
                  <strong>{session.title}</strong>
                  <small>{session.kind.replaceAll("_", " ")} · {session.durationMinutes} min</small>
                </div>
                <div className="today-week-effective">
                  <span className={`status-chip${session.status === "skipped" || changed ? " status-chip--warning" : ""}`}>{effectiveSessionStatus(session)}</span>
                  {session.effectiveDate !== session.prescribedDate ? <small>Approved for {formatCoachingDate(session.prescribedDate, timezone)}</small> : null}
                </div>
                <Link className="today-week-link" href={`/dashboard/calendar?date=${encodeURIComponent(session.effectiveDate)}&session=${encodeURIComponent(session.id)}`} aria-label={`Open ${session.title} in Calendar`}>Open</Link>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

export function TodayCoachingCard({ compact = false, headingLevel = 2, homeAction = false, currentDate, refreshKey = 0, onTimezone }: { compact?: boolean; headingLevel?: 2 | 3; homeAction?: boolean; currentDate?: string; refreshKey?: number; onTimezone?: (timezone: string) => void }) {
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [payload, setPayload] = useState<JsonRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [weekState, setWeekState] = useState<WeekRequestState>("idle");
  const [weekData, setWeekData] = useState<CurrentWeekData | null>(null);
  const [weekError, setWeekError] = useState("");
  const [weekRequestVersion, setWeekRequestVersion] = useState(0);
  const focusedCalendarLauncher = useRef<HTMLAnchorElement | null>(null);

  function openCalendar(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = new URL(event.currentTarget.href);
    if (destination.origin !== window.location.origin || destination.pathname !== "/dashboard/calendar") return;
    event.preventDefault();
    const context = createRecoveryContext({ kind: "home", path: "/dashboard", scrollY: window.scrollY, focusKey: event.currentTarget.id });
    window.history.replaceState(window.history.state, "", recoveryReturnHref(context, "/dashboard"));
    window.location.assign(destination.href);
  }

  function restoreCalendarLauncher(node: HTMLAnchorElement | null) {
    const context = readRecoveryContext(new URLSearchParams(window.location.search).get("recovery"));
    if (!node || focusedCalendarLauncher.current === node || context?.kind !== "home" || context.focusKey !== node.id) return;
    focusedCalendarLauncher.current = node;
    restoreRecoveryFocus(context);
    window.requestAnimationFrame(() => node.focus({ preventScroll: true }));
  }

  useEffect(() => {
    if (typeof payload?.timezone === "string") onTimezone?.(payload.timezone);
  }, [payload, onTimezone]);

  useEffect(() => {
    let current = true;
    setRequestState((current) => current === "success" ? "success" : "loading");
    setErrorMessage("");
    void loadToday().then((response) => {
      if (!current) return;
      setPayload(response);
      setRequestState("success");
    }).catch((error) => {
      if (!current) return;
      setErrorMessage(error instanceof Error ? error.message : "Today could not be loaded.");
      setRequestState((state) => state === "success" ? "success" : "error");
    });
    return () => { current = false; };
  }, [requestVersion, currentDate, refreshKey]);

  useEffect(() => {
    const plan = asRecord(payload?.plan);
    const date = String(payload?.date ?? "");
    if ((compact && !homeAction) || requestState !== "success" || !plan.id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setWeekState("idle");
      setWeekData(null);
      setWeekError("");
      return;
    }
    let current = true;
    setWeekState("loading");
    setWeekError("");
    void loadCurrentWeek(date).then((data) => {
      if (!current) return;
      setWeekData(data);
      setWeekState("success");
    }).catch((error) => {
      if (!current) return;
      setWeekData(null);
      setWeekError(error instanceof Error ? error.message : "The current week could not be loaded.");
      setWeekState("error");
    });
    return () => { current = false; };
  }, [compact, homeAction, payload, requestState, weekRequestVersion, refreshKey]);

  const ContextHeading = headingLevel === 3 ? "h3" : "h2";

  if (requestState === "loading") return <section className="today-coach-card today-coach-card--loading" role="status" aria-live="polite" aria-busy="true">
    <div className="today-coach-main"><ContextHeading>Loading today&apos;s focus…</ContextHeading></div>
  </section>;

  if (requestState === "error" || !payload) return <section className="today-coach-card today-coach-card--error" role="alert">
    <div className="today-coach-main"><p className="eyebrow">Approved coaching</p><ContextHeading>Today&apos;s coaching context is unavailable</ContextHeading><p>{errorMessage || "Refresh the approved coaching context and try again."}</p><p className="today-local-cue">No plan or session has been changed.</p></div>
    <div className="today-actions"><button className="button button-primary" type="button" onClick={() => setRequestVersion((value) => value + 1)}>Retry today</button><Link className="text-link" href="/dashboard/plan">Open Plan</Link></div>
  </section>;

  const state = asTodayState(payload.state ?? payload.status);
  const goal = asRecord(payload.goal);
  const plan = asRecord(payload.plan);
  const session = asRecord(payload.session);
  const links = asRecord(payload.links);
  const timezone = String(payload.timezone ?? "Africa/Johannesburg");
  const date = String(payload.date ?? "");
  const warnings = Array.isArray(payload.scheduleWarnings) ? payload.scheduleWarnings.map(String) : [];

  if (state === "no-plan") return <section className={`today-coach-card today-coach-card--empty${compact ? " today-coach-card--compact" : ""}`} aria-labelledby="today-coaching-heading">
    <div className="today-coach-main"><p className="eyebrow">Today · {date ? formatCoachingDate(date, timezone) : "Local date"} · {timezone}</p><ContextHeading id="today-coaching-heading">No active coaching plan yet</ContextHeading><p>{String(payload.message ?? "Settle a goal, create a proposal with Codex, and explicitly approve it before relying on daily coaching.")}</p>{!compact ? <><p className="today-local-cue">{String(payload.localCue ?? "Today will never activate or change a plan automatically.")}</p><GoalSummary goal={goal} noPlan /></> : null}</div>
    <div className="today-actions"><span className="status-chip">{stateLabels[state]}</span><Link className="button button-primary" href={String(links.plan ?? "/dashboard/plan")}>Start planning</Link></div>
  </section>;

  const originalSession = asRecord(session.original);
  const amendments = Array.isArray(session.amendments)
    ? session.amendments.map(asRecord).filter((amendment) => typeof amendment.reason === "string")
    : [];
  const latestAmendment = amendments[amendments.length - 1];
  const rawScheduleKind = payload.todayScheduleKind;
  const scheduleKind = ["prescribed_session", "prescribed_rest", "unscheduled"].includes(String(rawScheduleKind))
    ? String(rawScheduleKind)
    : "unavailable";
  const hasPrescribedSession = Boolean(session.id) && scheduleKind === "prescribed_session";
  const nextWorkout = asRecord(payload.nextWorkout);
  const apiNextSession = nextWorkout.id && nextWorkout.scheduledDate
    ? normalizeCalendarSessions({ sessions: [{ ...nextWorkout, scheduledDate: String(nextWorkout.scheduledDate), effectiveDate: String(nextWorkout.scheduledDate), prescribedDate: String(nextWorkout.scheduledDate), originalDate: String(nextWorkout.scheduledDate), status: "upcoming" }] })[0]
    : undefined;
  const today = date;
  const todaySessions = (weekData?.sessions ?? []).filter((candidate) => candidate.effectiveDate === today && candidate.kind !== "rest" && candidate.status !== "skipped");
  const todayCandidates = todaySessions.filter((candidate) => candidate.kind === "run");
  const todayRuns = (weekData?.activities ?? []).filter((activity) => activity.localDate === today && ["run", "trail_run", "treadmill_run"].includes(activity.sport) && (!activity.occurredAt || Date.parse(activity.occurredAt) <= Date.now()));
  const latestRunFinish = todayRuns.reduce<string | null>((latest, activity) => {
    if (!activity.occurredAt) return latest;
    const finish = new Date(new Date(activity.occurredAt).valueOf() + activity.elapsedTimeSeconds * 1000);
    if (!Number.isFinite(finish.valueOf())) return latest;
    const clock = localClock(finish.toISOString(), weekData?.timezone ?? timezone);
    return latest === null || clock > latest ? clock : latest;
  }, null);
  const laterTodayCandidates = latestRunFinish
    ? todaySessions.filter((candidate) => candidate.kind !== "run" || !candidate.startTime || candidate.startTime > latestRunFinish)
    : [];
  const weekDataUsable = weekData !== null && weekData.activitiesReadStatus === "available" && (weekState === "success" || weekState === "loading");
  const upNextAmbiguous = homeAction && weekDataUsable && (
    todayRuns.length > 0 && (todayCandidates.length !== 1 || laterTodayCandidates.length > 1)
    || todayRuns.length === 0 && todaySessions.length > 1
  );
  const recordedRunAdvancesToday = homeAction && weekDataUsable && todayRuns.length > 0 && todaySessions.length === 1 && todayCandidates.length === 1 && !(todayCandidates[0].startTime && latestRunFinish && todayCandidates[0].startTime > latestRunFinish);
  const selectedNext = homeAction && weekDataUsable && !upNextAmbiguous
    ? recordedRunAdvancesToday
      ? weekData.sessions.find((candidate) => candidate.effectiveDate > today && candidate.kind !== "rest" && candidate.status !== "skipped") ?? apiNextSession
      : todayRuns.length > 0
        ? laterTodayCandidates[0] ?? (laterTodayCandidates.length === 0 ? weekData.sessions.find((candidate) => candidate.effectiveDate > today && candidate.kind !== "rest" && candidate.status !== "skipped") ?? apiNextSession : undefined)
        : todaySessions[0] ?? weekData.sessions.find((candidate) => candidate.effectiveDate > today && candidate.kind !== "rest" && candidate.status !== "skipped") ?? apiNextSession
    : undefined;
  const displayingNextWorkout = Boolean(homeAction && selectedNext && (selectedNext.effectiveDate > today || recordedRunAdvancesToday || (todayRuns.length > 0 && selectedNext.id !== session.id)));
  const displaySession = displayingNextWorkout ? selectedNext : session;
  const displaySessionRecord = asRecord(displaySession);
  const displayCautions = Array.isArray(displaySessionRecord.cautions) ? displaySessionRecord.cautions.map(String) : [];
  const displayWarnings = displayingNextWorkout
    ? Array.isArray(displaySessionRecord.warnings) ? displaySessionRecord.warnings.map(String) : []
    : warnings;
  const heading = upNextAmbiguous
    ? "Today's sessions need review"
    : displayingNextWorkout
      ? String(displaySession?.title ?? "Next approved workout")
    : scheduleKind === "prescribed_rest"
    ? "Intentional recovery day"
    : scheduleKind === "unscheduled"
      ? "No session scheduled today"
      : scheduleKind === "unavailable"
        ? "Today’s schedule details are unavailable"
    : state === "missed"
      ? "Past session needs attention"
      : state === "skipped"
        ? "Scheduled session skipped"
        : String(session.title ?? "Today's approved session");
  const sessionDate = String(displaySession?.effectiveDate ?? displaySession?.scheduledDate ?? date);
  const scheduleDescription = scheduleKind === "prescribed_rest"
    ? "The approved plan prescribes rest today."
    : scheduleKind === "unscheduled"
      ? "No session is scheduled today. This is different from a prescribed rest day."
      : scheduleKind === "prescribed_session"
        ? state === "skipped" ? "A session was prescribed for today and is explicitly skipped." : "An approved session is scheduled for today."
        : "This response does not include a verified schedule classification. Open Calendar to check today’s effective schedule.";
  const statusLabel = scheduleKind === "prescribed_rest" ? "Prescribed rest"
    : scheduleKind === "unscheduled" ? "Unscheduled"
      : scheduleKind === "unavailable" ? "Schedule unavailable"
        : stateLabels[state];
  const homeEyebrow = upNextAmbiguous
    ? "Today · Check calendar"
    : displayingNextWorkout
      ? `${scheduleKind === "prescribed_rest" ? "Today · Recovery · Next" : "Up next"} · ${homeNextDate(sessionDate, weekData?.timezone ?? timezone)}`
    : scheduleKind === "prescribed_rest"
    ? "Today · Recovery"
    : scheduleKind === "prescribed_session" && state !== "missed" && state !== "skipped"
      ? "Up next · Today"
      : "Today’s schedule";
  const homeActionLabel = upNextAmbiguous ? "Review calendar →" : displayingNextWorkout ? "View workout →" : state === "missed" || state === "skipped"
    ? "Review session →"
    : hasPrescribedSession || nextWorkout.id ? "View workout →" : "View calendar →";
  const showDateAndStatus = !homeAction || date !== localDateInTimezone(timezone)
    || amendments.length > 0 || !["upcoming", "rest"].includes(state);

  if (compact) return <section className={`today-coach-card today-coach-card--compact today-coach-card--${state}`} aria-labelledby="today-coaching-heading">
    <div className="today-coach-main">
      {homeAction ? <p className="eyebrow">{homeEyebrow}</p> : null}
      <ContextHeading id="today-coaching-heading">{heading}</ContextHeading>
      {showDateAndStatus && !displayingNextWorkout ? <p className="metadata"><time dateTime={date}>{formatCoachingDate(date, timezone)}</time> · {statusLabel}{amendments.length > 0 ? " · Amended" : ""}</p> : displayingNextWorkout && scheduleKind === "prescribed_rest" ? <p className="metadata">Today is a prescribed recovery day.</p> : null}
      {upNextAmbiguous ? <p>More than one workout could still be due today. Check the approved calendar.</p> : displayingNextWorkout && displaySession ? <>
        <p className="metadata"><time dateTime={sessionDate}>{formatCoachingDate(sessionDate, weekData?.timezone ?? timezone)}</time>{displaySession.startTime ? ` · ${displaySession.startTime}` : ""}</p>
        <p className="today-prescription">{String(displaySession.prescription ?? "Prescription unavailable; open Calendar.")}</p>
      </> : scheduleKind === "prescribed_session" || scheduleKind === "prescribed_rest" ? <>
        <p className="today-prescription">{String(session.prescription ?? "Prescription unavailable; open Calendar.")}</p>
        {!homeAction ? <p className="today-focus-purpose"><strong>Purpose:</strong> {String(session.purpose ?? "Purpose not supplied.")}{hasPrescribedSession && session.durationMinutes && !String(session.prescription ?? "").includes(String(session.durationMinutes)) ? ` · ${String(session.durationMinutes)} min` : ""}</p> : null}
      </> : <p>{scheduleDescription}</p>}
      {homeAction && weekState === "error" ? <p className="home-inline-status" role="status">The schedule and recorded runs could not be checked. <button className="text-link" type="button" onClick={() => setWeekRequestVersion((value) => value + 1)}>Retry calendar check</button></p> : null}
      {homeAction && requestState === "success" && errorMessage ? <p className="home-inline-status" role="status">The latest schedule could not be refreshed. <button className="text-link" type="button" onClick={() => setRequestVersion((value) => value + 1)}>Retry schedule</button></p> : null}
      {homeAction && weekState === "success" && weekData?.activitiesReadStatus === "unavailable" ? <p className="home-inline-status" role="status">Recorded runs could not be checked; today’s approved schedule is shown.</p> : null}
      {state === "stale" || state === "missed" || state === "skipped" ? <p className="home-inline-status" role="status">{String(payload.message ?? statusLabel)}</p> : null}
      {displayWarnings.map((warning) => <p className="home-inline-status" role="status" key={warning}>{warning}</p>)}
      {Array.isArray(displaySessionRecord.warnings) && !displayingNextWorkout ? displaySessionRecord.warnings.map((warning) => <p className="home-inline-status" role="status" key={String(warning)}>{String(warning)}</p>) : null}
      {displayCautions.length > 0 ? <p className="home-session-caveat"><strong>Cautions:</strong> {displayCautions.join("; ")}</p> : null}
      {!homeAction && nextWorkout.id && nextWorkout.scheduledDate && !hasPrescribedSession ? <p className="today-next-workout"><strong>Next workout:</strong> {String(nextWorkout.title)} · {formatCoachingDate(String(nextWorkout.scheduledDate), timezone)} · View in Calendar</p> : null}
    </div>
    <div className="today-meta">{upNextAmbiguous ? <Link id="view-today-calendar" ref={restoreCalendarLauncher} className="button button-primary" href={`/dashboard/calendar?date=${encodeURIComponent(today)}`} onClick={openCalendar}>{homeActionLabel}</Link> : displayingNextWorkout && selectedNext ? <Link id="view-today-session" ref={restoreCalendarLauncher} className="button button-primary" href={`/dashboard/calendar?date=${encodeURIComponent(selectedNext.effectiveDate)}&session=${encodeURIComponent(selectedNext.id)}`} onClick={openCalendar}>{homeActionLabel}</Link> : session.id && links.session && (!homeAction || hasPrescribedSession) ? <Link id="view-today-session" ref={restoreCalendarLauncher} className={homeAction ? "button button-primary" : "text-link"} href={String(links.session)} onClick={openCalendar}>{homeAction ? homeActionLabel : "View session →"}</Link> : selectedNext ? <Link id="view-today-session" ref={restoreCalendarLauncher} className={homeAction ? "button button-primary" : "text-link"} href={`/dashboard/calendar?date=${encodeURIComponent(selectedNext.effectiveDate)}&session=${encodeURIComponent(selectedNext.id)}`} onClick={openCalendar}>{homeAction ? homeActionLabel : "View calendar →"}</Link> : <Link id="view-today-calendar" ref={restoreCalendarLauncher} className={homeAction ? "button button-primary" : "text-link"} href={String(links.calendar ?? "/dashboard/calendar")} onClick={openCalendar}>{homeAction ? homeActionLabel : "View calendar →"}</Link>}</div>
  </section>;

  return <section className={`today-coach-card today-coach-card--${state}${compact ? " today-coach-card--compact" : ""}`} aria-labelledby="today-coaching-heading">
    <div className="today-coach-overview">
      <div className="today-coach-main">
        <p className="eyebrow">{compact ? `Today · ${formatCoachingDate(date, timezone)}${plan.version ? ` · Plan v${String(plan.version)}` : ""}` : `Approved coaching · ${formatCoachingDate(date, timezone)} · ${timezone}`}</p>
        <ContextHeading id="today-coaching-heading">{heading}</ContextHeading>
        {!compact || state === "skipped" || state === "missed" || state === "stale"
          ? <p>{String(payload.message ?? "Review the approved local plan before training.")}</p>
          : null}
        <p className="today-prescription"><strong>{scheduleKind === "prescribed_session" ? (amendments.length > 0 ? "Current prescription:" : "Approved prescription:") : scheduleKind === "prescribed_rest" && compact ? "Approved rest:" : "Schedule:"}</strong> {scheduleKind === "prescribed_session" && hasPrescribedSession
          ? String(session.prescription ?? scheduleDescription)
          : compact && scheduleKind === "prescribed_rest" ? String(session.prescription ?? "Rest is prescribed today.") : scheduleDescription}</p>
        {compact && scheduleKind === "prescribed_rest" ? <p className="today-focus-purpose"><strong>Recovery purpose:</strong> {String(session.purpose ?? payload.message ?? "Recovery")}</p> : null}
        {scheduleKind === "prescribed_session" && state === "missed" ? <p>Scheduled {formatCoachingDate(sessionDate, timezone)} and still marked upcoming.</p> : null}
        {hasPrescribedSession ? <p className={compact ? "today-focus-purpose" : undefined}><strong>Purpose and target:</strong> {String(session.purpose ?? "Follow the approved plan")} · {String(session.durationMinutes ?? "—")} min</p> : null}
        {amendments.length > 0 ? <details className="today-change-history"><summary>Why this session changed ({amendments.length})</summary><p><strong>Approved source:</strong> {String(originalSession.prescription ?? "The original approved prescription remains preserved in Calendar.")}</p>{latestAmendment ? <p><strong>Latest reason:</strong> {String(latestAmendment.reason)}</p> : null}<p>No AI review is claimed. Open the session to inspect its complete change history.</p></details> : null}
        {!compact ? <p className="today-local-cue"><strong>Training cue:</strong> {String(payload.localCue ?? "Follow the approved plan as written.")}</p> : null}
        {compact && scheduleKind === "unavailable" ? <p className="today-local-cue">The response may predate the effective schedule fields.</p> : null}
        {compact ? (nextWorkout.id && nextWorkout.scheduledDate ? <p className="today-next-workout"><strong>Next workout:</strong> {String(nextWorkout.title ?? "Approved session")} · {formatCoachingDate(String(nextWorkout.scheduledDate), timezone)}{nextWorkout.durationMinutes ? ` · ${String(nextWorkout.durationMinutes)} min` : ""} · <Link href={`/dashboard/calendar?date=${encodeURIComponent(String(nextWorkout.scheduledDate))}&session=${encodeURIComponent(String(nextWorkout.id))}`}>View in Calendar</Link></p> : scheduleKind === "unavailable" ? <p className="today-next-workout">Next workout details are unavailable in this response.</p> : null) : null}
        {!compact ? <GoalSummary goal={goal} /> : null}
        {!compact ? <PlanContext plan={plan} timezone={timezone} /> : null}
        {!compact && warnings.length > 0 ? <div className="today-warnings"><p className="eyebrow">Schedule warnings</p><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
      </div>
      <div className="today-meta">
        <span className={`status-chip${state === "stale" || state === "missed" ? " status-chip--warning" : state === "skipped" || scheduleKind === "unscheduled" || scheduleKind === "unavailable" ? " status-chip--muted" : " status-chip--current"}`}>{statusLabel}</span>
        {session.id && links.session ? <Link id="view-today-session" ref={restoreCalendarLauncher} className="button button-primary" href={String(links.session)} onClick={openCalendar}>View session</Link> : <Link id="view-today-calendar" ref={restoreCalendarLauncher} className="button button-secondary" href={String(links.calendar ?? "/dashboard/calendar")} onClick={openCalendar}>View calendar</Link>}
        {!compact ? <Link className="text-link" href={String(links.plan ?? "/dashboard/plan")}>Open active plan</Link> : null}
      </div>
    </div>
    {!compact ? <CurrentWeek
      date={date}
      timezone={timezone}
      state={weekState}
      sessions={weekData?.sessions ?? []}
      errorMessage={weekError}
      onRetry={() => setWeekRequestVersion((value) => value + 1)}
    /> : null}
  </section>;
}
