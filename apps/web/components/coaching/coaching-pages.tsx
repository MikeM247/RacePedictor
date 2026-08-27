"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { DashboardNavigation } from "../dashboard/dashboard-navigation";
import {
  canAmendFutureSession,
  changeHistoryLabel,
  externalAutomationStatusLabel,
  formatAdjustmentCue,
  formatApiErrorDetails,
  formatCoachingDate,
  formatSessionTarget,
  handoffStatusLabel,
  localDateInTimezone,
  normalizeCalendarActivities,
  normalizeHistoricalCalendarSessions,
  normalizeCalendarSessions,
  normalizeReminderExternalStatus,
  outOfPlanRangeWarning,
  sameDayConflictWarning,
  weekRange,
  type CalendarSessionView,
  type CalendarActivityView,
  type HistoricalCalendarSessionView,
  type ReminderExternalStatus,
} from "../../lib/coaching-ui-state";
import "../dashboard/dashboard.css";
import "./coaching-ui.css";
import { ActivePlanOverview } from "./active-plan-overview";

type Page = "plan" | "calendar" | "data-quality" | "settings";
type JsonRecord = Record<string, unknown>;
type RequestState = "idle" | "loading" | "success" | "error";
const timezoneDefault = "Africa/Johannesburg";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function unwrap(value: unknown): JsonRecord {
  const record = asRecord(value);
  return record.data && typeof record.data === "object" ? asRecord(record.data) : record;
}

function coachingContentVersion(plan: JsonRecord | null): string | null {
  if (!plan) return null;
  const approval = asRecord(plan.approval);
  const candidates = [plan.contentVersion, approval.summary, approval.rationale, approval.goalRationale, plan.id];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const labelled = candidate.match(/\b(?:coaching\s+)?(?:plan\s+)?version\s+v?(\d+\.\d+(?:\.\d+)?)\b/iu);
    if (labelled) return labelled[1];
    const artifact = candidate.match(/@(\d+\.\d+(?:\.\d+)?)\b/u);
    if (artifact) return artifact[1];
  }
  return null;
}

function coachingPlanLabel(plan: JsonRecord | null) {
  const contentVersion = coachingContentVersion(plan);
  return contentVersion ? `Coaching version ${contentVersion}` : `Approved record ${String(plan?.version ?? 1)}`;
}

async function apiRequest(url: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = asRecord(asRecord(body).error);
    const message = typeof error.message === "string" ? error.message : "The request could not be completed.";
    const details = formatApiErrorDetails(error.details);
    const requestError = new Error(details.length > 0 ? `${message}: ${details.join("; ")}` : message) as Error & { code?: string };
    requestError.code = typeof error.code === "string" ? error.code : undefined;
    throw requestError;
  }
  return unwrap(body);
}

function CoachShell({ page, title, subtitle, meta, children }: {
  page: Page;
  title: string;
  subtitle: string;
  meta?: string;
  children: ReactNode;
}) {
  const titleId = `${page}-page-title`;
  return (
    <div className={`dashboard-layout coaching-layout coaching-layout--${page}`}>
      <DashboardNavigation activePage={page} />
      <main className="dashboard-main" aria-labelledby={titleId}>
        <header className="dashboard-toolbar coaching-toolbar">
          <div><p className="eyebrow">Training workspace</p><h1 id={titleId}>{title}</h1><p>{subtitle}</p></div>
          {meta ? <span className="toolbar-context">{meta}</span> : null}
        </header>
        <section className={`coaching-content coaching-content--${page}`}>{children}</section>
      </main>
    </div>
  );
}

function StatusLine({ state, message }: { state: RequestState; message?: string }) {
  if (state === "idle" && !message) return null;
  return <p className={`coach-status coach-status--${state}`} role={state === "error" ? "alert" : "status"} aria-live="polite">
    {message ?? (state === "loading" ? "Working…" : state === "success" ? "Saved." : "Something went wrong.")}
  </p>;
}

const dialogFocusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function useModalKeyboard<T extends HTMLElement>(
  open: boolean,
  close: () => void,
  returnFocusRef?: { current: HTMLElement | null },
) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const returnTarget = returnFocusRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const frame = window.requestAnimationFrame(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>("[autofocus]")
        ?? dialogRef.current?.querySelector<HTMLElement>(dialogFocusableSelector);
      target?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.requestAnimationFrame(() => returnTarget?.focus());
    };
  }, [open]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRef.current();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(dialogFocusableSelector) ?? []);
    if (focusable.length === 0) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  return { dialogRef, onKeyDown };
}

export function DataQualityPage() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState<string>();
  const [result, setResult] = useState<JsonRecord | null>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setState("error"); setMessage("Choose one CSV or GPX file first."); return; }
    setState("loading"); setMessage("Validating and importing the selected file…"); setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const imported = await apiRequest("/api/v1/imports/upload", { method: "POST", body: form });
      setResult(imported); setState("success");
      setMessage(imported.reused ? "This file was already imported; no duplicate activities were added." : "Import finished. Your coaching history is updated; your active plan was not changed.");
    } catch (error) {
      setState("error"); setMessage(error instanceof Error ? error.message : "The file could not be imported.");
    }
  }

  const counts = result ? [
    ["Accepted", Number(result.normalizedCount ?? result.stagedCount ?? 0)],
    ["Duplicates", Number(result.duplicateCount ?? 0)],
    ["Rejected", Number(result.rejectedCount ?? 0)],
    ["Warnings", Array.isArray(result.parseWarnings) ? result.parseWarnings.length : 0],
  ] : [];

  return <CoachShell page="data-quality" title="Data Quality" subtitle="Import and verify your running history" meta="Manual CSV or GPX">
    <section className="coach-panel data-quality-panel data-quality-panel--import" aria-labelledby="activity-import-heading">
      <div className="coach-panel-heading"><div><p className="eyebrow">History import</p><h3 id="activity-import-heading">Upload activities</h3></div></div>
      <form className="coach-form" onSubmit={upload}>
        <label className="file-field"><span>CSV or GPX file</span><input type="file" accept=".csv,.gpx,text/csv,application/gpx+xml" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <p className="field-help">Choose a bounded CSV export or one GPX activity. Re-importing the same data is safe.</p>
        <button className="button button-primary" disabled={state === "loading" || !file} type="submit">{state === "loading" ? "Importing…" : "Import selected file"}</button>
      </form>
      <StatusLine state={state} message={message} />
    </section>
    {result ? <section className="coach-panel data-quality-panel data-quality-panel--result" aria-labelledby="import-result-heading">
      <div className="coach-panel-heading"><div><p className="eyebrow">Import result</p><h3 id="import-result-heading">Validation summary</h3></div><span className="status-chip">{String(result.status ?? "completed")}</span></div>
      <dl className="result-grid">{counts.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {Array.isArray(result.parseWarnings) && result.parseWarnings.length > 0 ? <div className="issue-list"><h4>Warnings and next steps</h4><ul>{result.parseWarnings.map((warning, index) => <li key={index}>{String(warning)}</li>)}</ul><p>Correct the source and upload it again if a warning affects your history.</p></div> : <p className="quiet-copy">No corrective action is needed.</p>}
    </section> : <section className="coach-panel coach-empty"><h3>No import result yet</h3><p>Select a file above to see accepted, duplicate, rejected, and warning counts.</p></section>}
  </CoachShell>;
}

