"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type {
  ActivitiesListResponse,
  ActivityDetail,
  ActivitySummary,
} from "../../../../packages/core/src/contracts";
import {
  formatActivityDate,
  formatDistance,
  formatDuration,
  formatNumber,
  formatPace,
  sportLabel,
} from "../../lib/activity-formatters";
import {
  readActivitiesListResponse,
  readActivityDetailResponse,
} from "../../lib/activities-api-client.ts";
import { DashboardNavigation } from "../dashboard/dashboard-navigation";
import "../dashboard/dashboard.css";
import "./activities.css";

type ActivitiesShellProps = {
  initialData: ActivitiesListResponse;
  initialError?: string;
  onlineMode?: boolean;
};

type Filters = {
  search: string;
  sport: string;
  from: string;
  to: string;
};

const initialFilters: Filters = { search: "", sport: "", from: "", to: "" };

function activityQuery(filters: Filters, cursor?: string) {
  const params = new URLSearchParams({ limit: "40" });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.sport) params.set("sport", filters.sport);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (cursor) params.set("cursor", cursor);
  return params;
}

export function ActivitiesShell({ initialData, initialError, onlineMode = false }: ActivitiesShellProps) {
  const [draftFilters, setDraftFilters] = useState<Filters>(initialFilters);
  const [activeFilters, setActiveFilters] = useState<Filters>(initialFilters);
  const [activities, setActivities] = useState<ActivitySummary[]>(initialData.items);
  const [nextCursor, setNextCursor] = useState(initialData.nextCursor);
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "loading-more" | "error">(
    initialError ? "error" : onlineMode ? "loading" : "idle",
  );
  const [listError, setListError] = useState(initialError);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [detailError, setDetailError] = useState<string>();

  useEffect(() => {
    if (onlineMode) void loadList(initialFilters);
    // The online route is the source of the initial page; filters trigger later reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMode]);

  async function loadList(filters: Filters, cursor?: string) {
    setListStatus(cursor ? "loading-more" : "loading");
    setListError(undefined);
    try {
      const response = await fetch(`/api/v1/activities?${activityQuery(filters, cursor)}`);
      const data = await readActivitiesListResponse(response);
      setActivities((current) => cursor ? [...current, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
      setListStatus("idle");
      if (!cursor) {
        setSelectedId(null);
        setSelectedActivity(null);
        setDetailStatus("idle");
      }
    } catch (error) {
      setListStatus("error");
      setListError(error instanceof Error ? error.message : "Activities could not be loaded.");
    }
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveFilters(draftFilters);
    void loadList(draftFilters);
  }

  function clearFilters() {
    setDraftFilters(initialFilters);
    setActiveFilters(initialFilters);
    void loadList(initialFilters);
  }

  async function selectActivity(activityId: string) {
    setSelectedId(activityId);
    setSelectedActivity(null);
    setDetailStatus("loading");
    setDetailError(undefined);
    try {
      const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}`);
      const data = await readActivityDetailResponse(response);
      setSelectedActivity(data.activity);
      setDetailStatus("idle");
    } catch (error) {
      setDetailStatus("error");
      setDetailError(error instanceof Error ? error.message : "The activity could not be loaded.");
    }
  }

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);

  return (
    <main className="dashboard-layout activities-layout">
      <DashboardNavigation activePage="activities" />

      <div className="dashboard-main">
        <header className="dashboard-toolbar activities-toolbar">
          <div>
            <h2>Activities</h2>
            <p>{onlineMode ? "Your cloud-synced running history" : "Your manually imported running history"}</p>
          </div>
          <div className="activity-count">
            <div aria-live="polite"><strong>{activities.length}</strong> <span>{nextCursor ? "activities shown" : "activities"}</span></div>
            <Link className="button button-primary" href="/dashboard/data-quality">Import activities</Link>
          </div>
        </header>

        <section className="activities-content" aria-label="Activities browser">
          <form className="activity-filters" onSubmit={submitFilters}>
            <label className="search-filter">
              <span>Search activities</span>
              <input
                type="search"
                value={draftFilters.search}
                onChange={(event) => setDraftFilters({ ...draftFilters, search: event.target.value })}
                placeholder="Morning run, trail…"
              />
            </label>
            <label>
              <span>Activity type</span>
              <select
                value={draftFilters.sport}
                onChange={(event) => setDraftFilters({ ...draftFilters, sport: event.target.value })}
              >
                <option value="">All types</option>
                <option value="run">Run</option>
                <option value="trail_run">Trail run</option>
                <option value="treadmill_run">Treadmill run</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              <span>From</span>
              <input
                type="date"
                value={draftFilters.from}
                onChange={(event) => setDraftFilters({ ...draftFilters, from: event.target.value })}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="date"
                value={draftFilters.to}
                onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })}
              />
            </label>
            <div className="filter-actions">
              <button className="button button-primary" type="submit" disabled={listStatus === "loading"}>
                {listStatus === "loading" ? "Applying…" : "Apply filters"}
              </button>
              <button className="button button-secondary" type="button" onClick={clearFilters} disabled={!hasActiveFilters}>
                Clear
              </button>
            </div>
          </form>

          {listStatus === "error" ? (
            <section className="activity-state activity-state-error" role="alert">
              <h3>Unable to load activities</h3>
              <p>{listError}</p>
              <button className="button button-secondary" type="button" onClick={() => void loadList(activeFilters)}>
                Try again
              </button>
            </section>
          ) : activities.length === 0 && listStatus !== "loading" ? (
            <section className="activity-state" role="status">
              <h3>{hasActiveFilters ? "No matching activities" : "No activities yet"}</h3>
              <p>{hasActiveFilters ? "Try widening the date range or clearing a filter." : onlineMode ? "Your activities will appear after Strava sends a completed workout." : "Your activities will appear after a manual CSV or GPX import."}</p>
              {hasActiveFilters ? (
                <button className="button button-secondary" type="button" onClick={clearFilters}>Clear filters</button>
              ) : null}
            </section>
          ) : (
            <div className="activity-browser">
              <section className="activity-list-panel" aria-labelledby="activity-list-heading">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Training history</p>
                    <h3 id="activity-list-heading">Recent activities</h3>
                  </div>
                  {listStatus === "loading" ? <span className="loading-label">Loading…</span> : null}
                </div>
                <ol className="activity-list">
                  {activities.map((activity) => (
                    <li key={activity.id}>
                      <button
                        type="button"
                        className={selectedId === activity.id ? "activity-row selected" : "activity-row"}
                        aria-pressed={selectedId === activity.id}
                        onClick={() => void selectActivity(activity.id)}
                      >
                        <span className="activity-row-main">
                          <span className="activity-title">{activity.title || sportLabel(activity.sport)}</span>
                          <span className="activity-date">{formatActivityDate(activity.localOccurredAt, activity.occurredAt)}</span>
                        </span>
                        <span className="activity-row-metrics">
                          <strong>{formatDistance(activity.distanceM)}</strong>
                          <span>{formatDuration(activity.elapsedTimeS)}</span>
                          <span>{formatPace(activity.avgPaceSecPerKm)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                {nextCursor ? (
                  <button
                    className="button button-load-more"
                    type="button"
                    disabled={listStatus === "loading-more"}
                    onClick={() => void loadList(activeFilters, nextCursor)}
                  >
                    {listStatus === "loading-more" ? "Loading more…" : "Load more activities"}
                  </button>
                ) : (
                  <p className="list-end">You’ve reached the start of your imported history.</p>
                )}
              </section>

              <ActivityDetailPanel activity={selectedActivity} status={detailStatus} error={detailError} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ActivityDetailPanel({
  activity,
  status,
  error,
}: {
  activity: ActivityDetail | null;
  status: "idle" | "loading" | "error";
  error?: string;
}) {
  if (status === "loading") {
    return <aside className="activity-detail activity-detail-state" aria-live="polite">Loading activity details…</aside>;
  }
  if (status === "error") {
    return (
      <aside className="activity-detail activity-detail-state activity-detail-error" role="alert">
        <h3>Unable to load this activity</h3>
        <p>{error}</p>
      </aside>
    );
  }
  if (!activity) {
    return (
      <aside className="activity-detail activity-detail-state">
        <span className="detail-icon" aria-hidden="true">↗</span>
        <h3>Select an activity</h3>
        <p>Choose a run to inspect its performance, effort, and available imported metrics.</p>
      </aside>
    );
  }

  const metrics = [
    ["Distance", formatDistance(activity.distanceM)],
    ["Elapsed time", formatDuration(activity.elapsedTimeS)],
    ["Average pace", formatPace(activity.avgPaceSecPerKm)],
    ["Elevation gain", formatNumber(activity.elevationGainM, " m")],
    ["Average heart rate", formatNumber(activity.avgHrBpm, " bpm")],
    ["Maximum heart rate", formatNumber(activity.maxHrBpm, " bpm")],
    ["Average cadence", formatNumber(activity.avgCadenceSpm, " spm")],
    ["Aerobic training effect", formatNumber(activity.aerobicTrainingEffect, "", 1)],
    ["Calories", formatNumber(activity.calories, " kcal")],
    ["Average power", formatNumber(activity.avgPowerW, " W")],
    ["Stride length", formatNumber(activity.avgStrideLengthM, " m", 2)],
    ["Ground contact time", formatNumber(activity.avgGroundContactTimeMs, " ms")],
    ["Steps", formatNumber(activity.steps)],
    ["Body Battery drain", formatNumber(activity.bodyBatteryDrain)],
  ];

  return (
    <aside className="activity-detail" aria-labelledby="activity-detail-heading">
      <div className="detail-header">
        <p className="eyebrow">{sportLabel(activity.sport)}</p>
        <h3 id="activity-detail-heading">{activity.title || sportLabel(activity.sport)}</h3>
        <p>{formatActivityDate(activity.localOccurredAt, activity.occurredAt)}</p>
      </div>
      <dl className="detail-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section className="detail-subsection">
        <h4>Splits</h4>
        {activity.splits.length > 0 ? (
          <ol>
            {activity.splits.map((split) => (
              <li key={split.id}>Kilometre {split.splitIndex + 1}: {formatPace(split.paceSecPerKm)}</li>
            ))}
          </ol>
        ) : <p>No split data was included in this imported activity.</p>}
      </section>
      <section className="detail-subsection">
        <h4>Route</h4>
        <p>{activity.routeSignature ? "Route data is available for this activity." : "No route data was included in this imported activity."}</p>
      </section>
    </aside>
  );
}
