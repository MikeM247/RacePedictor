"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  goalContextApiResponseSchema,
  activePlanApiResponseSchema,
  type GoalContextRouteData,
  type TrainingPlan,
} from "../../../../packages/core/src/contracts/coaching.ts";
import { formatCoachingDate } from "../../lib/coaching-ui-state";
import { approvedPlanSupport, shortCompleteNarrative } from "../../lib/home-summary";
import { relativeCalendarLabel } from "../../lib/calendar-display";

type ReadState = "loading" | "ready" | "error";

const distanceLabel = (meters: number) => meters >= 1000
  ? `${(meters / 1000).toLocaleString("en-ZA", { maximumFractionDigits: 1 })} km`
  : `${meters.toLocaleString("en-ZA")} m`;

const timeLabel = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, "0")).join(":");
};

function localDateInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function GoalTarget({ context }: { context: GoalContextRouteData }) {
  const goal = context.goal;
  if (!goal) return null;
  const target = goal.target;
  return <article className="home-goal-target">
    <h3>{goal.title}</h3>
    {target.kind === "performance" ? <p className="home-target-line">{distanceLabel(target.distanceMeters)} · <time dateTime={target.targetDate}>{formatCoachingDate(target.targetDate, context.plan?.timezone ?? "Africa/Johannesburg")}</time> · {target.targetTimeSeconds ? `Target ${timeLabel(target.targetTimeSeconds)}` : "No target time approved"}{target.eventName && target.eventName.toLocaleLowerCase() !== goal.title.toLocaleLowerCase() ? ` · ${target.eventName}` : ""}</p> : <dl className="home-goal-facts home-goal-facts--consistency">
      <div><dt>Consistency target</dt><dd>{target.sessionsPerWeek} sessions and {target.minimumMinutesPerWeek} minutes per week</dd></div>
      <div><dt>Target period</dt><dd><time dateTime={target.startsOn}>{target.startsOn}</time> – <time dateTime={target.endsOn}>{target.endsOn}</time></dd></div>
    </dl>}
  </article>;
}

function Milestones({ context }: { context: GoalContextRouteData }) {
  if (context.state !== "ready" || context.milestones === null) return null;
  if (context.milestones.length === 0) return <div className="home-milestone"><p className="eyebrow">Next milestone</p><p>No milestone approved yet.</p></div>;
  const timezone = context.plan?.timezone ?? "UTC";
  const today = localDateInTimezone(timezone);
  const nextMilestone = [...context.milestones]
    .filter((milestone) => milestone.targetDate >= today)
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate))[0];
  return <div className="home-goal-milestones" role="group" aria-label="Next approved race milestone">
    {nextMilestone ? <article className="home-milestone">
      <p className="eyebrow">Next milestone · {relativeCalendarLabel(nextMilestone.targetDate, today)}</p>
      <h4><Link href="/dashboard/plan" aria-label={`View milestone in Plan: ${nextMilestone.title}`}>{nextMilestone.title}{nextMilestone.eventName && nextMilestone.eventName !== nextMilestone.title ? ` · ${nextMilestone.eventName}` : ""} →</Link></h4>
      <p className="home-target-line">{distanceLabel(nextMilestone.distanceMeters)} · Target {timeLabel(nextMilestone.targetTimeSeconds)} · <time dateTime={nextMilestone.targetDate}>{formatCoachingDate(nextMilestone.targetDate, timezone)}</time></p>
      <p className="quiet-copy">Purpose and outcome unavailable.</p>
    </article> : <p className="home-goal-state">No future milestone is scheduled. Earlier milestone completion is unconfirmed.</p>}
  </div>;
}

function GoalNarrative({ label, text }: { label: string; text: string | null }) {
  const short = shortCompleteNarrative(text);
  if (short) return <p className="home-goal-narrative"><strong>{label}:</strong> {short}</p>;
  if (text) return <details className="home-narrative-detail"><summary>{label}</summary><p>{text}</p></details>;
  return <p className="quiet-copy">{label}: explanation unavailable.</p>;
}

