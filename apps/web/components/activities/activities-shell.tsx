"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { ActivitiesListResponse, ActivityDetail, ActivitySummary } from "../../../../packages/core/src/contracts";
import { formatActivityDate, formatDistance, formatDuration, formatNumber, formatPace, sportLabel } from "../../lib/activity-formatters";
import { ActivityApiError, readActivitiesListResponse, readActivityDetailResponse } from "../../lib/activities-api-client.ts";
import { createRecoveryContext, dataQualityHref, readRecoveryContext, recoveryReturnHref, restoreRecoveryFocus, safeRecoveryPath, type RecoveryContext } from "../../lib/recovery-context";
import { DashboardNavigation } from "../dashboard/dashboard-navigation";
import { ActivityCoachReview } from "./activity-coach-review";
import { StravaImportQueueNotice } from "./strava-import-queue-notice";
import "../dashboard/dashboard.css";
import "./activities.css";

type ActivitiesShellProps = { initialData: ActivitiesListResponse; initialError?: string; onlineMode?: boolean };
type Filters = { search: string; sport: string; from: string; to: string };
type DisclosureState = { telemetry: boolean; splits: boolean; route: boolean };
type ListStatus = "idle" | "loading" | "loading-more" | "error";
type DetailStatus = "idle" | "loading" | "error";
type TrainingHistoryState = {
  racePredictorTraining?: true; selectedId?: string; detailOpen?: boolean; filters?: Filters; draftFilters?: Filters;
  loadedCursors?: string[]; filtersOpen?: boolean; focusKey?: string; scrollY?: number; disclosure?: DisclosureState;
};

const initialFilters: Filters = { search: "", sport: "", from: "", to: "" };
const emptyDisclosures: DisclosureState = { telemetry: false, splits: false, route: false };
const maxPages = 10;

function activityQuery(filters: Filters, cursor?: string) {
  const params = new URLSearchParams({ limit: "40" });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.sport) params.set("sport", filters.sport);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (cursor) params.set("cursor", cursor);
  return params;
}
function safeFilters(value: unknown): Filters {
  const record = value && typeof value === "object" ? value as Partial<Filters> : {};
  return { search: typeof record.search === "string" ? record.search.slice(0, 200) : "", sport: typeof record.sport === "string" ? record.sport.slice(0, 40) : "", from: typeof record.from === "string" ? record.from.slice(0, 10) : "", to: typeof record.to === "string" ? record.to.slice(0, 10) : "" };
}
function safeDisclosures(value: unknown): DisclosureState {
  const record = value && typeof value === "object" ? value as Partial<DisclosureState> : {};
  return { telemetry: record.telemetry === true, splits: record.splits === true, route: record.route === true };
}
function errorMessage(error: unknown, subject: "list" | "detail") {
  if (error instanceof ActivityApiError) {
    if (subject === "detail" && error.status === 404) return "This activity is no longer available. It was not replaced with another record.";
    if (error.status === 503) return subject === "detail" ? "Activity details are temporarily unavailable. Try again without losing your place." : "Training history is temporarily unavailable. Your loaded history remains available.";
    if (error.code === "MALFORMED_RESPONSE") return subject === "detail" ? "Activity details could not be read safely. Try again." : "Training history could not be read safely. Try again.";
  }
  return error instanceof Error ? error.message : subject === "detail" ? "The activity could not be loaded." : "Activities could not be loaded.";
}
function activeFilterLabels(filters: Filters) { return [filters.search.trim() ? `matching “${filters.search.trim()}”` : null, filters.sport ? `type ${filters.sport.replaceAll("_", " ")}` : null, filters.from ? `from ${filters.from}` : null, filters.to ? `to ${filters.to}` : null].filter((value): value is string => Boolean(value)); }

