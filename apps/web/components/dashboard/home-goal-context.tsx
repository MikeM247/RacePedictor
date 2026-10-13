"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  goalContextApiResponseSchema,
  type GoalContextRouteData,
} from "../../../../packages/core/src/contracts/coaching.ts";
import { formatCoachingDate, localDateInTimezone } from "../../lib/coaching-ui-state";

type ReadState = "loading" | "ready" | "error";

const distanceLabel = (meters: number) => meters >= 1000
  ? `${(meters / 1000).toLocaleString("en-ZA", { maximumFractionDigits: 1 })} km`
  : `${meters.toLocaleString("en-ZA")} m`;

const timeLabel = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")} hr`;
  return `${minutes}${remainingSeconds ? `:${String(remainingSeconds).padStart(2, "0")}` : ""} min`;
};

function GoalTarget({ context }: { context: GoalContextRouteData }) {
  const goal = context.goal;
  if (!goal) return null;
  const target = goal.target;
  return <article className="home-goal-target">
    <p className="eyebrow">Your goal</p>
    <h2>{goal.title}</h2>
    {target.kind === "performance" ? <p className="home-target-line">{distanceLabel(target.distanceMeters)} · <time dateTime={target.targetDate}>{formatCoachingDate(target.targetDate, context.plan?.timezone ?? "Africa/Johannesburg")}</time>{target.targetTimeSeconds ? ` · Target ${timeLabel(target.targetTimeSeconds)}` : ""}{target.eventName && target.eventName.toLocaleLowerCase() !== goal.title.toLocaleLowerCase() ? ` · ${target.eventName}` : ""}</p> : <p className="home-target-line">{target.sessionsPerWeek} sessions and {target.minimumMinutesPerWeek} minutes per week</p>}
  </article>;
}

function Milestone({ context, now }: { context: GoalContextRouteData; now: Date }) {
  if (context.state !== "ready" || context.milestones === null) return null;
  if (context.milestones.length === 0) return <div className="home-milestone"><span className="eyebrow">Next milestone</span><p>No milestone scheduled</p></div>;

  const timezone = context.plan?.timezone ?? "Africa/Johannesburg";
  const today = localDateInTimezone(timezone, now);
  const next = [...context.milestones]
    .filter((milestone) => milestone.targetDate >= today)
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate) || left.id.localeCompare(right.id))[0];
  if (!next) return <div className="home-milestone"><span className="eyebrow">Next milestone</span><p>Nothing upcoming</p></div>;

  const raceName = next.eventName?.trim() || next.title;
  const explicitGoal = /\b(sub[- ]?\s*\d{1,3}|under\s+\d{1,3}\s*(?:minutes?|mins?)?)\b/iu.exec(next.title)?.[0];
  const target = explicitGoal ?? `Target ${timeLabel(next.targetTimeSeconds)}`;
  return <Link className="home-milestone" href="/dashboard/plan" aria-label={`Next milestone: ${raceName}, ${target}. View plan`}>
    <span className="eyebrow">Next milestone</span>
    <span className="home-milestone-name">{raceName}</span>
    <span className="home-milestone-target">{target}</span>
  </Link>;
}

function ReadyGoal({ context, now }: { context: GoalContextRouteData; now: Date }) {
  return <div className="home-goal-content home-goal-content--ready">
    <GoalTarget context={context} />
    <Milestone context={context} now={now} />
    <Link className="home-plan-link text-link" href="/dashboard/plan">View plan →</Link>
  </div>;
}

export function HomeGoalContext({ now, onTimezone }: { now: Date; onTimezone?: (timezone: string) => void }) {
  const [state, setState] = useState<ReadState>("loading");
  const [context, setContext] = useState<GoalContextRouteData | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setState("loading");
    void fetch("/api/v1/coaching/goal-context/active", { cache: "no-store" }).then(async (response) => {
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error("Approved goal context is temporarily unavailable.");
      return goalContextApiResponseSchema.parse(body).data.context;
    }).then((next) => {
      if (!current) return;
      setContext(next);
      setState("ready");
      if (next.plan?.timezone) onTimezone?.(next.plan.timezone);
    }).catch(() => {
      if (current) {
        setContext(null);
        setState("error");
      }
    });
    return () => { current = false; };
  }, [retry, onTimezone]);

  return <div className="home-goal-context">
    {state === "loading" ? <p className="home-goal-state" role="status" aria-busy="true">Loading your goal…</p> : null}
    {state === "error" ? <div className="home-goal-state" role="alert"><p>Your goal is temporarily unavailable.</p><button className="button button-secondary" onClick={() => setRetry((value) => value + 1)}>Retry</button><Link className="text-link" href="/dashboard/plan">View plan</Link></div> : null}
    {state === "ready" && context?.state === "ready" && context.goal ? <ReadyGoal context={context} now={now} /> : null}
    {state === "ready" && context?.state === "goal_only" && context.goal ? <div className="home-goal-content"><GoalTarget context={context} /><p className="quiet-copy">Your approved plan is not available right now.</p><Link className="text-link" href="/dashboard/plan">View plan →</Link></div> : null}
    {state === "ready" && context && context.state !== "ready" && context.state !== "goal_only" ? <div className="home-goal-state" role="status"><p>{context.state === "projection_pending" ? "Your approved goal is syncing." : context.state === "no_active_plan" ? "Set a race goal to get started." : "Your approved goal could not be verified."}</p><Link className="text-link" href="/dashboard/plan">View plan →</Link></div> : null}
  </div>;
}
