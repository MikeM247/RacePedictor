"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { goalContextApiResponseSchema, type GoalContextRouteData } from "../../../../packages/core/src/contracts/coaching.ts";
import { raceHistoryResponseSchema, type RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import { buildRaceJourney } from "../../../../packages/core/src/services/race-journey.ts";
import { formatCoachingDate, localDateInTimezone } from "../../lib/coaching-ui-state";
import { RaceAchievementManager } from "./race-achievement-manager";
import "./road-to-comrades.css";

export function MilestoneSettings() {
  const [history, setHistory] = useState<RaceHistoryRecord[] | null>(null);
  const [context, setContext] = useState<GoalContextRouteData | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [goalError, setGoalError] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [goalRefresh, setGoalRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryError(false);
    void fetch("/api/v1/coaching/race-history", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("History unavailable");
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
        if (!response.ok) throw new Error("Goal unavailable");
        return goalContextApiResponseSchema.parse(await response.json()).data.context;
      }).then((value) => { if (!controller.signal.aborted) setContext(value); })
      .catch(() => { if (!controller.signal.aborted) setGoalError(true); });
    return () => controller.abort();
  }, [goalRefresh]);

  const timezone = context?.plan?.timezone ?? "Africa/Johannesburg";
  const today = localDateInTimezone(timezone);
  const targets = buildRaceJourney(context, [], today).ahead;
  const upcoming = buildRaceJourney(context, history ?? [], today).ahead;
  const unavailable = goalError || context?.state === "unavailable" || context?.state === "projection_pending";

  return <section className="coach-panel settings-panel settings-panel--milestones" aria-labelledby="milestone-settings-heading">
    <div className="coach-panel-heading"><h2 id="milestone-settings-heading">Milestones</h2></div>
    <p>Manage the achievements shown on your Home timeline and review your upcoming race targets.</p>
    <h3>Achievements</h3>
    {historyError ? <div role="status"><p>Achievements could not be refreshed. {history ? "Showing the last loaded history." : "Retry to load your saved history."}</p><button className="button button-secondary" type="button" onClick={() => setHistoryRefresh((value) => value + 1)}>Retry achievements</button></div> : null}
    {history ? <><p>{history.length === 0 ? "No confirmed achievements yet." : `${history.length} saved achievement${history.length === 1 ? "" : "s"}.`}</p><RaceAchievementManager history={history} targets={targets} timezone={timezone} onChange={() => setHistoryRefresh((value) => value + 1)} /></> : !historyError ? <p role="status">Loading achievements…</p> : null}
    <h3>Upcoming targets</h3>
    {unavailable ? <div role="status"><p>Upcoming targets are temporarily unavailable.</p><button className="button button-secondary" type="button" onClick={() => setGoalRefresh((value) => value + 1)}>Retry targets</button></div> : !context ? <p role="status">Loading upcoming targets…</p> : upcoming.length ? <ul>{upcoming.map((target) => <li key={target.id}><strong>{target.eventName || target.title}</strong> · <time dateTime={target.date}>{formatCoachingDate(target.date, timezone)}</time></li>)}</ul> : <p>No upcoming targets are available in your approved plan.</p>}
    <p>Upcoming targets follow your approved plan.</p>
    <Link className="text-link" href="/dashboard/plan">View plan →</Link>
  </section>;
}