export function PlanPage({ onlineMode = false }: { onlineMode?: boolean }) {
  const [displayName, setDisplayName] = useState("Athlete");
  const [why, setWhy] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [distanceKm, setDistanceKm] = useState("21.1");
  const [availableDays, setAvailableDays] = useState(() => new Set(["Tuesday", "Thursday", "Sunday"]));
  const [creationOpen, setCreationOpen] = useState(false);
  const [contextState, setContextState] = useState<RequestState>("idle");
  const [contextMessage, setContextMessage] = useState<string>();
  const [proposal, setProposal] = useState<JsonRecord | null>(null);
  const [proposalState, setProposalState] = useState<RequestState>("idle");
  const [proposalMessage, setProposalMessage] = useState<string>();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [acknowledgeStale, setAcknowledgeStale] = useState(false);
  const [activePlan, setActivePlan] = useState<JsonRecord | null>(null);
  const [planHistory, setPlanHistory] = useState<JsonRecord[]>([]);
  const [historyState, setHistoryState] = useState<RequestState>("loading");
  const [historyMessage, setHistoryMessage] = useState<string>();
  const [activationCandidate, setActivationCandidate] = useState<JsonRecord | null>(null);
  const [activationState, setActivationState] = useState<RequestState>("idle");
  const [activationMessage, setActivationMessage] = useState<string>();
  const creationHeadingRef = useRef<HTMLHeadingElement>(null);
  const proposalHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusCreation = useRef(false);
  const creationFocusTarget = useRef<"setup" | "proposal">("setup");

  useEffect(() => {
    void loadPlanPage();
  }, []);

  async function loadPlanPage() {
    const currentActivePlan = await apiRequest("/api/v1/coaching/plans/active").catch(() => null);
    setActivePlan(currentActivePlan);
    if (onlineMode) {
      setProposal(null);
      setProposalState("idle");
      setProposalMessage(undefined);
      await loadPlanHistory();
      return;
    }
    await Promise.all([loadLatestProposal(currentActivePlan), loadPlanHistory()]);
  }

  async function loadLatestProposal(currentActivePlan: JsonRecord | null) {
    setProposalState("loading"); setProposalMessage("Loading your latest saved draft…");
    try {
      const response = await apiRequest("/api/v1/coaching/proposals/latest");
      const latest = asRecord(response.proposal);
      if (latest.status === "proposed" && typeof latest.id === "string") {
        const activeVersion = Number(currentActivePlan?.version ?? 0);
        const proposalVersion = Number(latest.version ?? 0);
        if (currentActivePlan && proposalVersion <= activeVersion) {
          setProposal(null); setProposalState("idle"); setProposalMessage(undefined);
          return;
        }
        setProposal(latest); setProposalState("success");
        setProposalMessage("Saved draft loaded for review. Nothing is active until you approve it.");
        return;
      }
      setProposal(null); setProposalState("idle"); setProposalMessage(undefined);
    } catch (error) {
      setProposalState("error");
      setProposalMessage(error instanceof Error ? `Saved draft could not be loaded: ${error.message}` : "Saved draft could not be loaded.");
    }
  }

  async function loadPlanHistory() {
    setHistoryState("loading"); setHistoryMessage("Loading approved plan versions…");
    try {
      const response = await apiRequest("/api/v1/coaching/plans/history");
      setPlanHistory(Array.isArray(response.plans) ? response.plans.map(asRecord) : []);
      setHistoryState("success"); setHistoryMessage(undefined);
    } catch (error) {
      setHistoryState("error"); setHistoryMessage(error instanceof Error ? error.message : "Plan history could not be loaded.");
    }
  }

  async function confirmPlanActivation() {
    if (!activationCandidate) return;
    const planId = String(activationCandidate.id ?? "");
    if (!planId) {
      setActivationCandidate(null);
      setActivationState("error");
      setActivationMessage("This approved plan has no identifier and cannot be selected.");
      return;
    }
    setActivationState("loading");
    setActivationMessage(`Making ${coachingPlanLabel(activationCandidate).toLowerCase()} active…`);
    try {
      const response = await apiRequest(`/api/v1/coaching/plans/${encodeURIComponent(planId)}/activate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedActivePlanId: activePlan?.id ?? null }),
      });
      const selected = asRecord(response.activePlan);
      setActivePlan(selected);
      await loadPlanHistory();
      setActivationState("success");
      setActivationMessage(`${coachingPlanLabel(selected)} is now active. Today and Calendar use this approved version.`);
      setActivationCandidate(null);
    } catch (error) {
      setActivationState("error");
      setActivationMessage(error instanceof Error ? error.message : "The approved plan could not be made active.");
      setActivationCandidate(null);
      await loadPlanPage();
    }
  }

  function toggleDay(day: string) {
    setAvailableDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  }

  function openPlanCreation() {
    creationFocusTarget.current = proposal ? "proposal" : "setup";
    shouldFocusCreation.current = true;
    setCreationOpen(true);
  }

  useEffect(() => {
    if (!creationOpen || !shouldFocusCreation.current) return;
    const target = creationFocusTarget.current === "proposal" ? proposalHeadingRef.current : creationHeadingRef.current;
    target?.focus();
    shouldFocusCreation.current = false;
  }, [creationOpen]);

  async function publishContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!why.trim() || !goalTitle.trim() || !targetDate || availableDays.size === 0) {
      setContextState("error"); setContextMessage("Complete your why, goal, target date, and at least one available day."); return;
    }
    setContextState("loading"); setContextMessage("Publishing a versioned coaching context…");
    try {
      const body = {
        profile: { displayName, why, timezone: timezoneDefault, units: "metric" },
        goalDraft: { title: goalTitle, targetDate, distanceMeters: Number(distanceKm) * 1000 },
        weeklyRoutine: { timezone: timezoneDefault, availableDays: [...availableDays].map((day) => day.toLowerCase()), preferredLongRunDay: "sunday" },
      };
      const response = await apiRequest("/api/v1/coaching/context/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setContextState("success"); setContextMessage(`Context ${String(response.artifactId ?? response.id ?? "published")} is ready. Continue planning in Codex, then import its proposal below.`);
    } catch (error) { setContextState("error"); setContextMessage(error instanceof Error ? error.message : "Context could not be published."); }
  }

  async function importProposal(file: File | null) {
    if (!file) return;
    setProposalState("loading"); setProposalMessage("Validating the selected proposal…"); setProposal(null); setAcknowledgeStale(false);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const response = await apiRequest("/api/v1/coaching/proposals/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed) });
      setProposal(asRecord(response.proposal ?? response)); setProposalState("success"); setProposalMessage("Draft imported for review. Nothing is active yet.");
    } catch (error) { setProposalState("error"); setProposalMessage(error instanceof Error ? error.message : "Proposal could not be imported."); }
  }

  async function confirmDecision() {
    if (!proposal || !decision) return;
    const proposalId = String(proposal.id ?? proposal.proposalId ?? "");
    if (!proposalId) { setProposalState("error"); setProposalMessage("The imported proposal has no identifier."); setDecision(null); return; }
    setProposalState("loading");
    try {
      const response = await apiRequest(`/api/v1/coaching/proposals/${encodeURIComponent(proposalId)}/decision`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          expectedRevision: Number(proposal.revision ?? 1),
          acknowledgeStale,
          ...(decision === "approve" && activePlan?.id ? { replacingPlanId: String(activePlan.id) } : {}),
        }),
      });
      if (decision === "approve") {
        setActivePlan(asRecord(response.plan ?? response.activePlan ?? response));
        await loadPlanHistory();
      }
      setProposal(null); setProposalState("success"); setProposalMessage(decision === "approve" ? "Plan activated after explicit approval." : "Draft rejected. The active plan was not changed.");
    } catch (error) { setProposalState("error"); setProposalMessage(error instanceof Error ? error.message : "Decision could not be saved."); }
    finally { setDecision(null); setAcknowledgeStale(false); }
  }

  const proposalWorkouts = proposal && (Array.isArray(proposal.workouts) ? proposal.workouts : Array.isArray(proposal.sessions) ? proposal.sessions : []);
  const proposalReview = asRecord(proposal?.review);
  const proposalWeeks = proposal && Array.isArray(proposal.weeklyStructure) ? proposal.weeklyStructure : [];
  const proposalAssumptions = proposal && Array.isArray(proposal.assumptions) ? proposal.assumptions : [];
  const proposalCautions = proposal && Array.isArray(proposal.cautions) ? proposal.cautions : [];
  const materialDifferences = Array.isArray(proposalReview.materialDifferences) ? proposalReview.materialDifferences : [];
  const historyIsStale = proposalReview.historyStatus === "stale";
  const activeWorkouts = activePlan && Array.isArray(activePlan.workouts) ? activePlan.workouts : [];
  const goalTarget = asRecord(proposalReview.goalTarget);
  const goalTargetSummary = goalTarget.kind === "performance"
    ? `${Number(goalTarget.distanceMeters ?? 0) / 1000} km by ${String(goalTarget.targetDate ?? "unspecified date")}${goalTarget.targetTimeSeconds ? ` in ${String(goalTarget.targetTimeSeconds)} seconds` : ""}`
    : `${String(goalTarget.metric ?? "consistency")} ${String(goalTarget.threshold ?? "")} from ${String(goalTarget.startsOn ?? "—")} to ${String(goalTarget.endsOn ?? "—")}`;
  const creationActionLabel = proposal ? "Review saved draft" : activePlan ? "Create a new plan with Codex" : "Create a plan with Codex";
  const activeContentVersion = coachingContentVersion(activePlan);
  const activePlanToday = activePlan ? localDateInTimezone(String(activePlan.timezone ?? timezoneDefault)) : "";
  return <CoachShell page="plan" title="Plan" subtitle={onlineMode ? "Choose which explicitly approved structured plan is active" : "Set your goal and explicitly approve each plan version"} meta={activePlan ? `Active · ${activeContentVersion ?? `record ${String(activePlan.version ?? 1)}`}` : "No active plan"}>
    <section className="coach-panel coach-panel--plan-focus" aria-labelledby="active-plan-heading">
      <div className="coach-panel-heading plan-focus-heading"><div><p className="eyebrow">Your training focus</p><h3 id="active-plan-heading">Active plan</h3></div>{onlineMode ? <span className="status-chip">Online plan control</span> : <button className="button button-primary" type="button" aria-controls="plan-creation-workflow" aria-expanded={creationOpen} onClick={openPlanCreation}>{creationActionLabel}</button>}</div>
      {activePlan ? <><dl className="summary-list active-plan-summary"><div><dt>Status</dt><dd>Active approved version</dd></div><div><dt>Coaching version</dt><dd>{activeContentVersion ?? "Not supplied"}</dd></div><div><dt>Approval record</dt><dd>{String(activePlan.version ?? 1)}</dd></div><div><dt>Date range</dt><dd>{String(activePlan.startsOn ?? "—")} to {String(activePlan.endsOn ?? "—")}</dd></div><div><dt>Sessions</dt><dd>{activeWorkouts.length}</dd></div><div><dt>Timezone</dt><dd>{String(activePlan.timezone ?? timezoneDefault)}</dd></div></dl><p>{onlineMode ? "This plan was explicitly approved before publication. Selecting another approved version changes Today and Calendar, but does not alter any workout prescription." : "Follow this approved version in Calendar. Creating a replacement never changes it until you review and approve the new draft."}</p><Link className="text-link" href="/dashboard/calendar">Open active plan in Calendar</Link><ActivePlanOverview plan={activePlan} today={activePlanToday} /></> : <div className="plan-focus-empty"><p>{onlineMode ? "No approved plan has been synced yet. Your local coaching workflow remains the authority for creating and approving plans." : "No plan is active yet. Start with Codex, then return here to review and approve the proposal before it affects Today or Calendar."}</p></div>}
      {proposal ? <p className="plan-draft-note" role="status">A newer saved draft is ready for review. Your active plan remains unchanged until you explicitly approve it.</p> : null}
    </section>
    {!onlineMode && creationOpen ? <div className="plan-creation-workflow" id="plan-creation-workflow">
    <section className="coach-panel" aria-labelledby="coach-setup-heading">
      <div className="coach-panel-heading"><div><p className="eyebrow">Step 1</p><h3 id="coach-setup-heading" ref={creationHeadingRef} tabIndex={-1}>Create a plan with Codex</h3></div><span className="status-chip">Draft inputs</span></div>
      <p>Set the goal and routine Codex should plan from. The app publishes current coaching context; you continue the planning conversation in Codex.</p>
      <form className="coach-form coach-form-grid" onSubmit={publishContext}>
        <label><span>Name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label><span>Goal</span><input required value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="Finish my first half marathon" /></label>
        <label><span>Target date</span><input required type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
        <label><span>Target distance (km)</span><input required min="1" step="0.1" type="number" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} /></label>
        <label className="field-wide"><span>Why this matters</span><textarea required rows={3} value={why} onChange={(event) => setWhy(event.target.value)} placeholder="The personal reason you want to keep showing up" /></label>
        <fieldset className="field-wide routine-fieldset"><legend>Available training days</legend><div className="weekday-options">{weekdays.map((day) => <label key={day}><input type="checkbox" checked={availableDays.has(day)} onChange={() => toggleDay(day)} /><span>{day.slice(0, 3)}</span></label>)}</div><p className="field-help">Sunday is the preferred long-run day. Codex can discuss a different routine before you import a plan.</p></fieldset>
        <button className="button button-primary field-wide" disabled={contextState === "loading"} type="submit">{contextState === "loading" ? "Publishing…" : "Publish context for Codex"}</button>
      </form>
      <StatusLine state={contextState} message={contextMessage} />
    </section>
    <section className="coach-panel" aria-labelledby="proposal-import-heading">
      <div className="coach-panel-heading"><div><p className="eyebrow">Step 2</p><h3 id="proposal-import-heading" ref={proposalHeadingRef} tabIndex={-1}>Import and review proposal</h3></div><span className={`status-chip ${proposal ? "status-chip--draft" : ""}`}>{proposal ? "Draft · not active" : "Waiting for file"}</span></div>
      <label className="file-field"><span>Codex proposal JSON</span><input type="file" accept=".json,application/json" onChange={(event) => void importProposal(event.target.files?.[0] ?? null)} /></label>
      <p className="field-help">The app reads only the file you select. Importing or leaving this page never activates a plan.</p>
      <StatusLine state={proposalState} message={proposalMessage} />
      {proposal ? <div className="proposal-review">
        <dl className="summary-list"><div><dt>Status</dt><dd>Draft proposal</dd></div><div><dt>Version</dt><dd>{String(proposal.version ?? 1)}</dd></div><div><dt>Date range</dt><dd>{String(proposal.startsOn ?? "—")} to {String(proposal.endsOn ?? "—")}</dd></div><div><dt>Sessions</dt><dd>{proposalWorkouts ? proposalWorkouts.length : 0}</dd></div><div><dt>History freshness</dt><dd>{historyIsStale ? "Stale — acknowledgement required" : "Current"}</dd></div></dl>
        {historyIsStale ? <div className="today-warnings" role="alert"><strong>History changed after this proposal was generated.</strong><p>{String(proposalReview.historyWarning ?? "Review the newly imported activity history before approving this plan.")}</p></div> : null}
        <div><h4>Goal and outcome</h4><p><strong>{String(proposalReview.goalTitle ?? "Settled goal")}</strong> · {goalTargetSummary}</p></div>
        <div><h4>Plan summary</h4><p>{String(proposal.summary ?? "No proposal summary supplied.")}</p><p><strong>Rationale:</strong> {String(proposal.rationale ?? "Review the full proposal content before approval.")}</p></div>
        <div className="issue-list"><h4>Weekly structure</h4><ul>{proposalWeeks.map((value, index) => { const week = asRecord(value); return <li key={String(week.weekStartsOn ?? index)}><strong>Week of {String(week.weekStartsOn ?? "—")}:</strong> {String(week.focus ?? "No focus supplied")} ({Array.isArray(week.sessionIds) ? week.sessionIds.length : 0} sessions)</li>; })}</ul></div>
        <div className="issue-list"><h4>Assumptions and cautions</h4>{proposalAssumptions.length > 0 ? <><strong>Assumptions</strong><ul>{proposalAssumptions.map((item, index) => <li key={`assumption-${index}`}>{String(item)}</li>)}</ul></> : <p className="quiet-copy">No assumptions were supplied.</p>}{proposalCautions.length > 0 ? <><strong>Cautions</strong><ul>{proposalCautions.map((item, index) => <li key={`caution-${index}`}>{String(item)}</li>)}</ul></> : <p className="quiet-copy">No plan-level cautions were supplied.</p>}</div>
        <div className="issue-list"><h4>Prescription details</h4><div className="session-grid session-grid--agenda">{proposalWorkouts?.map((value, index) => { const workout = asRecord(value); const cautions = Array.isArray(workout.cautions) ? workout.cautions : []; return <article className="session-card" key={String(workout.id ?? index)}><div className="session-card-top"><div><p className="eyebrow">{String(workout.kind ?? "session")} · {String(workout.scheduledDate ?? "—")}</p><h4>{String(workout.title ?? "Planned session")}</h4></div><span className="status-chip">{String(workout.durationMinutes ?? 0)} min</span></div><p><strong>Purpose:</strong> {String(workout.purpose ?? "—")}</p><p><strong>Prescription:</strong> {String(workout.prescription ?? "—")}</p><dl><div><dt>Start</dt><dd>{String(workout.startTime ?? "Flexible")}</dd></div><div><dt>Intensity</dt><dd>{workout.intensityRpe ? `RPE ${String(workout.intensityRpe)}` : "Not specified"}</dd></div><div><dt>Distance</dt><dd>{workout.distanceMeters ? `${Number(workout.distanceMeters) / 1000} km` : "Not specified"}</dd></div><div><dt>Cautions</dt><dd>{cautions.length > 0 ? cautions.map(String).join("; ") : "None supplied"}</dd></div></dl></article>; })}</div></div>
        <div className="issue-list"><h4>{proposalReview.comparedActivePlanId ? `Changes from active plan v${String(proposalReview.comparedActivePlanVersion ?? "")}` : "Activation impact"}</h4><ul>{materialDifferences.map((value, index) => { const difference = asRecord(value); return <li key={`${String(difference.field ?? "difference")}-${index}`}><strong>{String(difference.change ?? "changed")}:</strong> {String(difference.summary ?? "Review this material difference.")}</li>; })}</ul></div>
        <div className="coach-actions"><button className="button button-primary" type="button" onClick={() => setDecision("approve")}>Review and approve</button><button className="button button-secondary" type="button" onClick={() => setDecision("reject")}>Reject draft</button></div>
      </div> : null}
    </section>
    </div> : null}
    <section className="coach-panel" aria-labelledby="plan-history-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Immutable record</p><h3 id="plan-history-heading">Approved plan version history</h3></div><span className="status-chip">{planHistory.length} version{planHistory.length === 1 ? "" : "s"}</span></div>
      {onlineMode ? <p className="quiet-copy">Open any inactive approved version below and choose <strong>Make this approved plan active</strong>. A new coaching version appears here only after its normal approval and publication.</p> : null}
      <StatusLine state={activationState} message={activationMessage} />
      {historyState === "loading" ? <StatusLine state="loading" message={historyMessage} /> : null}
      {historyState === "error" ? <div className="history-error" role="alert"><p>{historyMessage}</p><button className="button button-secondary" type="button" onClick={() => void loadPlanHistory()}>Retry version history</button></div> : null}
      {historyState === "success" && planHistory.length === 0 ? <p className="quiet-copy">No approved plan versions yet. Imported drafts never appear here before approval.</p> : null}
      {historyState === "success" && planHistory.length > 0 ? <div className="plan-history-list">{planHistory.map((plan, index) => {
        const approval = asRecord(plan.approval);
        const workouts = Array.isArray(plan.workouts) ? plan.workouts : [];
        const isActive = plan.status === "active" || plan.id === activePlan?.id;
        const isLatestApproved = index === 0;
        const contentVersion = coachingContentVersion(plan);
        return <details className="plan-version" key={String(plan.id)} open={isActive}>
          <summary><span><strong>{contentVersion ? `Coaching version ${contentVersion}` : `Approved record ${String(plan.version ?? 1)}`}</strong><small>Approval record {String(plan.version ?? 1)} · {String(plan.startsOn ?? "—")} to {String(plan.endsOn ?? "—")}</small></span><span className={`status-chip${isActive ? " status-chip--active" : ""}`}>{isActive ? "Active" : isLatestApproved ? "Latest approved" : "Retired"}</span></summary>
          <div className="plan-version-details"><dl className="summary-list"><div><dt>Status</dt><dd>{isActive ? "Active approved version" : "Available approved version"}</dd></div><div><dt>Coaching version</dt><dd>{contentVersion ?? "Not supplied"}</dd></div><div><dt>Approval record</dt><dd>{String(plan.version ?? 1)}</dd></div><div><dt>Goal snapshot</dt><dd>{String(plan.goalId ?? "—")}</dd></div><div><dt>Sessions</dt><dd>{workouts.length}</dd></div></dl>
            <p><strong>Approved rationale:</strong> {String(approval.rationale ?? "No rationale supplied.")}</p>
            {onlineMode && !isActive ? <div className="coach-actions"><button className="button button-primary" type="button" disabled={activationState === "loading"} onClick={() => setActivationCandidate(plan)}>Make this approved plan active</button><span className="quiet-copy">No session prescription will be changed.</span></div> : null}
            <div className="plan-history-sessions">{workouts.map((value, index) => { const workout = asRecord(value); return <article key={String(workout.id ?? index)}><h4>{String(workout.title ?? "Approved session")}</h4><p>{String(workout.prescription ?? "No prescription supplied.")}</p><small>{String(workout.scheduledDate ?? "—")} · {String(workout.durationMinutes ?? "—")} min</small></article>; })}</div>
          </div>
        </details>;
      })}</div> : null}
    </section>
    {activationCandidate ? <div className="coach-dialog-backdrop"><section className="coach-dialog" role="alertdialog" aria-modal="true" aria-labelledby="plan-activation-title"><h3 id="plan-activation-title">Make {coachingPlanLabel(activationCandidate).toLowerCase()} active?</h3><p>{activePlan ? `This will retire ${coachingPlanLabel(activePlan).toLowerCase()} and make the selected approved plan the source for Today and Calendar.` : "This will make the selected approved plan the source for Today and Calendar."} The approved workouts will not be edited or adapted.</p><div className="coach-actions"><button autoFocus className="button button-primary" type="button" disabled={activationState === "loading"} onClick={() => void confirmPlanActivation()}>{activationState === "loading" ? "Making active…" : "Make active"}</button><button className="button button-secondary" type="button" disabled={activationState === "loading"} onClick={() => setActivationCandidate(null)}>Cancel</button></div></section></div> : null}
    {decision ? <div className="coach-dialog-backdrop"><section className="coach-dialog" role="alertdialog" aria-modal="true" aria-labelledby="plan-decision-title"><h3 id="plan-decision-title">{decision === "approve" ? "Activate this plan version?" : "Reject this draft?"}</h3><p>{decision === "approve" ? activePlan ? `This explicitly settles the proposed goal, retires active plan v${String(activePlan.version ?? 1)}, and activates the new immutable version.` : "This explicitly settles the proposed goal and makes this immutable plan version active." : "The draft will be durably rejected. Your current active goal and plan, if any, will not change."}</p>{decision === "approve" && historyIsStale ? <label className="checkbox-field"><input autoFocus type="checkbox" checked={acknowledgeStale} onChange={(event) => setAcknowledgeStale(event.target.checked)} /><span>I reviewed the stale-history warning and explicitly approve using this proposal.</span></label> : null}<div className="coach-actions"><button autoFocus={!historyIsStale} disabled={decision === "approve" && historyIsStale && !acknowledgeStale} className={decision === "approve" ? "button button-primary" : "button button-secondary"} type="button" onClick={() => void confirmDecision()}>Confirm {decision}</button><button className="button button-secondary" type="button" onClick={() => { setDecision(null); setAcknowledgeStale(false); }}>Cancel</button></div></section></div> : null}
  </CoachShell>;
}

type SessionAmendDraft = {
  session: CalendarSessionView;
  title: string;
  purpose: string;
  prescription: string;
  durationMinutes: string;
  distanceMeters: string;
  intensityRpe: string;
  startTime: string;
  cautions: string;
  reason: string;
};

function amendmentDraft(session: CalendarSessionView): SessionAmendDraft {
  return {
    session,
    title: session.title,
    purpose: session.purpose,
    prescription: session.prescription,
    durationMinutes: String(session.durationMinutes),
    distanceMeters: session.distanceMeters === undefined ? "" : String(session.distanceMeters),
    intensityRpe: session.intensityRpe === undefined ? "" : String(session.intensityRpe),
    startTime: session.startTime ?? "",
    cautions: session.cautions.join("\n"),
    reason: "",
  };
}

function sessionAmendmentChanges(draft: SessionAmendDraft): JsonRecord {
  const current = draft.session;
  const cautions = draft.cautions.split("\n").map((value) => value.trim()).filter(Boolean);
  const durationMinutes = Number(draft.durationMinutes);
  const distanceMeters = draft.distanceMeters === "" ? null : Number(draft.distanceMeters);
  const intensityRpe = draft.intensityRpe === "" ? null : Number(draft.intensityRpe);
  const changes: JsonRecord = {};
  if (draft.title.trim() !== current.title) changes.title = draft.title.trim();
  if (draft.purpose.trim() !== current.purpose) changes.purpose = draft.purpose.trim();
  if (draft.prescription.trim() !== current.prescription) changes.prescription = draft.prescription.trim();
  if (durationMinutes !== current.durationMinutes) changes.durationMinutes = durationMinutes;
  if (distanceMeters !== (current.distanceMeters ?? null)) changes.distanceMeters = distanceMeters;
  if (intensityRpe !== (current.intensityRpe ?? null)) changes.intensityRpe = intensityRpe;
  if ((draft.startTime || null) !== (current.startTime ?? null)) changes.startTime = draft.startTime || null;
  if (JSON.stringify(cautions) !== JSON.stringify(current.cautions)) changes.cautions = cautions;
  return changes;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(secondsPerKm: number) {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function CalendarPage({ initialDate, focusSessionId, onlineMode = false }: { initialDate?: string; focusSessionId?: string; onlineMode?: boolean }) {
  const [planTimezone, setPlanTimezone] = useState(timezoneDefault);
  const today = localDateInTimezone(planTimezone);
  const [anchorDate, setAnchorDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initialDate ?? "") ? initialDate! : today);
  const [view, setView] = useState<"week" | "agenda">("week");
  const [sessions, setSessions] = useState<CalendarSessionView[]>([]);
  const [historicalSessions, setHistoricalSessions] = useState<HistoricalCalendarSessionView[]>([]);
  const [activities, setActivities] = useState<CalendarActivityView[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(focusSessionId ?? null);
  const [state, setState] = useState<RequestState>("loading");
  const [message, setMessage] = useState<string>();
  const [staleMessage, setStaleMessage] = useState<string>();
  const [focusMessage, setFocusMessage] = useState<string>();
  const [planRange, setPlanRange] = useState<{ startsOn: string; endsOn: string } | null>(null);
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [actionMessage, setActionMessage] = useState<string>();
  const [amendDraft, setAmendDraft] = useState<SessionAmendDraft | null>(null);
  const focusHandled = useRef<string | null>(null);
  const [pending, setPending] = useState<{
    session: CalendarSessionView;
    operation: "reschedule" | "skip" | "restore";
    date?: string;
    reason: string;
    warnings: string[];
    blocksConfirmation?: boolean;
  } | null>(null);
  const pendingLauncherRef = useRef<HTMLElement | null>(null);
  const amendmentLauncherRef = useRef<HTMLElement | null>(null);
  const pendingModal = useModalKeyboard<HTMLFormElement>(Boolean(pending), () => {
    if (actionState !== "loading") setPending(null);
  }, pendingLauncherRef);
  const amendmentModal = useModalKeyboard<HTMLElement>(Boolean(amendDraft), () => {
    if (actionState !== "loading") setAmendDraft(null);
  }, amendmentLauncherRef);
  const range = weekRange(anchorDate);

  async function loadCalendar(successMessage?: string) {
    setState("loading"); setMessage("Loading the approved schedule…");
    try {
      const [response, active, todayContext] = await Promise.all([
        apiRequest(`/api/v1/coaching/calendar?from=${range.from}&to=${range.to}`),
        apiRequest("/api/v1/coaching/plans/active").catch(() => null),
        apiRequest("/api/v1/coaching/today").catch(() => null),
      ]);
      const activeRecord = asRecord(active);
      const startsOn = String(activeRecord.startsOn ?? "");
      const endsOn = String(activeRecord.endsOn ?? "");
      const timezone = String(activeRecord.timezone ?? timezoneDefault);
      setPlanTimezone(timezone);
      setPlanRange(/^\d{4}-\d{2}-\d{2}$/.test(startsOn) && /^\d{4}-\d{2}-\d{2}$/.test(endsOn) ? { startsOn, endsOn } : null);
      const stale = asRecord(asRecord(todayContext).stale);
      setStaleMessage(stale.isStale === true ? String(stale.reason ?? "The approved schedule was built from older activity history.") : undefined);
      const normalizedSessions = normalizeCalendarSessions(response);
      setSessions(normalizedSessions);
      setHistoricalSessions(normalizeHistoricalCalendarSessions(response));
      setActivities(normalizeCalendarActivities(response));
      setSelectedSessionId((current) => normalizedSessions.some((session) => session.id === current)
        ? current
        : normalizedSessions.find((session) => session.id === focusSessionId)?.id ?? normalizedSessions[0]?.id ?? null);
      setState("success"); setMessage(successMessage);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Calendar could not be loaded."); }
  }
  useEffect(() => { void loadCalendar(); }, [range.from, range.to]);

  useEffect(() => {
    const narrowCalendar = window.matchMedia("(max-width: 1199px)");
    if (narrowCalendar.matches) setView("agenda");
    const useAgenda = (event: MediaQueryListEvent) => { if (event.matches) setView("agenda"); };
    narrowCalendar.addEventListener("change", useAgenda);
    return () => narrowCalendar.removeEventListener("change", useAgenda);
  }, []);

  useEffect(() => {
    if (state !== "success" || !focusSessionId) return;
    if (sessions.some((session) => session.id === focusSessionId) && selectedSessionId !== focusSessionId) {
      setSelectedSessionId(focusSessionId);
      return;
    }
    const focusKey = `${range.from}:${focusSessionId}`;
    if (focusHandled.current === focusKey) return;
    const target = document.getElementById(`session-${focusSessionId}`);
    if (!target) {
      setFocusMessage("The linked session was not found in this week. Check that the link date matches the approved session.");
      focusHandled.current = focusKey;
      return;
    }
    setFocusMessage(undefined);
    focusHandled.current = focusKey;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusSessionId, range.from, selectedSessionId, sessions, state, view]);

  function moveWeek(days: number) {
    const date = new Date(`${anchorDate}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); setAnchorDate(date.toISOString().slice(0, 10));
  }

  async function confirmEdit() {
    if (!pending) return;
    const reason = pending.reason.trim();
    if (!reason) { setActionState("error"); setActionMessage("Give a reason before confirming this change."); return; }
    setActionState("loading"); setActionMessage(`Saving ${pending.operation}…`);
    try {
      await apiRequest(`/api/v1/coaching/calendar/sessions/${encodeURIComponent(pending.session.id)}/edits`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          operation: pending.operation, expectedRevision: pending.session.revision,
          reason,
          ...(pending.operation === "reschedule" ? { date: pending.date } : {}),
        }),
      });
      setPending(null); setActionState("success"); setActionMessage("Change saved with its reason. The approved source remains unchanged.");
      await loadCalendar();
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      setPending(null); setActionState("error");
      setActionMessage(code === "REVISION_CONFLICT" || code === "CONFLICT"
        ? "This session changed elsewhere. Reload the calendar and review its latest values before trying again."
        : error instanceof Error ? error.message : "Calendar edit could not be saved.");
    }
  }

  async function confirmAmendment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!amendDraft) return;
    const reason = amendDraft.reason.trim();
    if (!reason) { setActionState("error"); setActionMessage("Give a reason before saving this amendment."); return; }
    const current = amendDraft.session;
    const changes = sessionAmendmentChanges(amendDraft);
    if (Object.keys(changes).length === 0) {
      setActionState("error"); setActionMessage("Change at least one session detail before saving."); return;
    }
    setActionState("loading"); setActionMessage("Saving the reasoned session amendment…");
    try {
      await apiRequest(`/api/v1/coaching/calendar/sessions/${encodeURIComponent(current.id)}/edits`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "amend", expectedRevision: current.revision, reason, changes }),
      });
      setAmendDraft(null); setActionState("success");
      setActionMessage("Session amended. The approved source and your reason are preserved for later coaching review.");
      await loadCalendar();
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      setAmendDraft(null); setActionState("error");
      setActionMessage(code === "REVISION_CONFLICT" || code === "CONFLICT"
        ? "This session changed elsewhere. Reload the calendar and review its latest values before trying again."
        : error instanceof Error ? error.message : "The session amendment could not be saved.");
    }
  }

  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${range.from}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const firstEditableDate = (() => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  })();
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? null;

  function reviewMove(session: CalendarSessionView, launcher: HTMLElement) {
    const input = document.getElementById(`move-${session.id}`) as HTMLInputElement | null;
    const date = input?.value || session.effectiveDate;
    const rangeWarning = planRange
      ? outOfPlanRangeWarning(date, planRange)
      : "The approved plan range could not be verified. Retry the calendar before moving this session.";
    const warnings = [sameDayConflictWarning(sessions, session.id, date), rangeWarning]
      .filter((warning): warning is string => Boolean(warning));
    pendingLauncherRef.current = launcher;
    setPending({ session, operation: "reschedule", date, reason: "", warnings, blocksConfirmation: Boolean(rangeWarning) });
  }

  function renderSessionCard(session: CalendarSessionView) {
    const isToday = session.effectiveDate === today;
    const isFuture = canAmendFutureSession(session, today);
    const original = session.original;
    const originalTarget = [
      original.distanceMeters ? `${Number((original.distanceMeters / 1000).toFixed(2))} km` : null,
      original.durationMinutes ? `${original.durationMinutes} min` : null,
      original.intensityRpe ? `RPE ${original.intensityRpe}` : null,
    ].filter(Boolean).join(" · ") || "Follow the approved prescription";
    return <article className={`session-card${isToday ? " session-card--today" : ""}`} id={`session-${session.id}`} tabIndex={-1} key={session.id}>
      <div className="session-card-top"><div><p className="eyebrow">{session.kind.replace("_", " ")} · {session.status}</p>{isToday ? <span className="today-marker">Today</span> : null}</div><time dateTime={session.effectiveDate}>{formatCoachingDate(session.effectiveDate)}</time></div>
      <h3>{session.title}</h3><p><strong>Current purpose:</strong> {session.purpose}</p>
      <p className="session-prescription"><strong>Current prescription:</strong> {session.prescription}</p>
      <p><strong>Current target:</strong> {formatSessionTarget(session)}</p>
      <p className="adjustment-cue">{formatAdjustmentCue(session)}</p>
      <dl>
        <div><dt>Start</dt><dd>{session.startTime ?? "Flexible"}</dd></div>
        <div><dt>Prescribed date</dt><dd>{formatCoachingDate(session.prescribedDate)}</dd></div>
        <div><dt>Effective date</dt><dd>{formatCoachingDate(session.effectiveDate)}</dd></div>
        <div><dt>Cautions</dt><dd>{session.cautions.length > 0 ? session.cautions.join("; ") : "None supplied"}</dd></div>
      </dl>
      <details className="session-source"><summary>Approved source prescription</summary><div><strong>{original.title}</strong><p>{original.purpose}</p><p>{original.prescription}</p><small>{originalTarget} · prescribed {formatCoachingDate(original.scheduledDate, planTimezone)}</small></div></details>
      {session.amendments.length > 0 ? <details className="session-history"><summary>Change history ({session.amendments.length})</summary><ol>{session.amendments.map((amendment) => <li key={amendment.id}><strong>{changeHistoryLabel(amendment)}</strong><span>{amendment.reason}</span>{amendment.changedAt ? <time dateTime={amendment.changedAt}>{new Date(amendment.changedAt).toLocaleString("en-ZA", { timeZone: planTimezone })}</time> : null}</li>)}</ol><p>No AI review is claimed; this history will be available in the next coaching context.</p></details> : null}
      {session.warnings.map((warning) => <p className="coach-status coach-status--error" role="alert" key={warning}>{warning}</p>)}
      {isFuture ? <div className="session-actions">
        <label><span>Move to date</span><input type="date" min={firstEditableDate} defaultValue={session.effectiveDate} id={`move-${session.id}`} /></label>
        <button className="button button-secondary" type="button" onClick={(event) => reviewMove(session, event.currentTarget)}>Review move</button>
        <button className="button button-secondary" type="button" onClick={(event) => { amendmentLauncherRef.current = event.currentTarget; setActionState("idle"); setActionMessage(undefined); setAmendDraft(amendmentDraft(session)); }}>Amend session</button>
        {session.status === "skipped"
          ? <button className="button button-secondary" type="button" onClick={(event) => { pendingLauncherRef.current = event.currentTarget; setPending({ session, operation: "restore", reason: "", warnings: [] }); }}>Restore</button>
          : <button className="button button-secondary" type="button" onClick={(event) => { pendingLauncherRef.current = event.currentTarget; setPending({ session, operation: "skip", reason: "", warnings: [] }); }}>Skip</button>}
      </div> : <p className="adjustment-cue">Past and current-day sessions are read-only. Future changes belong in Calendar.</p>}
    </article>;
  }

  function renderSessionSummary(session: CalendarSessionView) {
    const isToday = session.effectiveDate === today;
    const selected = session.id === selectedSession?.id;
    return <button className={`calendar-session-summary${selected ? " calendar-session-summary--selected" : ""}`} type="button" aria-pressed={selected} aria-controls="calendar-selected-session" onClick={() => setSelectedSessionId(session.id)} key={session.id}>
      <span className="calendar-summary-top"><span>{session.kind.replace("_", " ")}</span><span>{session.status}</span></span>
      <strong>{session.title}</strong>
      <span>{formatSessionTarget(session)}</span>
      <small>{session.amendments.length > 0 ? `${session.amendments.length} reasoned change${session.amendments.length === 1 ? "" : "s"}` : session.prescribedDate !== session.effectiveDate ? "Date adjusted" : "Approved schedule"}{isToday ? " · Today" : ""}</small>
    </button>;
  }

  function renderHistoricalSummary(session: HistoricalCalendarSessionView) {
    return <article className="calendar-record-summary calendar-record-summary--historical" key={`historical-summary-${session.planId}-${session.id}`}>
      <p className="eyebrow">{session.kind.replace("_", " ")} · historical v{session.planVersion}</p><strong>{session.title}</strong><span>{formatSessionTarget(session)}</span><small>Read-only plan record</small>
    </article>;
  }

  function renderActivitySummary(activity: CalendarActivityView) {
    const metrics = [
      activity.distanceMeters > 0 ? `${Number((activity.distanceMeters / 1000).toFixed(2))} km` : null,
      activity.elapsedTimeSeconds > 0 ? formatDuration(activity.elapsedTimeSeconds) : null,
    ].filter(Boolean).join(" · ");
    return <article className="calendar-record-summary calendar-record-summary--actual" key={`activity-summary-${activity.id}`}>
      <p className="eyebrow">{activity.sport.replace("_", " ")} · recorded</p><strong>{activity.title}</strong><span>{metrics || "Recorded run"}</span><small>Activity record · no completion inferred</small>
    </article>;
  }

  function renderHistoricalSessionCard(session: HistoricalCalendarSessionView) {
    return <article className="session-card session-card--historical" id={`historical-session-${session.planId}-${session.id}`} tabIndex={-1} key={`historical-${session.planId}-${session.id}`}>
      <div className="session-card-top"><p className="eyebrow">{session.kind.replace("_", " ")} · historical plan · v{session.planVersion}</p><time dateTime={session.scheduledDate}>{formatCoachingDate(session.scheduledDate)}</time></div>
      <h3>{session.title}</h3>
      <p><strong>Planned purpose:</strong> {session.purpose}</p>
      <p className="session-prescription"><strong>Planned prescription:</strong> {session.prescription}</p>
      <p><strong>Planned target:</strong> {formatSessionTarget(session)}</p>
      <p className="adjustment-cue">Historical planned session · read-only.</p>
    </article>;
  }

  function renderActivityCard(activity: CalendarActivityView, sameDayPlans: Array<CalendarSessionView | HistoricalCalendarSessionView>) {
    const metrics = [
      activity.distanceMeters > 0 ? `${Number((activity.distanceMeters / 1000).toFixed(2))} km` : null,
      activity.elapsedTimeSeconds > 0 ? formatDuration(activity.elapsedTimeSeconds) : null,
      activity.averagePaceSecondsPerKm > 0 ? `${formatPace(activity.averagePaceSecondsPerKm)}/km` : null,
      activity.elevationGainMeters > 0 ? `+${Math.round(activity.elevationGainMeters)} m` : null,
    ].filter(Boolean).join(" · ");
    return <article className="session-card session-card--actual" id={`activity-${activity.id}`} tabIndex={-1} key={`activity-${activity.id}`}>
      <div className="session-card-top"><p className="eyebrow">{activity.sport.replace("_", " ")} · recorded</p><time dateTime={activity.localDate}>{formatCoachingDate(activity.localDate)}</time></div>
      <h3>{activity.title}</h3>
      <p><strong>Actual workout:</strong> {metrics || "Recorded run"}</p>
      {sameDayPlans.length === 0
        ? <p className="adjustment-cue">No planned session for this activity.</p>
        : <details className="session-source"><summary>Plan comparison ({sameDayPlans.length})</summary><div><p>Same-day plan records are shown below without inferring that any plan was completed.</p>{sameDayPlans.map((session) => <section className="calendar-comparison" key={`${"planId" in session ? session.planId : "active"}-${session.id}`}><strong>{session.title}{"planVersion" in session ? ` · historical plan v${session.planVersion}` : " · active plan"}</strong><p>{formatSessionTarget(session)}</p><p>{session.prescription}</p></section>)}</div></details>}
    </article>;
  }

  return <CoachShell page="calendar" title="Calendar" subtitle={onlineMode ? "Owner-managed future sessions with preserved approved sources" : "Approved sessions and reasoned, auditable future changes"} meta={`${formatCoachingDate(range.from, planTimezone)} – ${formatCoachingDate(range.to, planTimezone)} · ${planTimezone}`}>
    <section className="coach-panel calendar-controls" aria-label="Calendar controls"><div className="coach-actions"><button className="button button-secondary" type="button" onClick={() => moveWeek(-7)}>Previous week</button><button className="button button-secondary" type="button" onClick={() => setAnchorDate(today)}>Today</button><button className="button button-secondary" type="button" onClick={() => moveWeek(7)}>Next week</button></div><div className="segmented" aria-label="Calendar view"><button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button><button type="button" aria-pressed={view === "agenda"} onClick={() => setView("agenda")}>Agenda</button></div></section>
    {state === "loading" ? <StatusLine state="loading" message={message} /> : null}
    {state === "error" ? <section className="coach-panel calendar-state-panel calendar-state-panel--error" role="alert"><h3>Calendar could not be loaded</h3><p>{message ?? "The approved schedule is temporarily unavailable."}</p><button className="button button-primary" type="button" onClick={() => void loadCalendar()}>Retry calendar</button></section> : null}
    {state === "success" && message ? <StatusLine state="success" message={message} /> : null}
    <StatusLine state={actionState} message={actionMessage} />
    {state === "success" && staleMessage ? <section className="coach-panel calendar-state-panel calendar-state-panel--stale" role="status"><h3>Schedule context needs review</h3><p>{staleMessage} The approved plan has not been changed.</p><Link className="text-link" href="/dashboard/plan">Review Plan</Link></section> : null}
    {state === "success" && focusMessage ? <p className="coach-status coach-status--error" role="alert">{focusMessage}</p> : null}
    {state === "success" && sessions.length + historicalSessions.length + activities.length === 0
      ? <section className="coach-panel coach-empty"><h3>No runs or planned sessions this week</h3><p>Use the week controls to inspect another date range, or import and sync your activity history.</p><Link className="text-link" href="/dashboard/activities">Open Activities</Link></section>
      : state === "success" && view === "week" ? <div className="calendar-week-layout"><section className="calendar-week" aria-label="Seven-day training week">
        {weekDates.map((date) => { const daySessions = sessions.filter((session) => session.effectiveDate === date); const dayHistoricalSessions = historicalSessions.filter((session) => session.scheduledDate === date); const dayActivities = activities.filter((activity) => activity.localDate === date); const isToday = date === today; return <section className={`calendar-day${isToday ? " calendar-day--today" : ""}`} aria-label={`${formatCoachingDate(date)}${isToday ? ", today" : ""}`} key={date}>
          <header><p className="eyebrow">{new Intl.DateTimeFormat("en-ZA", { weekday: "long", timeZone: planTimezone }).format(new Date(`${date}T12:00:00.000Z`))}</p><time dateTime={date}>{formatCoachingDate(date, planTimezone)}</time>{isToday ? <span className="today-marker">Today</span> : null}</header>
          <div className="calendar-day-sessions">{daySessions.length + dayHistoricalSessions.length + dayActivities.length > 0 ? <>{dayActivities.map(renderActivitySummary)}{daySessions.map(renderSessionSummary)}{dayHistoricalSessions.map(renderHistoricalSummary)}</> : <p className="calendar-day-empty">No run or planned session</p>}</div>
        </section>; })}
      </section>{selectedSession ? <aside className="calendar-selected-detail" id="calendar-selected-session" aria-label={`Selected session: ${selectedSession.title}`}><div className="calendar-detail-heading"><div><p className="eyebrow">Selected session</p><h3>Session detail</h3></div><span className="status-chip">{selectedSession.status}</span></div>{renderSessionCard(selectedSession)}</aside> : null}{activities.length + historicalSessions.length > 0 ? <details className="coach-panel calendar-supporting-records"><summary>Recorded and historical context ({activities.length + historicalSessions.length})</summary><div className="session-grid session-grid--agenda">{[...activities].sort((left, right) => left.localDate.localeCompare(right.localDate)).map((activity) => renderActivityCard(activity, [...sessions.filter((session) => session.effectiveDate === activity.localDate), ...historicalSessions.filter((session) => session.scheduledDate === activity.localDate)]))}{historicalSessions.map(renderHistoricalSessionCard)}</div></details> : null}</div> : state === "success" ? <section className="session-grid session-grid--agenda" aria-label="Agenda training schedule">{[...activities].sort((left, right) => left.localDate.localeCompare(right.localDate)).map((activity) => renderActivityCard(activity, [...sessions.filter((session) => session.effectiveDate === activity.localDate), ...historicalSessions.filter((session) => session.scheduledDate === activity.localDate)]))}{sessions.map(renderSessionCard)}{historicalSessions.map(renderHistoricalSessionCard)}</section> : null}
    {pending ? <div className="coach-dialog-backdrop"><form ref={pendingModal.dialogRef} onKeyDown={pendingModal.onKeyDown} onSubmit={(event) => { event.preventDefault(); void confirmEdit(); }} className="coach-dialog" role="alertdialog" aria-modal="true" aria-labelledby="calendar-edit-title">
      <h3 id="calendar-edit-title">Confirm {pending.operation}</h3>
      <p><strong>{pending.session.title}</strong>{pending.date ? ` will move from ${pending.session.effectiveDate} to ${pending.date}.` : ` will be marked ${pending.operation === "skip" ? "skipped" : "upcoming"}.`} Its prescribed date remains {pending.session.prescribedDate}.</p>
      {pending.warnings.length > 0 ? <div className="coach-status coach-status--error" role="alert"><strong>Review before confirming</strong><ul>{pending.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
      <label className="reason-field" htmlFor="calendar-change-reason"><span>Reason for this change</span><textarea autoFocus id="calendar-change-reason" required maxLength={500} rows={3} value={pending.reason} onChange={(event) => setPending({ ...pending, reason: event.target.value })} aria-describedby="calendar-change-reason-help" /><small id="calendar-change-reason-help">Required · 1–500 characters · saved for later coaching review</small></label>
      <div className="coach-actions"><button disabled={pending.blocksConfirmation || actionState === "loading"} className="button button-primary" type="submit">{actionState === "loading" ? "Saving…" : "Confirm change"}</button><button className="button button-secondary" type="button" disabled={actionState === "loading"} onClick={() => setPending(null)}>Cancel</button></div>
    </form></div> : null}
    {amendDraft ? <div className="coach-dialog-backdrop"><section ref={amendmentModal.dialogRef} onKeyDown={amendmentModal.onKeyDown} className="coach-dialog coach-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="session-amend-title"><form className="coach-form coach-form-grid" onSubmit={(event) => void confirmAmendment(event)}>
      <div className="field-wide"><h3 id="session-amend-title">Amend future session</h3><p>Update the working session for <strong>{amendDraft.session.title}</strong>. Its approved source prescription remains unchanged.</p></div>
      <label><span>Title</span><input autoFocus required maxLength={200} value={amendDraft.title} onChange={(event) => setAmendDraft({ ...amendDraft, title: event.target.value })} /></label>
      <label><span>Start time</span><input type="time" value={amendDraft.startTime} onChange={(event) => setAmendDraft({ ...amendDraft, startTime: event.target.value })} /></label>
      <label className="field-wide"><span>Purpose</span><textarea required maxLength={1000} rows={2} value={amendDraft.purpose} onChange={(event) => setAmendDraft({ ...amendDraft, purpose: event.target.value })} /></label>
      <label className="field-wide"><span>Prescription</span><textarea required maxLength={4000} rows={4} value={amendDraft.prescription} onChange={(event) => setAmendDraft({ ...amendDraft, prescription: event.target.value })} /></label>
      <label><span>Duration (minutes)</span><input required type="number" min={amendDraft.session.kind === "rest" ? 0 : 1} max={1440} value={amendDraft.durationMinutes} onChange={(event) => setAmendDraft({ ...amendDraft, durationMinutes: event.target.value })} /></label>
      <label><span>Distance (metres, optional)</span><input type="number" min={1} max={500000} value={amendDraft.distanceMeters} onChange={(event) => setAmendDraft({ ...amendDraft, distanceMeters: event.target.value })} /></label>
      <label><span>RPE (optional)</span><input type="number" min={1} max={10} value={amendDraft.intensityRpe} onChange={(event) => setAmendDraft({ ...amendDraft, intensityRpe: event.target.value })} /></label>
      <label className="field-wide"><span>Cautions (one per line)</span><textarea rows={3} value={amendDraft.cautions} onChange={(event) => setAmendDraft({ ...amendDraft, cautions: event.target.value })} /></label>
      <label className="field-wide" htmlFor="session-amend-reason"><span>Reason for this amendment</span><textarea id="session-amend-reason" required maxLength={500} rows={3} value={amendDraft.reason} onChange={(event) => setAmendDraft({ ...amendDraft, reason: event.target.value })} aria-describedby="session-amend-reason-help" /><small id="session-amend-reason-help">Required · saved with the before and after values for later coaching review</small></label>
      <div className="coach-actions field-wide"><button className="button button-primary" disabled={actionState === "loading" || amendDraft.reason.trim().length === 0 || Object.keys(sessionAmendmentChanges(amendDraft)).length === 0} type="submit">{actionState === "loading" ? "Saving…" : "Save reasoned amendment"}</button><button className="button button-secondary" disabled={actionState === "loading"} type="button" onClick={() => setAmendDraft(null)}>Cancel</button></div>
    </form></section></div> : null}
  </CoachShell>;
}

export function SettingsPage() {
  const [enabled, setEnabled] = useState(true);
  const [localTime, setLocalTime] = useState("06:30");
  const [timezone, setTimezone] = useState(timezoneDefault);
  const [state, setState] = useState<RequestState>("loading");
  const [message, setMessage] = useState<string>();
  const [handoff, setHandoff] = useState("");
  const [handoffStatus, setHandoffStatus] = useState("Not generated");
  const [externalStatus, setExternalStatus] = useState<ReminderExternalStatus>("not_configured");
  const [externalReference, setExternalReference] = useState("");
  const [automationState, setAutomationState] = useState<RequestState>("idle");
  const [automationMessage, setAutomationMessage] = useState<string>();
  const [contextReference, setContextReference] = useState("No published coaching context found");

  useEffect(() => {
    void Promise.all([
      apiRequest("/api/v1/coaching/reminder-preferences"),
      apiRequest("/api/v1/coaching/context/current").catch(() => null),
    ]).then(([response, contextResponse]) => {
      const persistedExternalStatus = normalizeReminderExternalStatus(response.externalStatus);
      const context = asRecord(contextResponse);
      const envelope = asRecord(context.context ?? context.snapshot ?? context);
      const artifact = asRecord(envelope.artifact);
      const reference = context.exchangeReference ?? context.envelopePath ?? context.jsonPath
        ?? envelope.exchangeReference ?? envelope.envelopePath ?? envelope.jsonPath
        ?? (artifact.id ? `Coach Exchange/Generated/coaching-context.v1.json · ${String(artifact.id)}` : undefined);
      setEnabled(response.enabled !== false); setLocalTime(String(response.localTime ?? "06:30")); setTimezone(String(response.timezone ?? timezoneDefault));
      setExternalStatus(persistedExternalStatus); setHandoffStatus(handoffStatusLabel(persistedExternalStatus));
      if (typeof response.externalReference === "string") setExternalReference(response.externalReference);
      if (reference) setContextReference(String(reference));
      setState("success");
    }).catch(() => { setState("idle"); setMessage("Using Phase 1 defaults until you save."); });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("loading"); setMessage("Saving app preferences…");
    try {
      const response = await apiRequest("/api/v1/coaching/reminder-preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled, localTime, timezone, channel: "codex_task", motivationalContext: true }) });
      const persistedExternalStatus = normalizeReminderExternalStatus(response.externalStatus);
      setExternalStatus(persistedExternalStatus); setHandoffStatus(handoffStatusLabel(persistedExternalStatus));
      setState("success"); setMessage(`App reminder preference saved. ${externalAutomationStatusLabel(persistedExternalStatus)}.`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Preferences could not be saved."); }
  }

  async function generateHandoff() {
    setHandoffStatus("Generating…");
    try {
      const response = await apiRequest("/api/v1/coaching/reminder-handoffs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled, localTime, timezone }) });
      const persistedExternalStatus = normalizeReminderExternalStatus(response.externalStatus);
      setHandoff(String(response.handoff ?? response.instructions ?? response.content ?? "Handoff generated."));
      setExternalStatus(persistedExternalStatus); setHandoffStatus(handoffStatusLabel(persistedExternalStatus));
    } catch (error) { setHandoffStatus(error instanceof Error ? error.message : "Handoff could not be generated"); }
  }

  async function copyHandoff() {
    if (!handoff) return;
    try { await navigator.clipboard.writeText(handoff); setHandoffStatus("Copied · ready to paste into Codex"); }
    catch { setHandoffStatus("Copy unavailable; select the handoff text manually"); }
  }

  async function confirmExternalAutomation(status: "scheduled" | "attention") {
    setAutomationState("loading"); setAutomationMessage(status === "scheduled" ? "Recording your external scheduling confirmation…" : "Recording that external setup needs attention…");
    try {
      const response = await apiRequest("/api/v1/coaching/reminder-handoffs/status", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ externalStatus: status, externalReference: status === "scheduled" ? externalReference.trim() : null }),
      });
      const persistedExternalStatus = normalizeReminderExternalStatus(response.externalStatus);
      setExternalStatus(persistedExternalStatus); setHandoffStatus(handoffStatusLabel(persistedExternalStatus));
      if (typeof response.externalReference === "string") setExternalReference(response.externalReference);
      setAutomationState("success");
      setAutomationMessage(status === "scheduled"
        ? "Recorded as scheduled from your confirmation. The app does not infer or verify external delivery."
        : "External setup is marked as needing attention.");
    } catch (error) {
      setAutomationState("error"); setAutomationMessage(error instanceof Error ? error.message : "External status could not be saved.");
    }
  }

  return <CoachShell page="settings" title="Settings" subtitle="Local coaching preferences and Codex reminder handoff" meta={`${localTime} · ${timezone}`}>
    <section className="coach-panel settings-panel settings-panel--preference" aria-labelledby="reminder-settings-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Reminder preference</p><h3 id="reminder-settings-heading">Daily coaching reminder</h3></div><span className="status-chip">{enabled ? "Enabled" : "Disabled"}</span></div><form className="coach-form coach-form-grid" onSubmit={save}><label className="checkbox-field field-wide"><input disabled={state === "loading"} type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Enable the daily reminder preference</span></label><label><span>Local time</span><input disabled={state === "loading"} type="time" value={localTime} onChange={(event) => setLocalTime(event.target.value)} /></label><label><span>IANA timezone</span><input disabled={state === "loading"} value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label><button className="button button-primary field-wide" disabled={state === "loading"} type="submit">Save preferences</button></form><StatusLine state={state} message={message} /></section>
    <section className="coach-panel settings-panel settings-panel--privacy" aria-labelledby="settings-privacy-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Privacy boundary</p><h3 id="settings-privacy-heading">Structured coaching context only</h3></div><span className="status-chip">Local control</span></div><p>The app shares only the selected structured coaching context used for the handoff. Reminder preferences never scan notes or change an approved plan.</p></section>
    <section className="coach-panel settings-panel settings-panel--operations" aria-labelledby="handoff-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Operations</p><h3 id="handoff-heading">Recurring motivation setup</h3></div><span className="status-chip">{handoffStatus}</span></div><p>Generate a versioned handoff for Codex. The app stores your preference; Codex owns the recurring task. A prepared handoff is not a scheduled reminder.</p><div className="coach-actions"><button className="button button-primary" type="button" onClick={() => void generateHandoff()}>Generate handoff</button><button className="button button-secondary" disabled={!handoff} type="button" onClick={() => void copyHandoff()}>Copy handoff</button></div>{handoff ? <textarea className="handoff-output" aria-label="Generated Codex reminder handoff" readOnly rows={7} value={handoff} /> : null}
      <div className="external-confirmation"><h4>Confirm external setup</h4><p className="field-help">After you create the recurring Codex task, enter its task ID or link and explicitly confirm it here. This records your confirmation; the app does not infer delivery.</p><label><span>External task reference</span><input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Codex task ID or link" /></label><div className="coach-actions"><button className="button button-primary" disabled={automationState === "loading" || externalStatus !== "prepared" || !externalReference.trim()} type="button" onClick={() => void confirmExternalAutomation("scheduled")}>Confirm scheduled externally</button><button className="button button-secondary" disabled={automationState === "loading" || externalStatus === "not_configured" || externalStatus === "disabled"} type="button" onClick={() => void confirmExternalAutomation("attention")}>Mark setup needs attention</button></div><StatusLine state={automationState} message={automationMessage} /></div>
      <dl className="status-list"><div><dt>App preference</dt><dd>{state === "success" ? "Saved" : "Not yet saved"}</dd></div><div><dt>Handoff</dt><dd>{handoffStatus}</dd></div><div><dt>External automation</dt><dd>{externalAutomationStatusLabel(externalStatus)}</dd></div><div><dt>Coaching context</dt><dd className="context-reference">{contextReference}</dd></div></dl></section>
  </CoachShell>;
}
