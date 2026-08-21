"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  formatCoachingDate,
  normalizeCalendarSessions,
  weekRange,
  type CalendarSessionView,
} from "../../lib/coaching-ui-state";
import { todayCoachingStates, type TodayCoachingState } from "../../lib/today-coaching";
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

async function loadCurrentWeek(date: string): Promise<CalendarSessionView[]> {
  const range = weekRange(date);
  const params = new URLSearchParams(range);
  const response = await fetch(`/api/v1/coaching/calendar?${params}`, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = asRecord(asRecord(body).error);
    throw new Error(typeof error.message === "string" ? error.message : "The current week could not be loaded.");
  }
  return normalizeCalendarSessions(body).sort((left, right) => {
    const byDate = left.effectiveDate.localeCompare(right.effectiveDate);
    return byDate || (left.startTime ?? "").localeCompare(right.startTime ?? "") || left.title.localeCompare(right.title);
  });
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
        <div className="today-week-state today-week-state--error" role="status" aria-live="polite">
          <p><strong>Current week unavailable.</strong> {errorMessage}</p>
          <button className="button button-secondary" type="button" onClick={onRetry}>Retry current week</button>
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

export function TodayCoachingCard() {
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [payload, setPayload] = useState<JsonRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [weekState, setWeekState] = useState<WeekRequestState>("idle");
  const [weekSessions, setWeekSessions] = useState<CalendarSessionView[]>([]);
  const [weekError, setWeekError] = useState("");
  const [weekRequestVersion, setWeekRequestVersion] = useState(0);

  useEffect(() => {
    let current = true;
    setRequestState("loading");
    setErrorMessage("");
    void loadToday().then((response) => {
      if (!current) return;
      setPayload(response);
      setRequestState("success");
    }).catch((error) => {
      if (!current) return;
      setPayload(null);
      setErrorMessage(error instanceof Error ? error.message : "Today could not be loaded.");
      setRequestState("error");
    });
    return () => { current = false; };
  }, [requestVersion]);

  useEffect(() => {
    const plan = asRecord(payload?.plan);
    const date = String(payload?.date ?? "");
    if (requestState !== "success" || !plan.id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setWeekState("idle");
      setWeekSessions([]);
      setWeekError("");
      return;
    }
    let current = true;
    setWeekState("loading");
    setWeekError("");
    void loadCurrentWeek(date).then((sessions) => {
      if (!current) return;
      setWeekSessions(sessions);
      setWeekState("success");
    }).catch((error) => {
      if (!current) return;
      setWeekSessions([]);
      setWeekError(error instanceof Error ? error.message : "The current week could not be loaded.");
      setWeekState("error");
    });
    return () => { current = false; };
  }, [payload, requestState, weekRequestVersion]);

  if (requestState === "loading") return <section className="today-coach-card today-coach-card--loading" role="status" aria-live="polite" aria-busy="true">
    <div className="today-coach-main"><p className="eyebrow">Approved coaching</p><h2>Loading today&apos;s coaching context…</h2><p>Reading your explicitly approved plan.</p></div>
  </section>;

  if (requestState === "error" || !payload) return <section className="today-coach-card today-coach-card--error" role="alert">
    <div className="today-coach-main"><p className="eyebrow">Approved coaching</p><h2>Today&apos;s coaching context is unavailable</h2><p>{errorMessage || "Refresh the approved coaching context and try again."}</p><p className="today-local-cue">No plan or session has been changed.</p></div>
    <div className="today-actions"><button className="button button-primary" type="button" onClick={() => setRequestVersion((value) => value + 1)}>Retry Today</button><Link className="text-link" href="/dashboard/plan">Open Plan</Link></div>
  </section>;

  const state = asTodayState(payload.state ?? payload.status);
  const goal = asRecord(payload.goal);
  const plan = asRecord(payload.plan);
  const session = asRecord(payload.session);
  const links = asRecord(payload.links);
  const timezone = String(payload.timezone ?? "Africa/Johannesburg");
  const date = String(payload.date ?? "");
  const warnings = Array.isArray(payload.scheduleWarnings) ? payload.scheduleWarnings.map(String) : [];

  if (state === "no-plan") return <section className="today-coach-card today-coach-card--empty" aria-labelledby="today-coaching-heading">
    <div className="today-coach-main"><p className="eyebrow">Today · {date ? formatCoachingDate(date, timezone) : "Local date"} · {timezone}</p><h2 id="today-coaching-heading">No active coaching plan yet</h2><p>{String(payload.message ?? "Settle a goal, create a proposal with Codex, and explicitly approve it before relying on daily coaching.")}</p><p className="today-local-cue">{String(payload.localCue ?? "Today will never activate or change a plan automatically.")}</p><GoalSummary goal={goal} noPlan /></div>
    <div className="today-actions"><span className="status-chip">{stateLabels[state]}</span><Link className="button button-primary" href={String(links.plan ?? "/dashboard/plan")}>Start planning</Link></div>
  </section>;

  const sessionStatus = String(session.status ?? "");
  const originalSession = asRecord(session.original);
  const amendments = Array.isArray(session.amendments)
    ? session.amendments.map(asRecord).filter((amendment) => typeof amendment.reason === "string")
    : [];
  const latestAmendment = amendments[amendments.length - 1];
  const hasPrescribedSession = Boolean(session.id) && sessionStatus !== "skipped" && state !== "rest";
  const heading = state === "rest"
    ? "Intentional recovery day"
    : state === "missed"
      ? "Past session needs attention"
      : state === "skipped"
        ? "Scheduled session skipped"
        : String(session.title ?? "Today's approved session");
  const sessionDate = String(session.effectiveDate ?? session.scheduledDate ?? date);

  return <section className={`today-coach-card today-coach-card--${state}`} aria-labelledby="today-coaching-heading">
    <div className="today-coach-overview">
      <div className="today-coach-main">
        <p className="eyebrow">Approved coaching · {formatCoachingDate(date, timezone)} · {timezone}</p>
        <h2 id="today-coaching-heading">{heading}</h2>
        <p>{String(payload.message ?? "Review the approved local plan before training.")}</p>
        <p className="today-prescription">{hasPrescribedSession
          ? <><strong>{amendments.length > 0 ? "Current prescription:" : "Approved prescription:"}</strong> {String(session.prescription ?? "Follow the approved prescription.")}</>
          : state === "missed"
            ? `Scheduled ${formatCoachingDate(sessionDate, timezone)} and still marked upcoming.`
            : state === "skipped"
              ? "No workout is prescribed after this explicit skip."
              : "No workout is prescribed today."}</p>
        {hasPrescribedSession ? <p><strong>Purpose and target:</strong> {String(session.purpose ?? "Follow the approved plan")} · {String(session.durationMinutes ?? "—")} min</p> : null}
        {amendments.length > 0 ? <details className="today-change-history"><summary>Why this session changed ({amendments.length})</summary><p><strong>Approved source:</strong> {String(originalSession.prescription ?? "The original approved prescription remains preserved in Calendar.")}</p>{latestAmendment ? <p><strong>Latest reason:</strong> {String(latestAmendment.reason)}</p> : null}<p>No AI review is claimed. Open the session to inspect its complete change history.</p></details> : null}
        <p className="today-local-cue"><strong>Training cue:</strong> {String(payload.localCue ?? "Follow the approved plan as written.")}</p>
        <GoalSummary goal={goal} />
        <PlanContext plan={plan} timezone={timezone} />
        {warnings.length > 0 ? <div className="today-warnings"><p className="eyebrow">Schedule warnings</p><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
      </div>
      <div className="today-meta">
        <span className={`status-chip${state === "stale" || state === "missed" ? " status-chip--warning" : state === "skipped" ? " status-chip--muted" : " status-chip--current"}`}>{stateLabels[state]}</span>
        {session.id && links.session ? <Link className="button button-primary" href={String(links.session)}>Open this session</Link> : <Link className="button button-secondary" href={String(links.calendar ?? "/dashboard/calendar")}>Open calendar</Link>}
        <Link className="text-link" href={String(links.plan ?? "/dashboard/plan")}>Open active plan</Link>
      </div>
    </div>
    <CurrentWeek
      date={date}
      timezone={timezone}
      state={weekState}
      sessions={weekSessions}
      errorMessage={weekError}
      onRetry={() => setWeekRequestVersion((value) => value + 1)}
    />
  </section>;
}
