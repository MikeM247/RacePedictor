"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCoachingDate } from "../../lib/coaching-ui-state";
import { todayCoachingStates, type TodayCoachingState } from "../../lib/today-coaching";
import "./coaching-ui.css";

type JsonRecord = Record<string, unknown>;
type RequestState = "loading" | "success" | "error";

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

function GoalSummary({ goal, noPlan = false }: { goal: JsonRecord; noPlan?: boolean }) {
  if (!goal.id) return null;
  const countdown = asRecord(goal.countdown);
  return <section className="today-goal-summary" aria-label={noPlan ? "Settled goal" : "Active goal"}>
    <p className="eyebrow">{noPlan ? "Settled goal" : "Active goal"}</p>
    <strong>{String(goal.title ?? "Current goal")}</strong>
    {typeof countdown.label === "string" ? <span>{countdown.label}</span> : null}
  </section>;
}

export function TodayCoachingCard() {
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [payload, setPayload] = useState<JsonRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

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

  if (requestState === "loading") return <section className="today-coach-card today-coach-card--loading" role="status" aria-live="polite" aria-busy="true">
    <div className="today-coach-main"><p className="eyebrow">Digital coach</p><h3>Loading today&apos;s coaching context…</h3><p>Reading your approved plan.</p></div>
  </section>;

  if (requestState === "error" || !payload) return <section className="today-coach-card today-coach-card--error" role="alert">
    <div className="today-coach-main"><p className="eyebrow">Digital coach</p><h3>Today&apos;s coaching context is unavailable</h3><p>{errorMessage || "Refresh the approved coaching context and try again."}</p><p className="today-local-cue">No plan or session has been changed.</p></div>
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
    <div className="today-coach-main"><p className="eyebrow">Today · {date ? formatCoachingDate(date, timezone) : "Local date"} · {timezone}</p><h3 id="today-coaching-heading">No active coaching plan yet</h3><p>{String(payload.message ?? "Settle a goal, create a proposal with Codex, and explicitly approve it before relying on daily coaching.")}</p><p className="today-local-cue">{String(payload.localCue ?? "Today will never activate or change a plan automatically.")}</p><GoalSummary goal={goal} noPlan /></div>
    <div className="today-actions"><span className="status-chip">{stateLabels[state]}</span><Link className="button button-primary" href={String(links.plan ?? "/dashboard/plan")}>Start planning</Link></div>
  </section>;

  const sessionStatus = String(session.status ?? "");
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
    <div className="today-coach-main">
      <p className="eyebrow">Today · {formatCoachingDate(date, timezone)} · {timezone}</p>
      <h3 id="today-coaching-heading">{heading}</h3>
      <p>{String(payload.message ?? "Review the approved local plan before training.")}</p>
      <p className="today-prescription">{hasPrescribedSession
        ? <><strong>Approved prescription:</strong> {String(session.prescription ?? "Follow the approved prescription.")}</>
        : state === "missed"
          ? `Scheduled ${formatCoachingDate(sessionDate, timezone)} and still marked upcoming.`
          : state === "skipped"
            ? "No workout is prescribed after this explicit skip."
            : "No workout is prescribed today."}</p>
      {hasPrescribedSession ? <p><strong>Purpose and target:</strong> {String(session.purpose ?? "Follow the approved plan")} · {String(session.durationMinutes ?? "—")} min</p> : null}
      <p className="today-local-cue"><strong>Local cue:</strong> {String(payload.localCue ?? "Follow the approved plan as written.")}</p>
      <GoalSummary goal={goal} />
      {warnings.length > 0 ? <div className="today-warnings"><p className="eyebrow">Schedule warnings</p><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
    </div>
    <div className="today-meta">
      <span className="status-chip">{stateLabels[state]}</span>
      {plan.version ? <span>Plan v{String(plan.version)}</span> : null}
      {session.id && links.session ? <Link className="text-link" href={String(links.session)}>Open this session</Link> : <Link className="text-link" href={String(links.calendar ?? "/dashboard/calendar")}>Open calendar</Link>}
      <Link className="text-link" href={String(links.plan ?? "/dashboard/plan")}>Open active plan</Link>
    </div>
  </section>;
}
