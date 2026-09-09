"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
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
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);

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
        detailRequest.current?.abort();
        setSelectedId(null);
        setSelectedActivity(null);
        setDetailStatus("idle");
        setDetailError(undefined);
        setIsMobileDetailOpen(false);
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
    detailRequest.current?.abort();
    const request = new AbortController();
    detailRequest.current = request;
    setSelectedId(activityId);
    setSelectedActivity(null);
    setDetailStatus("loading");
    setDetailError(undefined);
    setIsMobileDetailOpen(true);
    try {
      const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}`, { signal: request.signal });
      const data = await readActivityDetailResponse(response);
      if (detailRequest.current !== request) return;
      setSelectedActivity(data.activity);
      setDetailStatus("idle");
    } catch (error) {
      if (request.signal.aborted || detailRequest.current !== request) return;
      setDetailStatus("error");
      setDetailError(error instanceof Error ? error.message : "The activity could not be loaded.");
    }
  }

  function closeDetail() {
    detailRequest.current?.abort();
    setDetailStatus("idle");
    setDetailError(undefined);
    setIsMobileDetailOpen(false);
    requestAnimationFrame(() => selectedRowRef.current?.focus());
  }

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);

  return (
    <div className="dashboard-layout activities-layout">
      <DashboardNavigation activePage="activities" />

      <main className="dashboard-main" aria-labelledby="activities-page-title">
        <header className="dashboard-toolbar activities-toolbar">
          <div>
            <p className="eyebrow">Training workspace</p>
            <h1 id="activities-page-title">Activities</h1>
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

          {listStatus === "error" && activities.length === 0 ? (
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
            <div className={isMobileDetailOpen ? "activity-browser activity-browser-detail-open" : "activity-browser"}>
              <section className="activity-list-panel" aria-labelledby="activity-list-heading">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Training history</p>
                    <h3 id="activity-list-heading">Recent activities</h3>
                  </div>
                  {listStatus === "loading" ? <span className="loading-label">Loading…</span> : null}
                </div>
                {listStatus === "error" ? (
                  <section className="activity-list-error" role="alert">
                    <p>Could not refresh the activity list. Your loaded history is still available.</p>
                    <button className="button button-secondary" type="button" onClick={() => void loadList(activeFilters)}>Try again</button>
                  </section>
                ) : null}
                {listStatus === "loading" && activities.length === 0 ? (
                  <div className="activity-list-skeleton" aria-live="polite" aria-label="Loading activities">
                    <span /><span /><span /><span />
                  </div>
                ) : (
                  <ol className="activity-list">
                    {activities.map((activity) => (
                      <li key={activity.id}>
                        <button
                          type="button"
                          className={selectedId === activity.id ? "activity-row selected" : "activity-row"}
                          aria-current={selectedId === activity.id ? "true" : undefined}
                          aria-label={`${activity.title || sportLabel(activity.sport)}, ${formatActivityDate(activity.localOccurredAt, activity.occurredAt)}, ${formatDistance(activity.distanceM)}, ${formatDuration(activity.elapsedTimeS)}, ${formatPace(activity.avgPaceSecPerKm)}${selectedId === activity.id ? ", selected" : ""}`}
                          ref={selectedId === activity.id ? (node) => { if (node) selectedRowRef.current = node; } : undefined}
                          onClick={() => void selectActivity(activity.id)}
                        >
                          <span className="activity-row-main">
                            <span className="activity-title">{activity.title || sportLabel(activity.sport)}</span>
                            <span className="activity-date">{formatActivityDate(activity.localOccurredAt, activity.occurredAt)}</span>
                          </span>
                          <span className="activity-row-metrics" aria-hidden="true">
                            <strong>{formatDistance(activity.distanceM)}</strong>
                            <span>{formatDuration(activity.elapsedTimeS)}</span>
                            <span>{formatPace(activity.avgPaceSecPerKm)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                {nextCursor && activities.length > 0 ? (
                  <button
                    className="button button-load-more"
                    type="button"
                    disabled={listStatus === "loading-more"}
                    onClick={() => void loadList(activeFilters, nextCursor)}
                  >
                    {listStatus === "loading-more" ? "Loading more…" : "Load more activities"}
                  </button>
                ) : activities.length > 0 ? (
                  <p className="list-end">You’ve reached the start of your imported history.</p>
                ) : null}
              </section>

              <ActivityDetailPanel
                activity={selectedActivity}
                status={detailStatus}
                error={detailError}
                onClose={closeDetail}
                onRetry={selectedId ? () => void selectActivity(selectedId) : undefined}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ActivityDetailPanel({
  activity,
  status,
  error,
  onClose,
  onRetry,
}: {
  activity: ActivityDetail | null;
  status: "idle" | "loading" | "error";
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
}) {
  if (status === "loading") {
    return <aside className="activity-detail activity-detail-state" aria-live="polite"><DetailBackButton onClose={onClose} />Loading activity details…</aside>;
  }
  if (status === "error") {
    return (
      <aside className="activity-detail activity-detail-state activity-detail-error" role="alert">
        <DetailBackButton onClose={onClose} />
        <h3>Unable to load this activity</h3>
        <p>{error}</p>
        {onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button> : null}
      </aside>
    );
  }
  if (!activity) {
    return (
      <aside className="activity-detail activity-detail-state">
        <DetailBackButton onClose={onClose} />
        <span className="detail-icon" aria-hidden="true">↗</span>
        <h3>Select an activity</h3>
        <p>Choose a run to inspect its performance, effort, and available imported metrics.</p>
      </aside>
    );
  }

  return <aside className="activity-detail" aria-labelledby="activity-detail-heading"><ActivityRecordContent activity={activity} onClose={onClose} /></aside>;
}

export function ActivityRecordContent({
  activity,
  onClose,
  headingId = "activity-detail-heading",
}: {
  activity: ActivityDetail;
  onClose?: () => void;
  headingId?: string;
}) {
  const coreReadoutHeadingId = `${headingId}-core-readout`;
  const metrics = [
    ["Distance", formatDistance(activity.distanceM)],
    ["Elapsed time", formatDuration(activity.elapsedTimeS)],
    ["Average pace", formatPace(activity.avgPaceSecPerKm)],
    ["Elevation gain", formatNumber(activity.elevationGainM, " m")],
  ];
  const optionalMetrics = [
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
  ].filter(([, value]) => value !== "—");

  return (
    <>
      <div className="detail-header">
        {onClose ? <DetailBackButton onClose={onClose} /> : null}
        <div className="detail-header-meta">
          <p className="eyebrow">{sportLabel(activity.sport)}</p>
          <span className="detail-record-label">Activity record</span>
        </div>
        <h3 id={headingId}>{activity.title || sportLabel(activity.sport)}</h3>
        <p>{formatActivityDate(activity.localOccurredAt, activity.occurredAt)}</p>
      </div>
      <section className="detail-core-readout" aria-labelledby={coreReadoutHeadingId}>
        <div className="detail-section-heading">
          <div>
            <p className="eyebrow">Mission readout</p>
            <h4 id={coreReadoutHeadingId}>Run at a glance</h4>
          </div>
        </div>
        <dl className="detail-metrics detail-primary-metrics">
          {metrics.map(([label, value], index) => (
            <div key={label} className="detail-metric">
              <dt><span className="detail-metric-index" aria-hidden="true">0{index + 1}</span>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="detail-subsection detail-optional-metrics">
        <div className="detail-section-heading">
          <div>
            <p className="eyebrow">Sensor array</p>
            <h4>Additional telemetry</h4>
          </div>
          {optionalMetrics.length > 0 ? <span className="detail-section-count">{optionalMetrics.length} signals</span> : null}
        </div>
        {optionalMetrics.length > 0 ? (
          <dl className="detail-metrics detail-telemetry-metrics">
            {optionalMetrics.map(([label, value], index) => (
              <div key={label} className="detail-metric">
                <dt><span className="detail-metric-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : <p>No additional telemetry was included in this activity.</p>}
      </section>
      <section className="detail-subsection detail-splits">
        <div className="detail-section-heading">
          <div>
            <p className="eyebrow">Segment log</p>
            <h4>Splits</h4>
          </div>
          {activity.splits.length > 0 ? <span className="detail-section-count">{activity.splits.length} km</span> : null}
        </div>
        {activity.splits.length > 0 ? (
          <ol className="split-grid" aria-label="Per kilometre splits">
            {activity.splits.map((split) => (
              <li key={split.id}>
                <span>KM {String(split.splitIndex + 1).padStart(2, "0")}</span>
                <strong>{formatPace(split.paceSecPerKm)}</strong>
              </li>
            ))}
          </ol>
        ) : <p>No split data was included in this imported activity.</p>}
      </section>
      <section className={activity.routeSignature ? "detail-subsection detail-route detail-route-available" : "detail-subsection detail-route"}>
        <div className="detail-section-heading">
          <div>
            <p className="eyebrow">Route signal</p>
            <h4>Route</h4>
          </div>
          <span className="route-status"><span aria-hidden="true" />{activity.routeSignature ? "Available" : "Unavailable"}</span>
        </div>
        <p>{activity.routeSignature ? "Route data is available for this activity." : "No route data was included in this imported activity."}</p>
      </section>
    </>
  );
}

function DetailBackButton({ onClose }: { onClose: () => void }) {
  return <button className="detail-back-button" type="button" onClick={onClose}>← Back to activities</button>;
}
