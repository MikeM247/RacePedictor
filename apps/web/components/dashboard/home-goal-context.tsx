"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  goalContextApiResponseSchema,
  type GoalContextRouteData,
} from "../../../../packages/core/src/contracts/coaching.ts";
import { formatCoachingDate } from "../../lib/coaching-ui-state";

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
    <p className="eyebrow">Main approved goal</p>
    <h3>{goal.title}</h3>
    {target.kind === "performance" ? <dl className="home-goal-facts home-goal-facts--performance">
      <div><dt>Distance</dt><dd>{distanceLabel(target.distanceMeters)}</dd></div>
      <div><dt>Race date</dt><dd><time dateTime={target.targetDate}>{target.targetDate}</time></dd></div>
      <div><dt>Target time</dt><dd>{target.targetTimeSeconds ? timeLabel(target.targetTimeSeconds) : "No target time approved"}</dd></div>
      {target.eventName ? <div><dt>Event</dt><dd>{target.eventName}</dd></div> : null}
    </dl> : <dl className="home-goal-facts home-goal-facts--consistency">
      <div><dt>Consistency target</dt><dd>{target.sessionsPerWeek} sessions and {target.minimumMinutesPerWeek} minutes per week</dd></div>
      <div><dt>Target period</dt><dd><time dateTime={target.startsOn}>{target.startsOn}</time> – <time dateTime={target.endsOn}>{target.endsOn}</time></dd></div>
    </dl>}
  </article>;
}

function Milestones({ context }: { context: GoalContextRouteData }) {
  if (context.state !== "ready" || context.milestones === null) return null;
  if (context.milestones.length === 0) return <p className="home-goal-state">No intermediate race milestone is included in this approved plan.</p>;
  const timezone = context.plan?.timezone ?? "UTC";
  const today = localDateInTimezone(timezone);
  const nextMilestone = [...context.milestones]
    .filter((milestone) => milestone.targetDate >= today)
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate))[0];
  return <div className="home-goal-milestones" role="group" aria-label="Next approved race milestone">
    {nextMilestone ? <article className="home-milestone">
      <h4>Next milestone: {nextMilestone.title}{nextMilestone.eventName ? ` · ${nextMilestone.eventName}` : ""}</h4>
      <dl className="home-milestone-facts">
        <div><dt>Distance</dt><dd>{distanceLabel(nextMilestone.distanceMeters)}</dd></div>
        <div><dt>Target time</dt><dd>{timeLabel(nextMilestone.targetTimeSeconds)}</dd></div>
        <div><dt>Target date</dt><dd><time dateTime={nextMilestone.targetDate}>{formatCoachingDate(nextMilestone.targetDate, timezone)}</time></dd></div>
      </dl>
    </article> : <p className="home-goal-state">No future milestone is scheduled. Earlier milestone completion is unconfirmed.</p>}
  </div>;
}

function GoalContextContent({ context, readinessAction }: { context: GoalContextRouteData; readinessAction: ReactNode }) {
  switch (context.state) {
    case "ready":
      return <div className="home-goal-content home-goal-content--ready">
        <GoalTarget context={context} />
        <Milestones context={context} />
        {context.goal?.target.kind === "performance"
          ? <p className="home-progress-caveat">Race-day progress cannot yet be assessed. Current fitness is not a race-day result.</p>
          : <p className="home-progress-caveat">This approved consistency target does not establish a race-day result. No on-track verdict is available.</p>}
        <div className="home-goal-actions"><p className="home-goal-provenance">Plan v{context.plan?.version} · <Link className="text-link" href="/dashboard/plan">Open Plan</Link></p><div className="home-evidence-control">{readinessAction}</div></div>
      </div>;
    case "goal_only":
      return <>
        <GoalTarget context={context} />
        <p className="home-progress-caveat">A settled goal is available, but there is no active approved plan with milestones.</p>
        <div className="home-goal-actions"><Link className="text-link" href="/dashboard/plan">Open Plan</Link><div className="home-evidence-control">{readinessAction}</div></div>
      </>;
    case "no_active_plan":
      return <><div className="home-goal-state"><p>No active approved plan is available. In online mode, a goal-only status cannot be confirmed without an approved plan projection.</p><Link className="text-link" href="/dashboard/plan">Open Plan</Link></div><div className="home-evidence-control">{readinessAction}</div></>;
    case "projection_pending":
      return <><div className="home-goal-state" role="status"><p>Approved goal details are waiting for paired-device publication. The plan is available; target and milestone values will appear when its verified context arrives.</p><p>Plan v{context.plan?.version} · <Link className="text-link" href="/dashboard/plan">Open approved plan</Link></p></div><div className="home-evidence-control">{readinessAction}</div></>;
    case "unavailable":
      return <><div className="home-goal-state" role="status"><p>The approved goal context could not be verified. No goal or milestone values are being inferred.</p><Link className="text-link" href="/dashboard/plan">Review Plan</Link></div><div className="home-evidence-control">{readinessAction}</div></>;
  }
}

export function HomeGoalContext({ readinessAction }: { readinessAction: ReactNode }) {
  const [state, setState] = useState<ReadState>("loading");
  const [context, setContext] = useState<GoalContextRouteData | null>(null);

  useEffect(() => {
    let current = true;
    void fetch("/api/v1/coaching/goal-context/active", { cache: "no-store" }).then(async (response) => {
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error("Approved goal context is temporarily unavailable.");
      const parsed = goalContextApiResponseSchema.parse(body);
      if (current) {
        setContext(parsed.data.context);
        setState("ready");
      }
    }).catch(() => {
      if (current) {
        setContext(null);
        setState("error");
      }
    });
    return () => { current = false; };
  }, []);

  return <div className="home-goal-context">
    {state === "loading" ? <p role="status" aria-busy="true">Loading approved goal and milestones…</p> : null}
    {state === "error" ? <><div className="home-goal-state" role="alert"><p>Goal context could not be loaded. Today's coaching and activity are available separately.</p><Link className="text-link" href="/dashboard/plan">Open Plan</Link></div><div className="home-evidence-control">{readinessAction}</div></> : null}
    {state === "ready" && context ? <GoalContextContent context={context} readinessAction={readinessAction} /> : null}
  </div>;
}