function GoalContextContent({ context, readinessAction, support }: { context: GoalContextRouteData; readinessAction: ReactNode; support: string | null }) {
  switch (context.state) {
    case "ready":
      return <div className="home-goal-content home-goal-content--ready">
        <div className="home-goal-main"><GoalTarget context={context} />
        <GoalNarrative label="Why" text={context.goal?.why ?? null} />
        <GoalNarrative label="Plan" text={support} />
        <dl className="home-progress-summaries">
          <div><dt>Plan adherence</dt><dd>Unassessed; links unconfirmed.</dd></div>
          <div><dt>Performance</dt><dd>{context.goal?.target.kind === "performance" ? "No race-day assessment." : "No compatible assessment."}</dd></div>
        </dl></div>
        <Milestones context={context} />
        <div className="home-goal-actions"><Link className="text-link" href="/dashboard/plan">Plan details</Link><div className="home-evidence-control">{readinessAction}</div></div>
      </div>;
    case "goal_only":
      return <>
        <GoalTarget context={context} />
        <GoalNarrative label="Why it matters" text={context.goal?.why ?? null} />
        <p className="home-progress-caveat">No active plan. Adherence and performance are not assessed.</p>
        <div className="home-goal-actions"><Link className="text-link" href="/dashboard/plan">Open Plan</Link><div className="home-evidence-control">{readinessAction}</div></div>
      </>;
    case "no_active_plan":
      return <><div className="home-goal-state"><p>No active approved plan is available.</p><Link className="text-link" href="/dashboard/plan">Open Plan</Link></div><div className="home-evidence-control">{readinessAction}</div></>;
    case "projection_pending":
      return <><div className="home-goal-state" role="status"><p>Goal details are not available yet. Your approved plan remains available.</p><Link className="text-link" href="/dashboard/plan">Open approved plan</Link></div><div className="home-evidence-control">{readinessAction}</div></>;
    case "unavailable":
      return <><div className="home-goal-state" role="status"><p>The approved goal context could not be verified. No goal or milestone values are being inferred.</p><Link className="text-link" href="/dashboard/plan">Review Plan</Link></div><div className="home-evidence-control">{readinessAction}</div></>;
  }
}

export function HomeGoalContext({ readinessAction, onTimezone }: { readinessAction: ReactNode; onTimezone?: (timezone: string) => void }) {
  const [state, setState] = useState<ReadState>("loading");
  const [context, setContext] = useState<GoalContextRouteData | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [retry, setRetry] = useState(0);
  const [, setDateTick] = useState(0);

  useEffect(() => {
    const refresh = () => setDateTick((value) => value + 1);
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    let current = true;
    setState("loading");
    void fetch("/api/v1/coaching/goal-context/active", { cache: "no-store" }).then(async (response) => {
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error("Approved goal context is temporarily unavailable.");
      const parsed = goalContextApiResponseSchema.parse(body);
      if (current) {
        setContext(parsed.data.context);
        setState("ready");
        if (parsed.data.context.plan?.timezone) onTimezone?.(parsed.data.context.plan.timezone);
      }
    }).catch(() => {
      if (current) {
        setContext(null);
        setState("error");
      }
    });
    void fetch("/api/v1/coaching/plans/active", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return null;
      const parsed = activePlanApiResponseSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.data : null;
    }).then((value) => { if (current) setPlan(value); }).catch(() => { if (current) setPlan(null); });
    return () => { current = false; };
  }, [retry, onTimezone]);

  return <div className="home-goal-context">
    {state === "loading" ? <p role="status" aria-busy="true">Loading approved goal and milestones…</p> : null}
    {state === "error" ? <><div className="home-goal-state" role="alert"><p>Goal context could not be loaded.</p><button className="button button-secondary" onClick={() => setRetry((value) => value + 1)}>Retry goal</button><Link className="text-link" href="/dashboard/plan">Open Plan</Link></div><div className="home-evidence-control">{readinessAction}</div></> : null}
    {state === "ready" && context ? <GoalContextContent context={context} support={approvedPlanSupport(context, plan)} readinessAction={readinessAction} /> : null}
  </div>;
}
