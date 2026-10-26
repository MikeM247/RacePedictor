"use client";

import Link from "next/link";
import { useMilestoneTimeline } from "../../lib/use-milestone-timeline.ts";
import { formatCoachingDate } from "../../lib/coaching-ui-state";
import { formatDistance, formatDuration } from "../../lib/activity-formatters";
import { MilestoneManager } from "./milestone-manager";
import "./road-to-comrades.css";
import "./milestone-management.css";

export function MilestoneSettings() {
  const { data, error, refresh, accept } = useMilestoneTimeline(true);
  const context = data?.context;
  const timezone = context?.plan?.timezone ?? "Africa/Johannesburg";
  return <section id="milestones" className="coach-panel settings-panel settings-panel--milestones" aria-labelledby="milestone-settings-heading">
    <div className="coach-panel-heading"><h2 id="milestone-settings-heading">Milestones</h2></div>
    {error ? <div role="status"><p>{error} {data ? "Showing your last saved milestone view. Reload before making changes." : "Your milestone view is unavailable."}</p><button className="button button-secondary" onClick={refresh}>Reload milestones</button></div> : null}
    {!data && !error ? <p role="status">Loading milestones…</p> : null}
    {context?.goal ? <aside className="milestone-primary-goal"><span className="eyebrow">Primary goal · approved plan</span><h3>{context.goal.title}</h3>{context.goal.target.kind === "performance" ? <p>{formatCoachingDate(context.goal.target.targetDate, timezone)} · {formatDistance(context.goal.target.distanceMeters)}{context.goal.target.targetTimeSeconds ? ` · Target ${formatDuration(context.goal.target.targetTimeSeconds)}` : ""}</p> : null}<Link className="text-link" href="/dashboard/plan">View plan →</Link></aside> : null}
    {data ? <MilestoneManager timeline={data} unavailable={Boolean(error)} onChange={refresh} onSaved={accept} /> : null}
  </section>;
}