export function ActivitiesShell({ initialData, initialError, onlineMode = false }: ActivitiesShellProps) {
  const [draftFilters, setDraftFilters] = useState<Filters>(initialFilters);
  const [activeFilters, setActiveFilters] = useState<Filters>(initialFilters);
  const [displayedFilters, setDisplayedFilters] = useState<Filters>(initialFilters);
  const [activities, setActivities] = useState<ActivitySummary[]>(initialData.items);
  const [nextCursor, setNextCursor] = useState(initialData.nextCursor);
  const [listStatus, setListStatus] = useState<ListStatus>(initialError ? "error" : onlineMode ? "loading" : "idle");
  const [listError, setListError] = useState(initialError);
  const [retryCursor, setRetryCursor] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>("idle");
  const [detailError, setDetailError] = useState<string>();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [disclosures, setDisclosures] = useState<DisclosureState>(emptyDisclosures);
  const [recovery, setRecovery] = useState<RecoveryContext | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [loadedCursors, setLoadedCursors] = useState<string[]>([]);
  const listRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const inFlightCursor = useRef<string | null>(null);
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);
  const listPanelRef = useRef<HTMLElement | null>(null);
  const focusAfterLoad = useRef(false);
  const recoveryFocusApplied = useRef(false);
  const restoring = useRef(false);
  const loadedDepth = loadedCursors.length + 1;
  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  const selectedOutsideList = Boolean(selectedId && !activities.some((activity) => activity.id === selectedId));

  function captureHistoryState(overrides: Partial<TrainingHistoryState> = {}): TrainingHistoryState {
    return { ...(window.history.state && typeof window.history.state === "object" ? window.history.state : {}), racePredictorTraining: true, selectedId: selectedId ?? undefined, detailOpen: isDetailOpen, filters: activeFilters, draftFilters, loadedCursors, filtersOpen, focusKey: selectedId ? `activity-row-${selectedId}` : "activities-page-title", scrollY: listPanelRef.current?.scrollTop ?? window.scrollY, disclosure: disclosures, ...overrides };
  }
  function replaceCurrentHistory(overrides: Partial<TrainingHistoryState> = {}) { window.history.replaceState(captureHistoryState(overrides), "", `${window.location.pathname}${window.location.search}${window.location.hash}`); }

  async function loadList(filters: Filters, cursor?: string, options: { restore?: boolean } = {}): Promise<string | undefined> {
    const continuation = Boolean(cursor);
    if (continuation && inFlightCursor.current === cursor) return undefined;
    const generation = continuation ? requestGeneration.current : requestGeneration.current + 1;
    if (!continuation) { requestGeneration.current = generation; listRequest.current?.abort(); }
    const controller = new AbortController(); listRequest.current = controller;
    if (cursor) inFlightCursor.current = cursor;
    setListStatus(continuation ? "loading-more" : "loading"); setListError(undefined); setRetryCursor(undefined);
    try {
      const response = await fetch(`/api/v1/activities?${activityQuery(filters, cursor)}`, { signal: controller.signal });
      const data = await readActivitiesListResponse(response);
      if (controller.signal.aborted || generation !== requestGeneration.current) return undefined;
      if (continuation) {
        setActivities((current) => { const ids = new Set(current.map((activity) => activity.id)); return [...current, ...data.items.filter((activity) => !ids.has(activity.id))]; });
        setLoadedCursors((current) => [...new Set([...current, cursor!])].slice(0, maxPages - 1));
      } else { setActivities(data.items); setLoadedCursors([]); setDisplayedFilters(filters); }
      setNextCursor(data.nextCursor); setListStatus("idle");
      if (!options.restore) replaceCurrentHistory();
      return data.nextCursor;
    } catch (error) {
      if (controller.signal.aborted || generation !== requestGeneration.current) return undefined;
      setListStatus("error"); setListError(errorMessage(error, "list")); setRetryCursor(cursor); return undefined;
    } finally {
      if (inFlightCursor.current === cursor) inFlightCursor.current = null;
    }
  }

  async function selectActivity(activityId: string, updateHistory = true, shouldFocus = updateHistory, restoredDisclosures?: DisclosureState) {
    if (updateHistory) {
      replaceCurrentHistory({ focusKey: `activity-row-${activityId}` }); const url = new URL(window.location.href); url.searchParams.set("activityId", activityId);
      window.history.pushState(captureHistoryState({ selectedId: activityId, detailOpen: true, focusKey: "activity-detail-heading", disclosure: emptyDisclosures }), "", `${url.pathname}${url.search}${url.hash}`);
    }
    detailRequest.current?.abort(); const request = new AbortController(); detailRequest.current = request;
    setSelectedId(activityId); setSelectedActivity(null); setDetailStatus("loading"); setDetailError(undefined); setIsDetailOpen(true); setDisclosures(restoredDisclosures ?? emptyDisclosures); focusAfterLoad.current = shouldFocus;
    try {
      const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}`, { signal: request.signal }); const data = await readActivityDetailResponse(response);
      if (request.signal.aborted || detailRequest.current !== request) return;
      setSelectedActivity(data.activity); setDetailStatus("idle");
    } catch (error) {
      if (request.signal.aborted || detailRequest.current !== request) return;
      setDetailStatus("error"); setDetailError(errorMessage(error, "detail"));
    }
  }

  function explicitParent() {
    const params = new URLSearchParams(window.location.search); const context = recovery ?? readRecoveryContext(params.get("recovery"));
    const fallback = safeRecoveryPath(params.get("returnTo"), "/dashboard/activities");
    return context ? recoveryReturnHref(context, fallback) : fallback;
  }
  function parentLabel() { const target = explicitParent(); const pathname = target.split("?", 1)[0]; return pathname === "/dashboard/calendar" ? "Back to Calendar" : pathname === "/dashboard" ? "Back to Home" : "Back to Training"; }
  function closeDetail(updateHistory = true) {
    const params = new URLSearchParams(window.location.search);
    if (updateHistory && params.has("activityId")) {
      const context = recovery ?? readRecoveryContext(params.get("recovery"));
      const returnTo = safeRecoveryPath(params.get("returnTo"), "/dashboard/activities");
      // Opening a disclosure saves this detail's presentation state in history.
      // That must not turn a Home or Calendar deep link into a Training-list return.
      if (returnTo !== "/dashboard/activities" || context?.kind === "home") {
        window.location.assign(explicitParent()); return;
      }
      const state = window.history.state as TrainingHistoryState | null;
      if (state?.racePredictorTraining && state.detailOpen) { window.history.back(); return; }
      window.location.assign(explicitParent()); return;
    }
    detailRequest.current?.abort(); setDetailStatus("idle"); setDetailError(undefined); setIsDetailOpen(false); focusAfterLoad.current = false;
    requestAnimationFrame(() => selectedRowRef.current?.focus({ preventScroll: true }));
  }

  async function restoreEntry(state: TrainingHistoryState | null, activityId: string | null) {
    const filters = safeFilters(state?.filters); const draft = safeFilters(state?.draftFilters ?? filters);
    const cursors = Array.isArray(state?.loadedCursors) ? state!.loadedCursors.filter((cursor): cursor is string => typeof cursor === "string" && cursor.length <= 256).slice(0, maxPages - 1) : [];
    restoring.current = true; recoveryFocusApplied.current = false; setRecoveryReady(false); setDraftFilters(draft); setActiveFilters(filters); setFiltersOpen(state?.filtersOpen === true); setDisclosures(safeDisclosures(state?.disclosure));
    await loadList(filters, undefined, { restore: true });
    for (const cursor of cursors) { if (!restoring.current) return; const next = await loadList(filters, cursor, { restore: true }); if (next === undefined) break; }
    if (!restoring.current) return;
    if (activityId) await selectActivity(activityId, false, false, safeDisclosures(state?.disclosure)); else closeDetail(false);
    setRecoveryReady(true); const scrollY = typeof state?.scrollY === "number" ? state.scrollY : 0;
    requestAnimationFrame(() => listPanelRef.current?.scrollTo({ top: scrollY, behavior: "auto" }));
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(state?.focusKey ?? "activities-page-title")?.focus({ preventScroll: true })));
    restoring.current = false;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search); const context = readRecoveryContext(params.get("recovery")); setRecovery(context);
    const history = window.history.state as TrainingHistoryState | null; const activityId = params.get("activityId") ?? context?.activityId ?? null;
    const restoreFilters = context?.kind === "training" ? safeFilters(context.filters) : safeFilters(history?.filters);
    const state: TrainingHistoryState = { ...history, filters: restoreFilters, draftFilters: context?.kind === "training" ? safeFilters(context.draftFilters ?? context.filters) : safeFilters(history?.draftFilters ?? restoreFilters), loadedCursors: context?.kind === "training" ? context.loadedCursors : history?.loadedCursors, filtersOpen: context?.kind === "training" ? context.disclosure === "filters" : history?.filtersOpen, focusKey: context?.focusKey ?? history?.focusKey, scrollY: context?.scrollY ?? history?.scrollY, disclosure: context?.optionalDisclosures ? safeDisclosures(context.optionalDisclosures) : history?.disclosure };
    // Deferring one microtask prevents React development-mode effect replay from
    // issuing a duplicate page-restoration read before its cleanup can cancel it.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (onlineMode || context?.kind === "training" || history?.racePredictorTraining) void restoreEntry(state, activityId); else if (activityId) void selectActivity(activityId, false, false); else setRecoveryReady(true);
    });
    const onPopState = () => { restoring.current = false; void restoreEntry(window.history.state as TrainingHistoryState | null, new URLSearchParams(window.location.search).get("activityId")); };
    window.addEventListener("popstate", onPopState);
    return () => { cancelled = true; restoring.current = false; listRequest.current?.abort(); detailRequest.current?.abort(); window.removeEventListener("popstate", onPopState); };
    // Initialization intentionally reads one browser entry; popstate handles later entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMode]);
  useEffect(() => { if (!selectedActivity || !focusAfterLoad.current) return; focusAfterLoad.current = false; requestAnimationFrame(() => document.getElementById("activity-detail-heading")?.focus()); }, [selectedActivity]);
  useEffect(() => { if (!recovery || !recoveryReady || recoveryFocusApplied.current || (recovery.activityId && selectedActivity?.id !== recovery.activityId)) return; recoveryFocusApplied.current = true; restoreRecoveryFocus(recovery); }, [recovery, recoveryReady, selectedActivity]);

  function submitFilters(event: FormEvent<HTMLFormElement>) { event.preventDefault(); restoring.current = false; setActiveFilters(draftFilters); void loadList(draftFilters); }
  function clearFilters() { restoring.current = false; setDraftFilters(initialFilters); setActiveFilters(initialFilters); void loadList(initialFilters); }
  const beginAddTraining = () => dataQualityHref(createRecoveryContext({ kind: "training", path: `${window.location.pathname}${window.location.search}${window.location.hash}`, activityId: selectedId ?? undefined, filters: activeFilters, draftFilters, loadedDepth, loadedCursors, disclosure: filtersOpen ? "filters" : undefined, detailOpen: isDetailOpen, optionalDisclosures: disclosures, scrollY: listPanelRef.current?.scrollTop ?? window.scrollY, focusKey: selectedId ? `activity-row-${selectedId}` : "activities-page-title", issue: "training history needs correction or import" }));
  const changeDisclosure = (name: keyof DisclosureState, open: boolean) => { const next = { ...disclosures, [name]: open }; setDisclosures(next); replaceCurrentHistory({ disclosure: next }); };

  return <div className="dashboard-layout activities-layout"><DashboardNavigation activePage="training" /><main id="dashboard-main-content" className="dashboard-main" tabIndex={-1} aria-labelledby="activities-page-title">
    <header className="dashboard-toolbar activities-toolbar"><div><p className="eyebrow">Training workspace</p><h1 id="activities-page-title" tabIndex={-1}>Training</h1><p>{onlineMode ? "Your cloud-synced running history" : "Your manually imported running history"}</p></div><div className="activity-count"><div aria-live="polite"><strong>{activities.length}</strong> <span>{nextCursor ? "activities shown" : "activities"}</span></div><Link className="button button-primary" href="/dashboard/data-quality" onClick={(event) => { event.preventDefault(); window.location.assign(beginAddTraining()); }}>Add training</Link></div></header>
    <section className="activities-content" aria-label="Activities browser">
      {onlineMode ? <StravaImportQueueNotice onRefreshTraining={() => void loadList(activeFilters)} /> : null}
      <details className="activity-filter-disclosure" open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}><summary>Filters{hasActiveFilters ? " applied" : ""}</summary><form className="activity-filters" onSubmit={submitFilters}>
        <label className="search-filter"><span>Search activities</span><input type="search" value={draftFilters.search} onChange={(event) => { restoring.current = false; setDraftFilters({ ...draftFilters, search: event.target.value }); }} placeholder="Morning run, trail…" /></label><label><span>Activity type</span><select value={draftFilters.sport} onChange={(event) => { restoring.current = false; setDraftFilters({ ...draftFilters, sport: event.target.value }); }}><option value="">All types</option><option value="run">Run</option><option value="trail_run">Trail run</option><option value="treadmill_run">Treadmill run</option><option value="other">Other</option></select></label><label><span>From</span><input type="date" value={draftFilters.from} onChange={(event) => { restoring.current = false; setDraftFilters({ ...draftFilters, from: event.target.value }); }} /></label><label><span>To</span><input type="date" value={draftFilters.to} onChange={(event) => { restoring.current = false; setDraftFilters({ ...draftFilters, to: event.target.value }); }} /></label><div className="filter-actions"><button className="button button-secondary" type="submit" disabled={listStatus === "loading"}>{listStatus === "loading" ? "Applying…" : "Apply filters"}</button><button className="button button-secondary" type="button" onClick={clearFilters} disabled={!hasActiveFilters}>Clear</button></div>
      </form></details>
      {hasActiveFilters ? <p className="activity-filter-summary" role="status">Showing {activities.length} matching activit{activities.length === 1 ? "y" : "ies"}: {activeFilterLabels(displayedFilters).join(" · ")}. <button className="text-button" type="button" onClick={clearFilters}>Clear filters</button></p> : null}
      <div className={isDetailOpen ? "activity-browser activity-browser-detail-open" : "activity-browser"}>
        <section className="activity-list-panel" aria-labelledby="activity-list-heading" ref={listPanelRef}><div className="panel-heading"><div><p className="eyebrow">Training history</p><h2 id="activity-list-heading" tabIndex={-1}>Recent activities</h2></div>{listStatus === "loading" ? <span className="loading-label">Loading…</span> : null}</div>
          {listStatus === "error" ? <section className="activity-list-error" role="alert"><p>{activities.length ? "Could not refresh the activity list. Your loaded history is still available." : "Could not load training history."}</p><button className="button button-secondary" type="button" onClick={() => void loadList(activeFilters, retryCursor)}>Try again</button></section> : null}
          {listStatus === "loading" && activities.length === 0 ? <div className="activity-list-skeleton" aria-live="polite" aria-label="Loading activities"><span /><span /><span /><span /></div> : null}
          {activities.length > 0 ? <ol className="activity-list">{activities.map((activity) => <li key={activity.id}><button type="button" className={selectedId === activity.id ? "activity-row selected" : "activity-row"} id={`activity-row-${activity.id}`} aria-current={selectedId === activity.id ? "true" : undefined} aria-label={`${activity.title || sportLabel(activity.sport)}, ${formatActivityDate(activity.localOccurredAt, activity.occurredAt)}, ${formatDistance(activity.distanceM)}, ${formatDuration(activity.elapsedTimeS)}, ${formatPace(activity.avgPaceSecPerKm)}${selectedId === activity.id ? ", selected" : ""}`} ref={selectedId === activity.id ? (node) => { selectedRowRef.current = node; } : undefined} onClick={() => { restoring.current = false; void selectActivity(activity.id); }}><span className="activity-row-main"><span className="activity-title">{activity.title || sportLabel(activity.sport)}</span><span className="activity-date">{formatActivityDate(activity.localOccurredAt, activity.occurredAt)}</span></span><span className="activity-row-metrics" aria-hidden="true"><strong>{formatDistance(activity.distanceM)}</strong><span>{formatDuration(activity.elapsedTimeS)}</span><span>{formatPace(activity.avgPaceSecPerKm)}</span></span></button></li>)}</ol> : listStatus !== "loading" ? <section className="activity-state" role="status"><h2>{hasActiveFilters ? "No matching activities" : "No activities yet"}</h2><p>{hasActiveFilters ? "Try widening the date range or clearing a filter." : onlineMode ? "Your activities will appear after Strava sends a completed workout." : "Your activities will appear after a manual CSV or GPX import."}</p>{hasActiveFilters ? <button className="button button-secondary" type="button" onClick={clearFilters}>Clear filters</button> : null}</section> : null}
          {selectedOutsideList && selectedActivity ? <p className="activity-list-context" role="status">This selected activity is outside the displayed results.</p> : null}
          {nextCursor && activities.length > 0 ? <button className="button button-load-more" type="button" disabled={listStatus === "loading-more"} onClick={() => void loadList(activeFilters, nextCursor)}>{listStatus === "loading-more" ? "Loading more…" : "Load more activities"}</button> : activities.length > 0 && listStatus !== "loading-more" ? <p className="list-end">You’ve reached the start of your imported history.</p> : null}
        </section>
        {isDetailOpen || selectedId ? <ActivityDetailPanel activity={selectedActivity} status={detailStatus} error={detailError} onClose={closeDetail} onRetry={selectedId ? () => void selectActivity(selectedId, false, false) : undefined} parentLabel={parentLabel()} disclosures={disclosures} onDisclosureChange={changeDisclosure} /> : null}
      </div>
    </section>
  </main></div>;
}

function ActivityDetailPanel({ activity, status, error, onClose, onRetry, parentLabel, disclosures, onDisclosureChange }: { activity: ActivityDetail | null; status: DetailStatus; error?: string; onClose: () => void; onRetry?: () => void; parentLabel: string; disclosures: DisclosureState; onDisclosureChange: (name: keyof DisclosureState, open: boolean) => void }) {
  if (status === "loading") return <aside className="activity-detail activity-detail-state" aria-live="polite"><DetailBackButton onClose={onClose} label={parentLabel} /><h3 id="activity-detail-heading" tabIndex={-1}>Loading activity details…</h3></aside>;
  if (status === "error") return <aside className="activity-detail activity-detail-state activity-detail-error" role="alert"><DetailBackButton onClose={onClose} label={parentLabel} /><h3 id="activity-detail-heading" tabIndex={-1}>Unable to load this activity</h3><p>{error}</p>{onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button> : null}</aside>;
  if (!activity) return <aside className="activity-detail activity-detail-state"><DetailBackButton onClose={onClose} label={parentLabel} /><h3 id="activity-detail-heading" tabIndex={-1}>Select an activity</h3><p>Choose a run to inspect its performance, effort, and available imported metrics.</p></aside>;
  return <aside className="activity-detail" aria-labelledby="activity-detail-heading"><ActivityRecordContent activity={activity} onClose={onClose} parentLabel={parentLabel} disclosures={disclosures} onDisclosureChange={onDisclosureChange} /></aside>;
}

export function ActivityRecordContent({ activity, onClose, parentLabel = "Back to Training", headingId = "activity-detail-heading", disclosures, onDisclosureChange, headingLevel = 2 }: { activity: ActivityDetail; onClose?: () => void; parentLabel?: string; headingId?: string; disclosures?: DisclosureState; onDisclosureChange?: (name: keyof DisclosureState, open: boolean) => void; headingLevel?: 2 | 3 }) {
  const RecordHeading = headingLevel === 2 ? "h2" : "h3";
  const SectionHeading = headingLevel === 2 ? "h3" : "h4";
  const reviewHeadingLevel = headingLevel === 2 ? 3 : 4;
  const coreReadoutHeadingId = `${headingId}-core-readout`;
  const optionalMetrics = [["Average heart rate", formatNumber(activity.avgHrBpm, " bpm")], ["Maximum heart rate", formatNumber(activity.maxHrBpm, " bpm")], ["Average cadence", formatNumber(activity.avgCadenceSpm, " spm")], ["Aerobic training effect", formatNumber(activity.aerobicTrainingEffect, "", 1)], ["Calories", formatNumber(activity.calories, " kcal")], ["Average power", formatNumber(activity.avgPowerW, " W")], ["Stride length", formatNumber(activity.avgStrideLengthM, " m", 2)], ["Ground contact time", formatNumber(activity.avgGroundContactTimeMs, " ms")], ["Steps", formatNumber(activity.steps)], ["Body Battery drain", formatNumber(activity.bodyBatteryDrain)]].filter(([, value]) => value !== "—");
  const coreMetrics = [["Distance", formatDistance(activity.distanceM)], ["Elapsed time", formatDuration(activity.elapsedTimeS)], ["Average pace", formatPace(activity.avgPaceSecPerKm)], ["Elevation gain", formatNumber(activity.elevationGainM, " m")]];
  const controlled = (name: keyof DisclosureState) => ({ open: disclosures?.[name], onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => onDisclosureChange?.(name, event.currentTarget.open) });
  return <><div className="detail-header">{onClose ? <DetailBackButton onClose={onClose} label={parentLabel} /> : null}<div className="detail-header-meta"><p className="eyebrow">{sportLabel(activity.sport)}</p><span className="detail-record-label">Activity record</span></div><RecordHeading className="detail-record-title" id={headingId} tabIndex={-1}>{activity.title || sportLabel(activity.sport)}</RecordHeading><p>{formatActivityDate(activity.localOccurredAt, activity.occurredAt)}</p></div><section className="detail-core-readout" aria-labelledby={coreReadoutHeadingId}><div className="detail-section-heading"><div><p className="eyebrow">Session summary</p><SectionHeading className="detail-section-title" id={coreReadoutHeadingId}>Run at a glance</SectionHeading></div></div><dl className="detail-metrics detail-primary-metrics">{coreMetrics.map(([label, value], index) => <div key={label} className="detail-metric"><dt><span className="detail-metric-index" aria-hidden="true">0{index + 1}</span>{label}</dt><dd>{value}</dd></div>)}</dl></section><ActivityCoachReview activityId={activity.id} headingLevel={reviewHeadingLevel} />
    <details className="detail-disclosure" {...controlled("telemetry")}><summary>Additional telemetry {optionalMetrics.length ? <span>{optionalMetrics.length} signals</span> : <span>Unavailable</span>}</summary>{optionalMetrics.length ? <dl className="detail-metrics detail-telemetry-metrics">{optionalMetrics.map(([label, value], index) => <div key={label} className="detail-metric"><dt><span className="detail-metric-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{label}</dt><dd>{value}</dd></div>)}</dl> : <p>No additional telemetry was included in this activity.</p>}</details>
    <details className="detail-disclosure" {...controlled("splits")}><summary>Splits {activity.splits.length ? <span>{activity.splits.length} km</span> : <span>Unavailable</span>}</summary>{activity.splits.length ? <ol className="split-grid" aria-label="Per kilometre splits">{activity.splits.map((split) => <li key={split.id}><span>KM {String(split.splitIndex + 1).padStart(2, "0")}</span><strong>{formatPace(split.paceSecPerKm)}</strong></li>)}</ol> : <p>No split data was included in this imported activity.</p>}</details>
    <details className={activity.routeSignature ? "detail-disclosure detail-route-available" : "detail-disclosure"} {...controlled("route")}><summary>Route details <span>{activity.routeSignature ? "Available" : "Unavailable"}</span></summary><p>{activity.routeSignature ? "Route data is available for this activity. No map is shown here." : "No route data was included in this imported activity."}</p></details></>;
}
function DetailBackButton({ onClose, label }: { onClose: () => void; label: string }) { return <button className="detail-back-button" type="button" onClick={onClose}>← {label}</button>; }
