"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { goalContextApiResponseSchema, type GoalContextRouteData } from "../../../../packages/core/src/contracts/coaching.ts";
import { raceHistoryResponseSchema, type RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import { buildRaceJourney } from "../../../../packages/core/src/services/race-journey.ts";
import { formatCoachingDate, localDateInTimezone } from "../../lib/coaching-ui-state";
import { MilestoneManager } from "./milestone-manager";
import { formatDistance, formatDuration } from "../../lib/activity-formatters";
import "./road-to-comrades.css";
import "./milestone-management.css";

export function MilestoneSettings() {
  const [history, setHistory] = useState<RaceHistoryRecord[] | null>(null);
  const [context, setContext] = useState<GoalContextRouteData | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [goalError, setGoalError] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [goalRefresh, setGoalRefresh] = useState(0);

  useEffect(() => {
    const refresh = () => { setHistoryRefresh((value) => value + 1); setGoalRefresh((value) => value + 1); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryError(false);
    void fetch("/api/v1/coaching/race-history", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) { if (response.status === 401 || response.status === 403) setHistory(null); throw new Error("History unavailable"); }
        return raceHistoryResponseSchema.parse(await response.json()).data.items;
      }).then((items) => { if (!controller.signal.aborted) setHistory(items); })
      .catch(() => { if (!controller.signal.aborted) setHistoryError(true); });
    return () => controller.abort();
  }, [historyRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    setGoalError(false);
    void fetch("/api/v1/coaching/goal-context/active", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) { if (response.status === 401 || response.status === 403) setContext(null); throw new Error("Goal unavailable"); }
        return goalContextApiResponseSchema.parse(await response.json()).data.context;
      }).then((value) => { if (!controller.signal.aborted) setContext(value); })
      .catch(() => { if (!controller.signal.aborted) setGoalError(true); });
    return () => controller.abort();
  }, [goalRefresh]);

  const timezone = context?.plan?.timezone ?? "Africa/Johannesburg";
  const today = localDateInTimezone(timezone);
  const targets = goalError ? [] : buildRaceJourney(context, [], today).ahead;
  const unavailable = goalError || context?.state === "unavailable" || context?.state === "projection_pending";

  return <section id="milestones" className="coach-panel settings-panel settings-panel--milestones" aria-labelledby="milestone-settings-heading">
    <div className="coach-panel-heading"><h2 id="milestone-settings-heading">Milestones</h2></div>
    {historyError ? <div role="status"><p>Achievements could not be refreshed. {history ? "Showing the last loaded history." : "Retry to load your saved history."}</p><button className="button button-secondary" type="button" onClick={() => setHistoryRefresh((value) => value + 1)}>Retry achievements</button></div> : null}
    {!history && !historyError ? <p role="status">Loading achievements…</p> : null}
    {unavailable ? <div role="status"><p>Approved targets could not be verified. Historical achievements remain available.</p><button className="button button-secondary" type="button" onClick={() => setGoalRefresh((value) => value + 1)}>Retry targets</button></div> : !context ? <p role="status">Loading approved targets…</p> : null}
    {context?.goal ? <aside className="milestone-primary-goal"><span className="eyebrow">Primary goal · {unavailable ? "last loaded plan" : "approved plan"}</span><h3>{context.goal.title}</h3>{context.goal.target.kind === "performance" ? <p>{formatCoachingDate(context.goal.target.targetDate, timezone)} · {formatDistance(context.goal.target.distanceMeters)}{context.goal.target.targetTimeSeconds ? ` · Target ${formatDuration(context.goal.target.targetTimeSeconds)}` : ""}</p> : null}<Link className="text-link" href="/dashboard/plan">View plan →</Link></aside> : null}
    <MilestoneManager history={history ?? []} historyReady={history !== null} targets={targets} context={unavailable ? null : context} timezone={timezone} onChange={() => setHistoryRefresh((value) => value + 1)} />
  </section>;
}
