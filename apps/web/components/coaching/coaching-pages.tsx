"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, TouchEvent as ReactTouchEvent, WheelEvent as ReactWheelEvent, useEffect, useRef, useState } from "react";
import type { ActivityDetail } from "../../../../packages/core/src/contracts/activity";
import { readActivityDetailResponse } from "../../lib/activities-api-client";
import { ActivityRecordContent } from "../activities/activities-shell";
import { DashboardNavigation } from "../dashboard/dashboard-navigation";
import {
  canAmendFutureSession,
  canRecordPastSessionSkip,
  calendarWindowRange,
  calendarActivitiesReadStatus,
  changeHistoryLabel,
  externalAutomationStatusLabel,
  formatAdjustmentCue,
  formatApiErrorDetails,
  formatCoachingDate,
  formatSessionTarget,
  handoffStatusLabel,
  localDateInTimezone,
  normalizeCalendarActivities,
  normalizeCalendarSessions,
  normalizeReminderExternalStatus,
  outOfPlanRangeWarning,
  sameDayConflictWarning,
  weekRange,
  type CalendarSessionView,
  type CalendarActivityView,
  type ReminderExternalStatus,
} from "../../lib/coaching-ui-state";
import "../dashboard/dashboard.css";
import "../activities/activities.css";
import "./coaching-ui.css";
import { ActivePlanOverview } from "./active-plan-overview";
import {
  activePlanApiResponseSchema,
  currentContextApiResponseSchema,
  latestProposalApiResponseSchema,
  planHistoryApiResponseSchema,
  planActivationApiResponseSchema,
  proposalDecisionApiResponseSchema,
  proposalImportApiResponseSchema,
  contextPublishApiResponseSchema,
  reminderPreferencesApiResponseSchema,
} from "../../../../packages/core/src/contracts/coaching";
import { isActionableProposal, isDocumentedActivePlanAbsence, isPrivacyReadFailure, restorationValues, shouldApplyRead } from "../../lib/plan-workflow-state";
import {
  activationRequestBody,
  canSubmitConfirmation,
  conflictMessage,
  decisionRequestBody,
  isPlanConflict,
  uncertainMessage,
  type PlanConfirmation,
  type PlanConfirmationKind,
  type PlanConfirmationSnapshot,
} from "../../lib/plan-confirmation-state";
import { importUploadResponseSchema, type ImportUploadResponse } from "../../../../packages/core/src/contracts/imports";
import { canStartImport, fileImportPresentation } from "../../lib/import-ui-state";
import { readRecoveryContext, recoveryReturnHref, safeRecoveryPath } from "../../lib/recovery-context";
import { externalTaskReference, hasUnsavedReminderChanges, reminderStage, settingsReadError, shouldRecoverBeforeRetry, type ReminderDraft, type SettingsReadState } from "../../lib/settings-workflow-state";

type Page = "plan" | "calendar" | "data-quality" | "settings";
type JsonRecord = Record<string, unknown>;
type RequestState = "idle" | "loading" | "success" | "error";
type PlanWorkflowStage = "setup" | "continue" | "import" | "review";
type CalendarDetail =
  | { kind: "session"; id: string; date: string }
  | { kind: "day"; date: string };
type ActivityDetailState = { status: "loading" | "success" | "error"; activity?: ActivityDetail; error?: string };
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
    const requestError = new Error(details.length > 0 ? `${message}: ${details.join("; ")}` : message) as Error & { code?: string; status?: number };
    requestError.code = typeof error.code === "string" ? error.code : undefined;
    requestError.status = response.status;
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
      <main id="dashboard-main-content" className="dashboard-main" tabIndex={-1} aria-labelledby={titleId}>
        <header className="dashboard-toolbar coaching-toolbar">
          <div><p className="eyebrow">Training workspace</p><h1 id={titleId}>{title}</h1><p>{subtitle}</p></div>
          {meta ? <span className="toolbar-context">{meta}</span> : null}
        </header>
        <section className={`coaching-content coaching-content--${page}`}>{children}</section>
      </main>
    </div>
  );
}

async function planApiRequest<T extends JsonRecord>(url: string, schema: { safeParse(value: unknown): { success: true; data: { data: T } } | { success: false } }, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = asRecord(asRecord(body).error);
    const message = typeof error.message === "string" ? error.message : "The request could not be completed.";
    const details = formatApiErrorDetails(error.details);
    const requestError = new Error(details.length > 0 ? `${message}: ${details.join("; ")}` : message) as Error & { code?: string; status?: number };
    requestError.code = typeof error.code === "string" ? error.code : undefined;
    requestError.status = response.status;
    throw requestError;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const error = new Error("Plan data was received in an unsupported format. Retry this read; no empty plan state was assumed.") as Error & { code?: string; status?: number };
    error.code = "MALFORMED_RESPONSE";
    error.status = response.status;
    throw error;
  }
  return parsed.data.data;
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
  "summary",
  "a[href]",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function dialogFocusableElements(container: HTMLElement | null) {
  return Array.from(container?.querySelectorAll<HTMLElement>(dialogFocusableSelector) ?? []).filter((element) => {
    if (!element.isConnected || element.closest("[inert]") || element.matches(":disabled")) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  });
}

function useModalKeyboard<T extends HTMLElement>(
  open: boolean,
  close: () => void,
  returnFocusRef?: { current: HTMLElement | null },
  fallbackFocus?: () => HTMLElement | null,
) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(close);
  const requestedCloseFocus = useRef<(() => HTMLElement | null) | null>(null);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    requestedCloseFocus.current = null;
    const returnTarget = returnFocusRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const frame = window.requestAnimationFrame(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>("[autofocus]")
        ?? dialogFocusableElements(dialogRef.current)[0]
        ?? dialogRef.current;
      target?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.requestAnimationFrame(() => {
        // The closing route may mount its destination in the same commit that
        // removes this dialog. Resolve here, after inertness is removed.
        const requestedTarget = requestedCloseFocus.current?.();
        requestedCloseFocus.current = null;
        const target = requestedTarget ?? returnTarget;
        if (target?.isConnected && !target.closest("[inert]")) target.focus();
        else fallbackFocus?.()?.focus();
      });
    };
  }, [open]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRef.current();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogFocusableElements(dialogRef.current);
    if (focusable.length === 0) { event.preventDefault(); dialogRef.current?.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  return {
    dialogRef,
    onKeyDown,
    requestCloseFocus: (target: () => HTMLElement | null) => { requestedCloseFocus.current = target; },
  };
}

export function DataQualityPage() {
  const [returnTo, setReturnTo] = useState("/dashboard/activities");
  const [source, setSource] = useState<"file" | "strava">("file");
  const [file, setFile] = useState<File | null>(null);
  const [fileState, setFileState] = useState<RequestState>("idle");
  const [fileMessage, setFileMessage] = useState<string>();
  const [fileResult, setFileResult] = useState<ImportUploadResponse | null>(null);
  const [replacingFile, setReplacingFile] = useState(false);
  const [strava, setStrava] = useState<JsonRecord | null>(null);
  const [stravaState, setStravaState] = useState<RequestState>("loading");
  const [stravaMessage, setStravaMessage] = useState<string>();
  const [backfillAcknowledgement, setBackfillAcknowledgement] = useState<{ reused: boolean; jobId?: string } | null>(null);
  const [athleteId, setAthleteId] = useState<string>();
  const fileSubmitGuard = useRef(false);
  const [recovery, setRecovery] = useState<ReturnType<typeof readRecoveryContext>>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") === "strava") setSource("strava");
    const context = readRecoveryContext(params.get("recovery"));
    setRecovery(context);
    setReturnTo(recoveryReturnHref(context, safeRecoveryPath(params.get("returnTo"), "/dashboard/activities")));
    void loadStrava();
  }, []);

  async function loadStrava() {
    setStravaState("loading");
    try {
      const [session, status] = await Promise.all([
        apiRequest("/api/v1/auth/session"),
        apiRequest("/api/v1/providers/strava/status"),
      ]);
      const activeAthleteId = asRecord(asRecord(session).actor).activeAthleteId;
      if (typeof activeAthleteId !== "string" || !activeAthleteId) throw new Error("Your athlete session is unavailable.");
      setAthleteId(activeAthleteId);
      setStrava(asRecord(status.connection));
      setStravaState("success");
    } catch (error) {
      setStravaState("error");
      setStravaMessage(error instanceof Error ? error.message : "Strava import is unavailable right now.");
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setFileState("error"); setFileMessage("Choose one CSV or GPX file first."); return; }
    if (fileSubmitGuard.current || !canStartImport(fileState === "loading", Boolean(file))) return;
    const filename = file.name.toLowerCase();
    if (!filename.endsWith(".gpx") && !filename.endsWith(".csv")) {
      setFileState("error"); setFileMessage("This file type is not supported. Choose a CSV export or one GPX activity."); return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setFileState("error"); setFileMessage("This file is larger than the 15 MiB import limit. Choose a smaller CSV batch or one GPX activity."); return;
    }
    fileSubmitGuard.current = true;
    setFileState("loading"); setFileMessage("Validating and importing the selected file…");
    try {
      const form = new FormData();
      form.set("file", file);
      const imported = importUploadResponseSchema.parse(await apiRequest("/api/v1/imports/upload", { method: "POST", body: form }));
      setFileResult(imported); setReplacingFile(false); setFileState("success");
      setFileMessage(imported.reused ? "Existing import outcome retained. No duplicate activities were added by this request." : "The server recorded this import outcome. Your approved plan was not changed.");
    } catch (error) {
      setFileState("error"); setFileMessage(error instanceof Error ? error.message : "The file could not be imported.");
    } finally { fileSubmitGuard.current = false; }
  }

  async function connectStrava() {
    if (!athleteId) return;
    setStravaState("loading"); setStravaMessage("Preparing a secure Strava connection…");
    try {
      const connected = await apiRequest("/api/v1/providers/strava/connect", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ athleteId, returnTo: "/dashboard/data-quality?source=strava" }),
      });
      const authorizationUrl = String(connected.authorizationUrl ?? "");
      if (!authorizationUrl) throw new Error("Strava authorization is unavailable.");
      window.location.assign(authorizationUrl);
    } catch (error) {
      setStravaState("error"); setStravaMessage(error instanceof Error ? error.message : "Strava could not be connected.");
    }
  }

  async function importStrava() {
    if (stravaState === "loading" || strava?.displayStatus !== "connected") return;
    const now = new Date();
    setStravaState("loading"); setStravaMessage("Queueing the last 90 days of Strava workouts…");
    try {
      const queued = await apiRequest("/api/v1/providers/strava/backfill", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ after: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000).toISOString(), before: now.toISOString(), pageSize: 30, maxPages: 5, maxActivities: 150 }),
      });
      setBackfillAcknowledgement({ reused: queued.reused === true, jobId: typeof queued.jobId === "string" ? queued.jobId : undefined });
      setStravaState("success");
      setStravaMessage(queued.reused === true ? "An existing Strava backfill is already queued. Connection and queue acknowledgement do not confirm imported activities, review, or readiness." : "Recent Strava history is queued. Check Training when records become available; readiness has not been recomputed by this acknowledgement.");
    } catch (error) {
      setStravaState("error"); setStravaMessage(error instanceof Error ? error.message : "Strava history could not be queued.");
    }
  }

  const presentation = fileResult ? fileImportPresentation(fileResult) : null;
  const stravaConnected = strava?.displayStatus === "connected";
  const returnLabel = recovery?.kind === "home" ? "Return to readiness" : recovery?.activityId ? "Return to session" : returnTo === "/dashboard" ? "Return to Home" : "Return to Training";
  const startFileReplacement = () => { setFile(null); setFileMessage(undefined); setFileState("idle"); setReplacingFile(true); };

  return <CoachShell page="data-quality" title="Data Quality" subtitle="Add training and verify your running history" meta="File or Strava">
    <section className="coach-panel data-quality-panel data-quality-panel--import" aria-labelledby="activity-import-heading">
      <div className="coach-panel-heading"><div><p className="eyebrow">Add training</p><h2 id="activity-import-heading">Choose one source</h2></div></div>
      <fieldset className="source-choice" disabled={fileState === "loading" || (source === "strava" && stravaState === "loading")}><legend className="sr-only">Training source</legend>
        <label><input type="radio" name="activity-source" checked={source === "file"} onChange={() => setSource("file")} /> <span>Upload a file</span></label>
        <label><input type="radio" name="activity-source" checked={source === "strava"} onChange={() => setSource("strava")} /> <span>Import from Strava</span></label>
      </fieldset>
      {source === "file" ? <section className="coach-form" aria-label="File import">
        {!fileResult || replacingFile ? <form className="coach-form" onSubmit={upload}>
        <label className="file-field"><span>CSV or GPX file</span><input disabled={fileState === "loading"} type="file" accept=".csv,.gpx,text/csv,application/gpx+xml" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setFileState("idle"); setFileMessage(undefined); }} /></label>
        <p className="field-help">CSV uploads are limited to 15 MiB. GPX accepts one activity per file. Re-importing the same data is safe and is reported as a duplicate.</p>
        <button className="button button-primary" disabled={!canStartImport(fileState === "loading", Boolean(file))} type="submit">{fileState === "loading" ? "Validating and importing…" : "Import selected file"}</button>
        <StatusLine state={fileState} message={fileMessage} />
        </form> : <div className="coach-form"><p className="quiet-copy">The File source remains selected. Its result is retained while you decide what to do next.</p><button className="button button-secondary" type="button" onClick={startFileReplacement}>Import another file</button></div>}
      </section> : <div className="coach-form" aria-label="Strava import">
        <p className="field-help">Authorization and history import are separate. Connecting does not import or change your plan. Recent history is queued only after you request it.</p>
        {stravaState === "loading" ? <StatusLine state="loading" message="Checking Strava connection…" /> : null}
        {stravaState === "error" ? <><StatusLine state="error" message={stravaMessage} /><button className="button button-secondary" type="button" onClick={() => void loadStrava()}>Try Strava again</button></> : null}
        {stravaState === "success" && stravaConnected ? <><p className="quiet-copy">Strava is connected. Importing the last 90 days can queue up to 150 completed workouts.</p><button className="button button-primary" type="button" onClick={() => void importStrava()}>Import last 90 days</button></> : null}
        {stravaState === "success" && !stravaConnected ? <><p className="quiet-copy">Strava is not connected. Existing activities are not changed when you connect.</p><Link className="button button-primary" href={`/dashboard/settings?section=connections&returnTo=${encodeURIComponent(`/dashboard/data-quality?source=strava&returnTo=${encodeURIComponent(returnTo)}${recovery ? `&recovery=${encodeURIComponent(recovery.id)}` : ""}`)}`}>Connect Strava in Settings</Link></> : null}
        {stravaMessage && stravaState === "success" ? <StatusLine state="success" message={stravaMessage} /> : null}
      </div>}
    </section>
    {source === "file" && presentation ? <section className="coach-panel data-quality-panel data-quality-panel--result" aria-labelledby="import-result-heading">
      <div className="coach-panel-heading"><div><p className="eyebrow">File import result</p><h2 id="import-result-heading">Validation summary</h2></div><span className="status-chip">{presentation.statusLabel}</span></div>
      <dl className="result-grid">{presentation.counts.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p><strong>Practical consequence:</strong> {presentation.consequence}</p>
      {presentation.warnings.length > 0 ? <div className="issue-list"><h3>Recorded limitation</h3><ul>{presentation.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
      <div className="coach-actions"><Link className="button button-primary" href={returnTo}>{presentation.action === "check" ? "Check Training" : returnLabel}</Link>{presentation.action === "correct" ? <button className="button button-secondary" type="button" onClick={startFileReplacement}>Correct file</button> : null}</div>
    </section> : source === "strava" && backfillAcknowledgement ? <section className="coach-panel data-quality-panel data-quality-panel--result" aria-labelledby="backfill-result-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Strava recovery</p><h2 id="backfill-result-heading">Backfill acknowledged</h2></div><span className="status-chip">Queued</span></div><p><strong>Practical consequence:</strong> {backfillAcknowledgement.reused ? "An existing backfill remains queued." : "The requested history was queued."} This does not confirm imported activities, a completed review, or a recomputed readiness assessment.</p><div className="coach-actions"><Link className="button button-primary" href={returnTo}>{returnLabel}</Link></div></section> : <section className="coach-panel coach-empty"><h2>No {source === "file" ? "file import" : "Strava queue"} result yet</h2><p>Select the active source above to see its validation, queued status, and any data-quality limitations. No new import or readiness assessment has been confirmed here.</p><div className="coach-actions"><Link className="button button-secondary" href={returnTo}>{returnLabel}</Link></div></section>}
  </CoachShell>;
}

export function PlanPage({ onlineMode = false }: { onlineMode?: boolean }) {
  const [displayName, setDisplayName] = useState("Athlete");
  const [why, setWhy] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [distanceKm, setDistanceKm] = useState("21.1");
  const [targetTime, setTargetTime] = useState("");
  const [timezone, setTimezone] = useState(timezoneDefault);
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [preferredLongRunDay, setPreferredLongRunDay] = useState("sunday");
  const [desiredSessionsPerWeek, setDesiredSessionsPerWeek] = useState("3");
  const [availableDays, setAvailableDays] = useState(() => new Set(["Tuesday", "Thursday", "Sunday"]));
  const [creationOpen, setCreationOpen] = useState(false);
  const [contextState, setContextState] = useState<RequestState>("idle");
  const [contextMessage, setContextMessage] = useState<string>();
  const [publishedContext, setPublishedContext] = useState<JsonRecord | null>(null);
  const [publicationMetadata, setPublicationMetadata] = useState<JsonRecord | null>(null);
  const [contextReadState, setContextReadState] = useState<RequestState>("loading");
  const [contextReadMessage, setContextReadMessage] = useState<string>();
  const [proposal, setProposal] = useState<JsonRecord | null>(null);
  const [proposalState, setProposalState] = useState<RequestState>("idle");
  const [proposalMessage, setProposalMessage] = useState<string>();
  const [proposalReadState, setProposalReadState] = useState<RequestState>("loading");
  const [proposalReadMessage, setProposalReadMessage] = useState<string>();
  const [activePlan, setActivePlan] = useState<JsonRecord | null>(null);
  const [planHistory, setPlanHistory] = useState<JsonRecord[]>([]);
  const [historyState, setHistoryState] = useState<RequestState>("loading");
  const [historyMessage, setHistoryMessage] = useState<string>();
  const [confirmation, setConfirmation] = useState<PlanConfirmation | null>(null);
  const [confirmationHistoryWarning, setConfirmationHistoryWarning] = useState<string>();
  const [confirmationRecoveryReady, setConfirmationRecoveryReady] = useState(false);
  const [planLoadState, setPlanLoadState] = useState<RequestState>("loading");
  const [planLoadMessage, setPlanLoadMessage] = useState<string>();
  const [workflowStage, setWorkflowStage] = useState<PlanWorkflowStage>("setup");
  const [selectedProposalFile, setSelectedProposalFile] = useState<File | null>(null);
  const [copyMessage, setCopyMessage] = useState<string>();
  const [downloadMessage, setDownloadMessage] = useState<string>();
  const [lastReadAt, setLastReadAt] = useState<Record<"active" | "history" | "proposal" | "context", string | undefined>>({ active: undefined, history: undefined, proposal: undefined, context: undefined });
  const workflowHeadingRef = useRef<HTMLHeadingElement>(null);
  const activePlanHeadingRef = useRef<HTMLHeadingElement>(null);
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);
  const activationLauncherRef = useRef<HTMLElement | null>(null);
  const decisionLauncherRef = useRef<HTMLElement | null>(null);
  const confirmationSubmitGuard = useRef(false);
  const confirmationReadGeneration = useRef(0);
  const shouldFocusCreation = useRef(false);
  const formIsDirty = useRef(false);
  const contextWasRestored = useRef(false);
  const readGeneration = useRef({ active: 0, history: 0, proposal: 0, context: 0 });
  const readControllers = useRef<{ active?: AbortController; history?: AbortController; proposal?: AbortController; context?: AbortController }>({});
  const confirmationLauncherRef = useRef<HTMLElement | null>(null);
  const confirmationModal = useModalKeyboard<HTMLElement>(Boolean(confirmation), () => {
    if (confirmation?.phase !== "pending") { confirmationSubmitGuard.current = false; setConfirmation(null); setConfirmationHistoryWarning(undefined); setConfirmationRecoveryReady(false); }
  }, confirmationLauncherRef, () => confirmation?.snapshot.kind === "activate"
    ? activePlanHeadingRef.current ?? historyHeadingRef.current
    : workflowHeadingRef.current ?? activePlanHeadingRef.current);

  useEffect(() => {
    const open = Boolean(confirmation);
    const content = document.querySelector<HTMLElement>(".coaching-content--plan");
    const nav = document.querySelector<HTMLElement>(".dashboard-nav");
    if (!open || !content) return;
    const background = Array.from(content.children).filter((element) => !element.classList.contains("coach-dialog-backdrop")) as HTMLElement[];
    background.forEach((element) => { element.inert = true; });
    if (nav) nav.inert = true;
    return () => { background.forEach((element) => { element.inert = false; }); if (nav) nav.inert = false; };
  }, [confirmation]);

  useEffect(() => {
    void loadPlanPage();
    return () => { Object.values(readControllers.current).forEach((controller) => controller?.abort()); };
  }, []);

  async function loadPlanPage() {
    await Promise.all([
      loadActivePlan(),
      loadPlanHistory(),
      ...(onlineMode ? [] : [loadLatestProposal(), loadCurrentContext()]),
    ]);
  }

  function invalidateRead(resource: "active" | "history" | "proposal" | "context") { readGeneration.current[resource] += 1; readControllers.current[resource]?.abort(); }
  function clearPrivateReadState() {
    setActivePlan(null); setPlanHistory([]); setProposal(null); setPublishedContext(null); setPublicationMetadata(null);
  }
  function startRead(resource: "active" | "history" | "proposal" | "context") {
    readControllers.current[resource]?.abort();
    const controller = new AbortController();
    readControllers.current[resource] = controller;
    const generation = ++readGeneration.current[resource];
    return { controller, generation };
  }
  function completeRead(resource: "active" | "history" | "proposal" | "context", generation: number) {
    return shouldApplyRead(readGeneration.current[resource], generation);
  }

  async function loadActivePlan() {
    const { controller, generation } = startRead("active");
    setPlanLoadState("loading"); setPlanLoadMessage(undefined);
    try {
      const currentActivePlan = await planApiRequest("/api/v1/coaching/plans/active", activePlanApiResponseSchema, { signal: controller.signal });
      if (!completeRead("active", generation)) return;
      setActivePlan(currentActivePlan);
      setPlanLoadState("success"); setLastReadAt((current) => ({ ...current, active: new Date().toLocaleString() }));
    } catch (error) {
      if (controller.signal.aborted || !completeRead("active", generation)) return;
      const requestError = error as Error & { code?: string; status?: number };
      if (isPrivacyReadFailure(requestError)) clearPrivateReadState();
      if (isDocumentedActivePlanAbsence(requestError)) {
        setActivePlan(null);
        setPlanLoadState("success"); setLastReadAt((current) => ({ ...current, active: new Date().toLocaleString() }));
        return;
      }
      setPlanLoadState("error");
      setPlanLoadMessage(error instanceof Error ? error.message : "The active plan could not be loaded.");
    }
  }

  async function loadLatestProposal() {
    const { controller, generation } = startRead("proposal");
    setProposalReadState("loading"); setProposalReadMessage("Loading your latest saved draft…");
    try {
      const response = await planApiRequest("/api/v1/coaching/proposals/latest", latestProposalApiResponseSchema, { signal: controller.signal });
      if (!completeRead("proposal", generation)) return;
      const latest = response.proposal ? asRecord(response.proposal) : null;
      if (latest?.status === "proposed" && typeof latest.id === "string") {
        setProposal(latest);
        setProposalReadState("success");
        setProposalReadMessage("Saved draft loaded for review. Nothing is active until you approve it.");
        setLastReadAt((current) => ({ ...current, proposal: new Date().toLocaleString() }));
        return;
      }
      setProposal(null); setProposalReadState("success"); setProposalReadMessage(undefined);
      setLastReadAt((current) => ({ ...current, proposal: new Date().toLocaleString() }));
    } catch (error) {
      if (controller.signal.aborted || !completeRead("proposal", generation)) return;
      if (isPrivacyReadFailure(error as { status?: number })) clearPrivateReadState();
      setProposalReadState("error");
      setProposalReadMessage(error instanceof Error ? `Saved draft could not be loaded: ${error.message}` : "Saved draft could not be loaded.");
    }
  }

  async function loadCurrentContext() {
    const { controller, generation } = startRead("context");
    setContextReadState("loading"); setContextReadMessage("Loading your published planning context…");
    try {
      const response = await planApiRequest("/api/v1/coaching/context/current", currentContextApiResponseSchema, { signal: controller.signal });
      if (!completeRead("context", generation)) return;
      const context = response.context ? asRecord(response.context) : null;
      setPublishedContext(context);
      setContextReadState("success"); setContextReadMessage(context ? "Published context is available to continue in Codex." : undefined); setLastReadAt((current) => ({ ...current, context: new Date().toLocaleString() }));
    } catch (error) {
      if (controller.signal.aborted || !completeRead("context", generation)) return;
      if (isPrivacyReadFailure(error as { status?: number })) clearPrivateReadState();
      setContextReadState("error");
      setContextReadMessage(error instanceof Error ? `Published context could not be loaded: ${error.message}` : "Published context could not be loaded.");
    }
  }

  async function loadPlanHistory() {
    const { controller, generation } = startRead("history");
    setHistoryState("loading"); setHistoryMessage("Loading approved plan versions…");
    try {
      const response = await planApiRequest("/api/v1/coaching/plans/history", planHistoryApiResponseSchema, { signal: controller.signal });
      if (!completeRead("history", generation)) return;
      setPlanHistory(response.plans.map(asRecord));
      setHistoryState("success"); setHistoryMessage(undefined); setLastReadAt((current) => ({ ...current, history: new Date().toLocaleString() }));
    } catch (error) {
      if (controller.signal.aborted || !completeRead("history", generation)) return;
      if (isPrivacyReadFailure(error as { status?: number })) clearPrivateReadState();
      setHistoryState("error"); setHistoryMessage(error instanceof Error ? error.message : "Plan history could not be loaded.");
    }
  }

  function validRevision(value: unknown) { return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null; }

  function openConfirmation(kind: PlanConfirmationKind, target: JsonRecord, launcher: HTMLElement) {
    const targetId = typeof target.id === "string" ? target.id : typeof target.proposalId === "string" ? target.proposalId : "";
    const targetRevision = validRevision(target.revision);
    if (!targetId || (kind !== "activate" && !targetRevision)) {
      setProposalState("error"); setProposalMessage("This reviewed item is incomplete and cannot be confirmed. Reload it before trying again."); return;
    }
    confirmationSubmitGuard.current = false;
    confirmationLauncherRef.current = launcher;
    setConfirmationHistoryWarning(undefined); setConfirmationRecoveryReady(false);
    setConfirmation({
      snapshot: {
        kind, targetId, targetRevision,
        targetLabel: kind === "activate" ? coachingPlanLabel(target) : `draft version ${String(target.version ?? targetRevision)}`,
        replacingPlanId: kind === "approve" && typeof activePlan?.id === "string" ? activePlan.id : null,
        expectedActivePlanId: typeof activePlan?.id === "string" ? activePlan.id : null,
        historyWasStale: kind === "approve" && asRecord(target.review).historyStatus === "stale",
      },
      phase: "ready", acknowledgement: false,
    });
  }

  function closeConfirmation() {
    if (confirmation?.phase === "pending") return;
    confirmationSubmitGuard.current = false;
    setConfirmation(null); setConfirmationHistoryWarning(undefined); setConfirmationRecoveryReady(false);
  }

  async function refreshHistoryAfterConfirmedWrite() {
    try {
      const response = await planApiRequest("/api/v1/coaching/plans/history", planHistoryApiResponseSchema);
      setPlanHistory(response.plans.map(asRecord)); setHistoryState("success"); setHistoryMessage(undefined);
    } catch {
      setConfirmationHistoryWarning("The change is confirmed, but version history could not be refreshed. You can retry that read without repeating the decision.");
    }
  }

  async function confirmPlanAction() {
    const current = confirmation;
    if (!current || !canSubmitConfirmation(current) || confirmationSubmitGuard.current) return;
    const snapshot = current.snapshot;
    const body = snapshot.kind === "activate" ? activationRequestBody(snapshot) : decisionRequestBody(snapshot, current.acknowledgement);
    if (!body) { setConfirmation({ ...current, phase: "failure", message: "The reviewed identity is incomplete. Reload and review it before confirming." }); return; }
    confirmationSubmitGuard.current = true;
    setConfirmation({ ...current, phase: "pending", message: snapshot.kind === "activate" ? `Making ${snapshot.targetLabel.toLowerCase()} active…` : "Saving your decision…" });
    try {
      if (snapshot.kind === "activate") {
        const response = await planApiRequest(`/api/v1/coaching/plans/${encodeURIComponent(snapshot.targetId)}/activate`, planActivationApiResponseSchema, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const selected = asRecord(response.activePlan);
        invalidateRead("active"); invalidateRead("history");
        setActivePlan(selected);
        setConfirmation({ snapshot, acknowledgement: current.acknowledgement, phase: "success", message: `${coachingPlanLabel(selected)} is now active. Home and Calendar use this approved version.` });
      } else {
        const response = await planApiRequest(`/api/v1/coaching/proposals/${encodeURIComponent(snapshot.targetId)}/decision`, proposalDecisionApiResponseSchema, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (response.decision !== snapshot.kind) throw Object.assign(new Error("The response did not match the confirmed action."), { code: "MALFORMED_RESPONSE" });
        invalidateRead("active"); invalidateRead("history"); invalidateRead("proposal");
        setActivePlan(response.plan ? asRecord(response.plan) : null);
        setProposal(null);
        setConfirmation({ snapshot, acknowledgement: current.acknowledgement, phase: "success", message: snapshot.kind === "approve" ? "Plan activated after explicit approval. Home and Calendar now use this immutable version." : "Draft rejected. The active plan was not changed." });
      }
      confirmationSubmitGuard.current = false;
      void refreshHistoryAfterConfirmedWrite();
    } catch (error) {
      confirmationSubmitGuard.current = false;
      const requestError = error as Error & { code?: string; status?: number };
      if (isPlanConflict(requestError)) setConfirmation({ snapshot, acknowledgement: false, phase: "conflict", message: conflictMessage(requestError) });
      else if (requestError.status && requestError.status < 500 && requestError.code !== "MALFORMED_RESPONSE") setConfirmation({ snapshot, acknowledgement: current.acknowledgement, phase: "failure", message: "This decision could not be saved. Check the reviewed information and try again." });
      else setConfirmation({ snapshot, acknowledgement: false, phase: "uncertain", message: uncertainMessage(snapshot) });
    }
  }

  async function reconcileConfirmation() {
    const current = confirmation;
    if (!current || current.phase === "pending") return;
    const generation = ++confirmationReadGeneration.current;
    const { snapshot } = current;
    setConfirmationRecoveryReady(false);
    setConfirmation({ ...current, phase: current.phase === "conflict" ? "conflict" : "uncertain", message: `${current.message ?? uncertainMessage(snapshot)} Checking the current Plan state…` });
    const reads = await Promise.allSettled([
      planApiRequest("/api/v1/coaching/plans/active", activePlanApiResponseSchema).catch((error) => isDocumentedActivePlanAbsence(error as { status?: number; code?: string }) ? null : Promise.reject(error)),
      planApiRequest("/api/v1/coaching/plans/history", planHistoryApiResponseSchema),
      ...(snapshot.kind === "activate" ? [] : [planApiRequest("/api/v1/coaching/proposals/latest", latestProposalApiResponseSchema)]),
    ]);
    if (generation !== confirmationReadGeneration.current) return;
    if (reads[0].status !== "fulfilled" || reads[1].status !== "fulfilled") {
      setConfirmation({ ...current, phase: current.phase === "conflict" ? "conflict" : "uncertain", message: `${current.message ?? uncertainMessage(snapshot)} Current Plan details could not be fully loaded. Retry this read; no new decision was sent.` }); return;
    }
    const refreshedActive = reads[0].value ? asRecord(reads[0].value) : null;
    setActivePlan(refreshedActive); setPlanHistory(reads[1].value.plans.map(asRecord)); setPlanLoadState("success"); setHistoryState("success");
    if ((snapshot.kind === "activate" || snapshot.kind === "approve") && refreshedActive?.id === snapshot.targetId) {
      if (snapshot.kind === "approve") setProposal(null);
      setConfirmation({ snapshot, acknowledgement: false, phase: "success", message: `${snapshot.kind === "activate" ? snapshot.targetLabel : "The reviewed plan"} is currently active. This observed state is not attributed to the earlier request.` }); return;
    }
    if (snapshot.kind !== "activate") {
      const proposalRead = reads[2];
      if (proposalRead?.status !== "fulfilled") { setConfirmation({ ...current, phase: "uncertain", message: `${uncertainMessage(snapshot)} The current draft could not be loaded, so no result is assumed.` }); return; }
      const latest = proposalRead.value.proposal ? asRecord(proposalRead.value.proposal) : null;
      setProposal(latest);
      if (!latest || latest.id !== snapshot.targetId) { setConfirmation({ snapshot, acknowledgement: false, phase: "uncertain", message: "The attempted draft is no longer available through this read. That does not establish whether it was rejected; its old confirmation remains disabled." }); return; }
    }
    setConfirmationRecoveryReady(true);
    setConfirmation({ snapshot, acknowledgement: false, phase: "conflict", message: "Current Plan information was reloaded. Review the current consequences and open a new confirmation before sending another decision." });
  }

  function returnToReview() {
    if (!confirmationRecoveryReady) return;
    const kind = confirmation?.snapshot.kind;
    if (kind === "activate") {
      confirmationModal.requestCloseFocus(() => historyHeadingRef.current ?? activePlanHeadingRef.current ?? workflowHeadingRef.current);
      closeConfirmation();
      return;
    }
    confirmationModal.requestCloseFocus(() => workflowHeadingRef.current ?? activePlanHeadingRef.current);
    setWorkflowStage("review"); shouldFocusCreation.current = true; setCreationOpen(true);
    closeConfirmation();
  }

  function toggleDay(day: string) {
    formIsDirty.current = true;
    setAvailableDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  }

  function openPlanCreation() {
    const savedPlanningGoal = asRecord(publishedContext?.planningGoal);
    const hasUnfinishedPlanningGoal = savedPlanningGoal.status === "draft";
    setWorkflowStage(actionableProposal ? "review" : publishedContext && hasUnfinishedPlanningGoal ? "continue" : "setup");
    shouldFocusCreation.current = true;
    setCreationOpen(true);
  }

  useEffect(() => {
    if (!creationOpen || !shouldFocusCreation.current) return;
    workflowHeadingRef.current?.focus();
    shouldFocusCreation.current = false;
  }, [creationOpen, workflowStage]);

  useEffect(() => {
    if (!publishedContext || formIsDirty.current || contextWasRestored.current) return;
    const restored = restorationValues(publishedContext);
    // The local publication form is deliberately a performance-race form. A
    // validated consistency target remains available in the envelope, but is
    // never silently fabricated into a distance/time race target.
    if (restored.goalKind && restored.goalKind !== "performance") {
      contextWasRestored.current = true;
      return;
    }
    if (restored.displayName) setDisplayName(restored.displayName);
    if (restored.why) setWhy(restored.why);
    if (restored.title) setGoalTitle(restored.title);
    if (restored.targetDate) setTargetDate(restored.targetDate);
    if (restored.distanceKm) setDistanceKm(restored.distanceKm);
    if (restored.targetTime) setTargetTime(restored.targetTime);
    if (restored.timezone) setTimezone(restored.timezone);
    if (restored.units === "metric" || restored.units === "imperial") setUnits(restored.units);
    if (restored.preferredLongRunDay) setPreferredLongRunDay(restored.preferredLongRunDay);
    if (restored.desiredSessionsPerWeek) setDesiredSessionsPerWeek(String(restored.desiredSessionsPerWeek));
    if (restored.days.length > 0) setAvailableDays(new Set(restored.days.map((day) => day[0].toUpperCase() + day.slice(1))));
    contextWasRestored.current = true;
  }, [publishedContext]);

  async function publishContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetTimeParts = targetTime.split(":").map(Number);
    const targetTimeSeconds = targetTime.trim() === "" ? undefined : targetTimeParts.length === 3 && targetTimeParts.every(Number.isFinite)
      ? targetTimeParts[0] * 3600 + targetTimeParts[1] * 60 + targetTimeParts[2]
      : NaN;
    const desiredSessions = Number(desiredSessionsPerWeek);
    if (!why.trim() || !goalTitle.trim() || !targetDate || availableDays.size === 0 || !Number.isFinite(Number(distanceKm)) || Number(distanceKm) <= 0 || !Number.isInteger(desiredSessions) || desiredSessions < 1 || desiredSessions > availableDays.size || (targetTime.trim() !== "" && (!Number.isFinite(targetTimeSeconds ?? NaN) || (targetTimeSeconds ?? 0) <= 0))) {
      setContextState("error"); setContextMessage("Enter a race outcome, date, distance, and enough available days for the desired weekly sessions. Target time must use HH:MM:SS when supplied."); return;
    }
    setContextState("loading"); setContextMessage("Publishing a versioned coaching context…");
    try {
      const body = {
        profile: { displayName, why, timezone, units },
        goalDraft: { title: goalTitle, targetDate, distanceMeters: Number(distanceKm) * 1000, ...(targetTimeSeconds === undefined ? {} : { targetTimeSeconds }) },
        weeklyRoutine: { timezone, availableDays: [...availableDays].map((day) => day.toLowerCase()), preferredLongRunDay, desiredSessionsPerWeek: desiredSessions },
      };
      const response = await planApiRequest("/api/v1/coaching/context/publish", contextPublishApiResponseSchema, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      invalidateRead("context"); invalidateRead("proposal");
      setPublicationMetadata(asRecord(response));
      setContextState("success");
      setContextMessage(`Context ${String(response.artifactId)} is saved. Continue in Codex with this context, then return here and import its proposal. Your saved draft will reappear here for review.`);
      setWorkflowStage("continue");
      shouldFocusCreation.current = true;
      void loadCurrentContext();
    } catch (error) { setContextState("error"); setContextMessage(error instanceof Error ? error.message : "Context could not be published."); }
  }

  async function importProposal(file: File | null) {
    if (!file) { setProposalState("error"); setProposalMessage("Choose the proposal JSON file before importing it."); return; }
    setProposalState("loading"); setProposalMessage("Validating the selected proposal…");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const response = await planApiRequest("/api/v1/coaching/proposals/import", proposalImportApiResponseSchema, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed) });
      invalidateRead("proposal");
      setProposal(asRecord(response.proposal)); setSelectedProposalFile(null); setProposalState("success"); setProposalMessage("Draft imported for review. Nothing is active yet.");
      setWorkflowStage("review"); shouldFocusCreation.current = true;
    } catch (error) { setProposalState("error"); setProposalMessage(error instanceof Error ? error.message : "Proposal could not be imported."); }
  }

  async function copyCodexInstructions() {
    const artifactId = String(contextArtifact.id ?? publicationMetadata?.artifactId ?? "the published context artifact");
    const instructions = `Before preparing any new or changed goal, read and follow RacePredictor's docs/GOAL_UPDATE_PROCESS.md. Use the validated coaching-context.v1.json for ${artifactId}, the active approved plan, and the selected Second Brain context. Ask for one complete coaching-plan-proposal.v2 JSON file compatible with that context and routine. Include every supported intermediate race target as a structured milestone, and omit values unsupported by owner decisions or source evidence. Return to Plan, import the proposal explicitly, review the goal, milestones, full plan and freshness, then leave approval and confirmation to the owner. After approval, publish the approved plan and verified goal context to online Home. Publishing, copying, downloading, or importing never approves or activates a plan.`;
    try { await navigator.clipboard.writeText(instructions); setCopyMessage("Instructions copied. Paste them into Codex with the downloaded context JSON."); }
    catch { setCopyMessage("Copy is unavailable in this browser. Select and copy the readable instructions above manually."); }
  }

  function downloadContext() {
    if (!publishedContext) { setDownloadMessage("The validated context envelope is not available yet. Retry published context; no new context was published."); return; }
    try {
      const blob = new Blob([JSON.stringify(publishedContext, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "coaching-context.v1.json"; anchor.click(); URL.revokeObjectURL(url);
      setDownloadMessage("Context JSON download started from the validated saved envelope.");
    } catch { setDownloadMessage("The context JSON could not be downloaded. Copy the visible instructions and retry the context read; no plan was changed."); }
  }

  const proposalWorkouts = proposal && (Array.isArray(proposal.workouts) ? proposal.workouts : Array.isArray(proposal.sessions) ? proposal.sessions : []);
  const proposalReview = asRecord(proposal?.review);
  const proposalWeeks = proposal && Array.isArray(proposal.weeklyStructure) ? proposal.weeklyStructure : [];
  const proposalAssumptions = proposal && Array.isArray(proposal.assumptions) ? proposal.assumptions : [];
  const proposalCautions = proposal && Array.isArray(proposal.cautions) ? proposal.cautions : [];
  const proposalMilestones = proposal && Array.isArray(proposal.milestones) ? proposal.milestones : [];
  const materialDifferences = Array.isArray(proposalReview.materialDifferences) ? proposalReview.materialDifferences : [];
  const historyIsStale = proposalReview.historyStatus === "stale";
  const activeWorkouts = activePlan && Array.isArray(activePlan.workouts) ? activePlan.workouts : [];
  const goalTarget = asRecord(proposalReview.goalTarget);
  const goalTargetSummary = goalTarget.kind === "performance"
    ? `${Number(goalTarget.distanceMeters ?? 0) / 1000} km by ${String(goalTarget.targetDate ?? "unspecified date")}${goalTarget.targetTimeSeconds ? ` in ${String(goalTarget.targetTimeSeconds)} seconds` : ""}`
    : `${String(goalTarget.metric ?? "consistency")} ${String(goalTarget.threshold ?? "")} from ${String(goalTarget.startsOn ?? "—")} to ${String(goalTarget.endsOn ?? "—")}`;
  // Immediately after publication the response is the authoritative new
  // metadata while the independently retried context GET is still in flight.
  // After a reload metadata is absent and the validated envelope is used.
  const contextArtifact = asRecord(publicationMetadata?.artifact ?? publishedContext?.artifact);
  const contextPath = typeof publicationMetadata?.jsonPath === "string" ? publicationMetadata.jsonPath : undefined;
  const contextArtifactId = typeof contextArtifact.id === "string" ? contextArtifact.id : undefined;
  const restoredPlanningGoal = asRecord(publishedContext?.planningGoal);
  const restoredSettledGoal = asRecord(publishedContext?.settledGoal);
  const restoredGoalTarget = asRecord(restoredPlanningGoal.target);
  const completedPlanningContext = !restoredPlanningGoal.id && restoredSettledGoal.status === "settled";
  const unsupportedRestorationGoal = restoredPlanningGoal.status === "draft" && restoredGoalTarget.kind !== "performance";
  const proposalIsNewer = !activePlan || Number(proposal?.version ?? 0) > Number(activePlan.version ?? 0);
  const actionableProposal = isActionableProposal({ proposal, activePlan, activePlanStatus: planLoadState === "idle" ? "loading" : planLoadState, contextArtifactId });
  const proposalContextMismatch = Boolean(proposal && contextArtifactId && proposal.contextArtifactId !== contextArtifactId);
  const contextAvailable = Boolean(publishedContext || publicationMetadata);
  const creationActionLabel = actionableProposal ? "Review saved draft" : contextAvailable && !completedPlanningContext ? "Resume with Codex" : activePlan ? "Create a new plan with Codex" : "Create a plan with Codex";
  const currentStage = confirmation && confirmation.snapshot.kind !== "activate" ? "Confirm" : workflowStage === "continue" ? "Continue in Codex" : workflowStage === "import" ? "Import proposal" : workflowStage === "review" ? "Review" : "Goal & context";
  const activeContentVersion = coachingContentVersion(activePlan);
  const activePlanToday = activePlan ? localDateInTimezone(String(activePlan.timezone ?? timezoneDefault)) : "";
  return <CoachShell page="plan" title="Plan" subtitle={onlineMode ? "Choose which explicitly approved structured plan is active" : "Set your goal and explicitly approve each plan version"} meta={planLoadState === "error" ? "Plan unavailable" : planLoadState === "loading" ? "Loading plan…" : activePlan ? `Active · ${activeContentVersion ?? `record ${String(activePlan.version ?? 1)}`}` : "No active plan"}>
    <section className="coach-panel coach-panel--plan-focus" aria-labelledby="active-plan-heading">
      <div className="coach-panel-heading plan-focus-heading"><div><p className="eyebrow">Your training focus</p><h2 id="active-plan-heading" ref={activePlanHeadingRef} tabIndex={-1}>Active plan</h2></div>{onlineMode ? <span className="status-chip">Online plan control</span> : !creationOpen ? <button className="button button-primary" type="button" aria-controls="plan-creation-workflow" aria-expanded={creationOpen} onClick={openPlanCreation}>{creationActionLabel}</button> : <span className="status-chip">Workflow open</span>}</div>
      <nav className="local-plan-switch" aria-label="Plan views"><Link aria-current="page" href="/dashboard/plan">Overview</Link><Link href="/dashboard/calendar">Calendar</Link></nav>
      {planLoadState === "loading" ? <p className="coach-status coach-status--loading" role="status">{activePlan ? "Refreshing the active approved plan; the last successful read remains below." : "Loading the active approved plan…"}</p> : null}
      {planLoadState === "error" ? <div className="coach-status coach-status--error" role="alert"><p>Active-plan status could not be checked. {planLoadMessage}</p>{activePlan ? <p>The last loaded approved plan remains visible below while you retry.</p> : null}<button className="button button-secondary" type="button" onClick={() => void loadActivePlan()}>Retry active plan</button></div> : null}
      {activePlan ? <><dl className="summary-list active-plan-summary"><div><dt>Status</dt><dd>Active approved version</dd></div><div><dt>Coaching version</dt><dd>{activeContentVersion ?? "Not supplied"}</dd></div><div><dt>Approval record</dt><dd>{String(activePlan.version ?? 1)}</dd></div><div><dt>Date range</dt><dd>{String(activePlan.startsOn ?? "—")} to {String(activePlan.endsOn ?? "—")}</dd></div><div><dt>Sessions</dt><dd>{activeWorkouts.length}</dd></div><div><dt>Timezone</dt><dd>{String(activePlan.timezone ?? timezoneDefault)}</dd></div></dl><p>{onlineMode ? "This plan was explicitly approved before publication. Selecting another approved version changes Home and Calendar, but does not alter any workout prescription." : "Follow this approved version in Calendar. Creating a replacement never changes it until you review and approve the new draft."}</p><Link className="text-link" href="/dashboard/calendar">Open active plan in Calendar</Link><ActivePlanOverview plan={activePlan} today={activePlanToday} /></> : null}
      {lastReadAt.active ? <p className="field-help">Last successful active-plan read: {lastReadAt.active}. This is a client read time, not plan or training-data freshness.</p> : null}
      {planLoadState === "success" && !activePlan ? <div className="plan-focus-empty"><p>{onlineMode ? "No approved plan has been synced yet. Your local coaching workflow remains the authority for creating and approving plans." : "No plan is active yet. Start with Codex, then return here to review and approve the proposal before it affects Home or Calendar."}</p></div> : null}
      {actionableProposal ? <p className="plan-draft-note" role="status">A newer saved draft is ready for review. Your active plan remains unchanged until you explicitly approve it.</p> : null}
      {!onlineMode && proposalReadState === "error" ? <div className="history-error" role="alert"><p>{proposalReadMessage}</p><button className="button button-secondary" type="button" onClick={() => void loadLatestProposal()}>Retry saved draft</button></div> : null}
      {!onlineMode && contextReadState === "error" ? <div className="history-error" role="alert"><p>{contextReadMessage}</p><button className="button button-secondary" type="button" onClick={() => void loadCurrentContext()}>Retry published context</button></div> : null}
    </section>
    {!onlineMode && creationOpen ? <div className="plan-creation-workflow" id="plan-creation-workflow">
    <ol className="plan-stage-list" aria-label="Plan setup stages">{["Goal & context", "Continue in Codex", "Import proposal", "Review", "Confirm"].map((stage) => <li key={stage} className={currentStage === stage ? "plan-stage-list--active" : undefined}>{stage}</li>)}</ol>
    {workflowStage === "setup" ? <section className="coach-panel" aria-labelledby="coach-setup-heading">
      <div className="coach-panel-heading"><div><p className="eyebrow">Step 1 of 5 · Goal &amp; context</p><h2 id="coach-setup-heading" ref={workflowHeadingRef} tabIndex={-1}>Set your race goal</h2></div><span className="status-chip">Draft inputs</span></div>
      <p>Tell us the race outcome and routine Codex should plan from. Publishing saves context only; it does not create or activate a plan.</p>
      <div className="plan-data-needed" role="note"><strong>What is needed</strong><p>Race distance, date, optional target time, why it matters, and the days you can train. Recent training is used when available; missing history limits what can be assessed.</p></div>
      <form className="coach-form coach-form-grid" onSubmit={publishContext}>
        {completedPlanningContext ? <p className="coach-status coach-status--idle field-wide" role="status">This restored context records a completed planning decision, not an unfinished workflow. Starting here preserves that record and publishes a new context only when you choose Publish context for Codex.</p> : null}
        {unsupportedRestorationGoal ? <p className="coach-status coach-status--error field-wide" role="alert">This published context has a {String(restoredGoalTarget.kind)} target. It remains available in the context JSON, but it cannot be silently converted into this race-distance form. Continue with it in Codex or enter a new race goal deliberately.</p> : null}
        <label><span>Name</span><input value={displayName} onChange={(event) => { formIsDirty.current = true; setDisplayName(event.target.value); }} /></label>
        <label><span>Target outcome</span><input required value={goalTitle} onChange={(event) => { formIsDirty.current = true; setGoalTitle(event.target.value); }} placeholder="Finish my first half marathon" /></label>
        <label><span>Target date</span><input required type="date" value={targetDate} onChange={(event) => { formIsDirty.current = true; setTargetDate(event.target.value); }} /></label>
        <label><span>Target distance (km)</span><input required min="1" step="0.1" type="number" value={distanceKm} onChange={(event) => { formIsDirty.current = true; setDistanceKm(event.target.value); }} /></label>
        <label><span>Target time (optional)</span><input inputMode="numeric" pattern="[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]" placeholder="02:00:00" value={targetTime} onChange={(event) => { formIsDirty.current = true; setTargetTime(event.target.value); }} aria-describedby="target-time-help" /><span className="field-help" id="target-time-help">Use HH:MM:SS. Leave blank if you only want to track the race outcome.</span></label>
        <label><span>Timezone</span><input value={timezone} onChange={(event) => { formIsDirty.current = true; setTimezone(event.target.value); }} /></label>
        <label><span>Units</span><select value={units} onChange={(event) => { formIsDirty.current = true; setUnits(event.target.value as "metric" | "imperial"); }}><option value="metric">Metric</option><option value="imperial">Imperial</option></select></label>
        <label className="field-wide"><span>Why this matters</span><textarea required rows={3} value={why} onChange={(event) => { formIsDirty.current = true; setWhy(event.target.value); }} placeholder="The personal reason you want to keep showing up" /></label>
        <fieldset className="field-wide routine-fieldset"><legend>Available training days</legend><div className="weekday-options">{weekdays.map((day) => <label key={day}><input type="checkbox" checked={availableDays.has(day)} onChange={() => toggleDay(day)} /><span>{day.slice(0, 3)}</span></label>)}</div><label><span>Preferred long-run day</span><select value={preferredLongRunDay} onChange={(event) => { formIsDirty.current = true; setPreferredLongRunDay(event.target.value); }}>{weekdays.map((day) => <option key={day} value={day.toLowerCase()}>{day}</option>)}</select></label><label><span>Desired sessions each week</span><input required type="number" min="1" max={availableDays.size} value={desiredSessionsPerWeek} onChange={(event) => { formIsDirty.current = true; setDesiredSessionsPerWeek(event.target.value); }} /></label><p className="field-help">These supported routine preferences are included in the published context; Codex can discuss a different routine before you import a plan.</p></fieldset>
        <button className="button button-primary field-wide" disabled={contextState === "loading"} type="submit">{contextState === "loading" ? "Publishing…" : "Publish context for Codex"}</button>
      </form>
      <details className="plan-assumptions"><summary>Prediction assumptions</summary><p>Any outlook uses the supported prediction data already available in Race Predictor. It is an estimate, not a race-day guarantee. Freshness, missing activities, and optional evidence can limit the assessment; they are shown alongside the result.</p></details>
      <StatusLine state={contextState} message={contextMessage} />
      <div className="coach-actions"><button className="button button-secondary" type="button" onClick={() => { setWorkflowStage("import"); shouldFocusCreation.current = true; }}>I already have a proposal</button><button className="button button-secondary" type="button" onClick={() => setCreationOpen(false)}>Return to overview</button></div>
    </section> : null}
    {workflowStage === "continue" ? <section className="coach-panel" aria-labelledby="codex-continuation-heading">
      <div className="coach-panel-heading"><div><p className="eyebrow">Step 2 of 5 · Continue in Codex</p><h2 id="codex-continuation-heading" ref={workflowHeadingRef} tabIndex={-1}>Continue with your published context</h2></div><span className="status-chip">Context saved</span></div>
      <p>Before setting or changing a goal, have Codex read and follow <strong>docs/GOAL_UPDATE_PROCESS.md</strong>. Provide the validated <strong>coaching-context.v1.json</strong>, active approved plan, and selected Second Brain context. Ask for a complete <strong>coaching-plan-proposal.v2</strong> with supported race milestones. Import and review the goal, milestones, complete plan, and freshness here. Only the owner approves and confirms; after approval, publish the plan and verified goal context to online Home. Importing does not activate a plan.</p>
      {contextPath ? <p className="field-help">Published context: <code>{contextPath}</code></p> : null}
      {typeof contextArtifact.id === "string" ? <p className="field-help">Context artifact: {contextArtifact.id} · captured {String(contextArtifact.capturedAt ?? "time not returned")}</p> : null}
      {Array.isArray(contextArtifact.warnings) && contextArtifact.warnings.length > 0 ? <div className="today-warnings" role="note"><strong>Context warnings</strong><ul>{contextArtifact.warnings.map((warning, index) => <li key={index}>{String(asRecord(warning).message ?? warning)}</li>)}</ul></div> : null}
      <div className="coach-actions"><button className="button button-secondary" type="button" disabled={!publishedContext} onClick={downloadContext}>Download context JSON</button><button className="button button-secondary" type="button" onClick={() => void copyCodexInstructions()}>Copy Codex instructions</button></div>
      {downloadMessage ? <p className="field-help" role="status">{downloadMessage}</p> : null}{copyMessage ? <p className="field-help" role="status">{copyMessage}</p> : null}
      {contextReadState === "error" ? <div className="history-error" role="alert"><p>{contextReadMessage}</p><button className="button button-secondary" type="button" onClick={() => void loadCurrentContext()}>Retry published context</button></div> : null}
      <div className="coach-actions"><button className="button button-primary" type="button" onClick={() => { setWorkflowStage("import"); shouldFocusCreation.current = true; }}>I have a proposal</button><button className="button button-secondary" type="button" onClick={() => { setWorkflowStage("setup"); shouldFocusCreation.current = true; }}>Edit goal and context</button><button className="button button-secondary" type="button" onClick={() => setCreationOpen(false)}>Return to overview</button></div>
    </section> : null}
    {workflowStage === "import" || workflowStage === "review" ? <section className="coach-panel" aria-labelledby="proposal-import-heading">
      <div className="coach-panel-heading"><div><p className="eyebrow">Step {workflowStage === "import" ? "3" : "4"} of 5 · {workflowStage === "import" ? "Import proposal" : "Review"}</p><h2 id="proposal-import-heading" ref={workflowHeadingRef} tabIndex={-1}>{workflowStage === "import" ? "Import your Codex proposal" : "Review proposal"}</h2></div><span className={`status-chip ${proposal ? "status-chip--draft" : ""}`}>{proposal ? "Draft · not active" : "Waiting for file"}</span></div>
      {workflowStage === "import" ? <><label className="file-field"><span>Codex proposal JSON</span><input disabled={proposalState === "loading"} type="file" accept=".json,application/json" onChange={(event) => { setSelectedProposalFile(event.target.files?.[0] ?? null); setProposalState("idle"); setProposalMessage(undefined); }} /></label>
      <p className="field-help">{selectedProposalFile ? `Selected: ${selectedProposalFile.name}. Review the selection, then explicitly import it.` : "Bring back the proposal JSON from Codex. Select a file before importing it."} The app reads only the file you select. Importing or leaving this page never activates a plan.</p><div className="coach-actions"><button className="button button-primary" type="button" disabled={!selectedProposalFile || proposalState === "loading"} onClick={() => void importProposal(selectedProposalFile)}>{proposalState === "loading" ? "Importing…" : "Import selected proposal"}</button></div></> : null}
      <StatusLine state={proposalState} message={proposalMessage} />
      {workflowStage === "review" ? <StatusLine state={proposalReadState} message={proposalReadMessage} /> : null}
      {workflowStage === "review" && proposal ? <div className="proposal-review">
        <dl className="summary-list"><div><dt>Status</dt><dd>Draft proposal</dd></div><div><dt>Version</dt><dd>{String(proposal.version ?? 1)}</dd></div><div><dt>Date range</dt><dd>{String(proposal.startsOn ?? "—")} to {String(proposal.endsOn ?? "—")}</dd></div><div><dt>Sessions</dt><dd>{proposalWorkouts ? proposalWorkouts.length : 0}</dd></div><div><dt>History freshness</dt><dd>{historyIsStale ? "Stale — acknowledgement required" : "Current"}</dd></div></dl>
        {historyIsStale ? <div className="today-warnings" role="alert"><strong>History changed after this proposal was generated.</strong><p>{String(proposalReview.historyWarning ?? "Review the newly imported activity history before approving this plan.")}</p></div> : null}
        <div><h4>Goal and outcome</h4><p><strong>{String(proposalReview.goalTitle ?? "Settled goal")}</strong> · {goalTargetSummary}</p></div>
        <div className="issue-list"><h4>Approved milestone relationship</h4>{proposalMilestones.length > 0 ? <ul>{proposalMilestones.map((value, index) => { const milestone = asRecord(value); return <li key={String(milestone.id ?? index)}><strong>{String(milestone.title ?? "Milestone")}</strong> · {Number(milestone.distanceMeters ?? 0) / 1000} km by {String(milestone.targetDate ?? "—")} in {String(milestone.targetTimeSeconds ?? "—")} seconds</li>; })}</ul> : <p className="quiet-copy">No intermediate race milestone is proposed.</p>}</div>
        <div><h4>Plan summary</h4><p>{String(proposal.summary ?? "No proposal summary supplied.")}</p><p><strong>Rationale:</strong> {String(proposal.rationale ?? "Review the full proposal content before approval.")}</p></div>
        <div className="issue-list"><h4>Weekly structure</h4><ul>{proposalWeeks.map((value, index) => { const week = asRecord(value); return <li key={String(week.weekStartsOn ?? index)}><strong>Week of {String(week.weekStartsOn ?? "—")}:</strong> {String(week.focus ?? "No focus supplied")} ({Array.isArray(week.sessionIds) ? week.sessionIds.length : 0} sessions)</li>; })}</ul></div>
        <div className="issue-list"><h4>Assumptions and cautions</h4>{proposalAssumptions.length > 0 ? <><strong>Assumptions</strong><ul>{proposalAssumptions.map((item, index) => <li key={`assumption-${index}`}>{String(item)}</li>)}</ul></> : <p className="quiet-copy">No assumptions were supplied.</p>}{proposalCautions.length > 0 ? <><strong>Cautions</strong><ul>{proposalCautions.map((item, index) => <li key={`caution-${index}`}>{String(item)}</li>)}</ul></> : <p className="quiet-copy">No plan-level cautions were supplied.</p>}</div>
        <div className="issue-list"><h4>Prescription details</h4><div className="session-grid session-grid--agenda">{proposalWorkouts?.map((value, index) => { const workout = asRecord(value); const cautions = Array.isArray(workout.cautions) ? workout.cautions : []; return <article className="session-card" key={String(workout.id ?? index)}><div className="session-card-top"><div><p className="eyebrow">{String(workout.kind ?? "session")} · {String(workout.scheduledDate ?? "—")}</p><h4>{String(workout.title ?? "Planned session")}</h4></div><span className="status-chip">{String(workout.durationMinutes ?? 0)} min</span></div><p><strong>Purpose:</strong> {String(workout.purpose ?? "—")}</p><p><strong>Prescription:</strong> {String(workout.prescription ?? "—")}</p><dl><div><dt>Start</dt><dd>{String(workout.startTime ?? "Flexible")}</dd></div><div><dt>Intensity</dt><dd>{workout.intensityRpe ? `RPE ${String(workout.intensityRpe)}` : "Not specified"}</dd></div><div><dt>Distance</dt><dd>{workout.distanceMeters ? `${Number(workout.distanceMeters) / 1000} km` : "Not specified"}</dd></div><div><dt>Cautions</dt><dd>{cautions.length > 0 ? cautions.map(String).join("; ") : "None supplied"}</dd></div></dl></article>; })}</div></div>
        <div className="issue-list"><h4>{proposalReview.comparedActivePlanId ? `Changes from active plan v${String(proposalReview.comparedActivePlanVersion ?? "")}` : "Activation impact"}</h4><ul>{materialDifferences.map((value, index) => { const difference = asRecord(value); return <li key={`${String(difference.field ?? "difference")}-${index}`}><strong>{String(difference.change ?? "changed")}:</strong> {String(difference.summary ?? "Review this material difference.")}</li>; })}</ul></div>
        {planLoadState !== "success" ? <p className="coach-status coach-status--error" role="alert">Wait for or retry the authoritative active-plan read before deciding on this saved draft.</p> : null}
        {proposalContextMismatch ? <p className="coach-status coach-status--error" role="alert">This saved proposal refers to a different published context artifact. It can be inspected, but cannot be confirmed as this context’s proposal.</p> : null}
        <div className="coach-actions"><button className="button button-primary" type="button" disabled={proposalState === "loading" || !actionableProposal} onClick={(event) => proposal && openConfirmation("approve", proposal, event.currentTarget)}>Review and approve</button><button className="button button-secondary" type="button" disabled={proposalState === "loading" || !actionableProposal} onClick={(event) => proposal && openConfirmation("reject", proposal, event.currentTarget)}>Reject draft</button><button className="button button-secondary" type="button" onClick={() => { setWorkflowStage("import"); shouldFocusCreation.current = true; }}>Import another proposal</button><button className="button button-secondary" type="button" onClick={() => setCreationOpen(false)}>Return to overview</button></div>
      </div> : null}
      {workflowStage === "import" ? <div className="coach-actions"><button className="button button-secondary" type="button" disabled={proposalState === "loading"} onClick={() => { setWorkflowStage(contextAvailable ? "continue" : "setup"); shouldFocusCreation.current = true; }}>Back</button><button className="button button-secondary" type="button" disabled={proposalState === "loading"} onClick={() => setCreationOpen(false)}>Return to overview</button></div> : null}
    </section> : null}
    </div> : null}
    <section className="coach-panel" aria-labelledby="plan-history-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Immutable record</p><h2 id="plan-history-heading" ref={historyHeadingRef} tabIndex={-1}>Approved plan version history</h2></div><span className="status-chip">{planHistory.length} version{planHistory.length === 1 ? "" : "s"}</span></div>
      {onlineMode ? <p className="quiet-copy">Open any inactive approved version below and choose <strong>Make this approved plan active</strong>. A new coaching version appears here only after its normal approval and publication.</p> : null}
      {historyState === "loading" ? <StatusLine state="loading" message={planHistory.length > 0 ? "Refreshing approved plan versions; the last successful history remains below." : historyMessage} /> : null}
      {historyState === "error" ? <div className="history-error" role="alert"><p>{historyMessage}</p>{planHistory.length > 0 ? <p>The last successful approved history remains below.</p> : null}<button className="button button-secondary" type="button" onClick={() => void loadPlanHistory()}>Retry version history</button></div> : null}
      {lastReadAt.history ? <p className="field-help">Last successful history read: {lastReadAt.history}. This is a client read time, not plan freshness.</p> : null}
      {historyState === "success" && planHistory.length === 0 ? <p className="quiet-copy">No approved plan versions yet. Imported drafts never appear here before approval.</p> : null}
      {planHistory.length > 0 ? <div className="plan-history-list">{planHistory.map((plan, index) => {
        const approval = asRecord(plan.approval);
        const workouts = Array.isArray(plan.workouts) ? plan.workouts : [];
        const isActive = plan.status === "active" || plan.id === activePlan?.id;
        const isLatestApproved = index === 0;
        const contentVersion = coachingContentVersion(plan);
        return <details className="plan-version" key={String(plan.id)} open={false}>
          <summary><span><strong>{contentVersion ? `Coaching version ${contentVersion}` : `Approved record ${String(plan.version ?? 1)}`}</strong><small>Approval record {String(plan.version ?? 1)} · {String(plan.startsOn ?? "—")} to {String(plan.endsOn ?? "—")}</small></span><span className={`status-chip${isActive ? " status-chip--active" : ""}`}>{isActive ? "Active" : isLatestApproved ? "Latest approved" : "Retired"}</span></summary>
          <div className="plan-version-details"><dl className="summary-list"><div><dt>Status</dt><dd>{isActive ? "Active approved version" : "Available approved version"}</dd></div><div><dt>Coaching version</dt><dd>{contentVersion ?? "Not supplied"}</dd></div><div><dt>Approval record</dt><dd>{String(plan.version ?? 1)}</dd></div><div><dt>Goal snapshot</dt><dd>{String(plan.goalId ?? "—")}</dd></div><div><dt>Sessions</dt><dd>{workouts.length}</dd></div></dl>
            <p><strong>Approved rationale:</strong> {String(approval.rationale ?? "No rationale supplied.")}</p>
            {onlineMode && !isActive ? <div className="coach-actions"><button className="button button-secondary" type="button" disabled={confirmation?.phase === "pending"} onClick={(event) => openConfirmation("activate", plan, event.currentTarget)}>Make this approved plan active</button><span className="quiet-copy">No session prescription will be changed.</span></div> : null}
            <div className="plan-history-sessions">{workouts.map((value, index) => { const workout = asRecord(value); return <article key={String(workout.id ?? index)}><h3>{String(workout.title ?? "Approved session")}</h3><p>{String(workout.prescription ?? "No prescription supplied.")}</p><small>{String(workout.scheduledDate ?? "—")} · {String(workout.durationMinutes ?? "—")} min</small></article>; })}</div>
          </div>
        </details>;
      })}</div> : null}
    </section>
    {confirmation ? <div className="coach-dialog-backdrop"><section ref={confirmationModal.dialogRef} onKeyDown={confirmationModal.onKeyDown} tabIndex={-1} className="coach-dialog" role="alertdialog" aria-modal="true" aria-labelledby="plan-confirmation-title" aria-describedby="plan-confirmation-description plan-confirmation-status">
      <h2 id="plan-confirmation-title">{confirmation.snapshot.kind === "activate" ? `Make ${confirmation.snapshot.targetLabel.toLowerCase()} active?` : confirmation.snapshot.kind === "approve" ? "Activate this plan version?" : "Reject this draft?"}</h2>
      <p id="plan-confirmation-description">{confirmation.snapshot.kind === "activate" ? confirmation.snapshot.replacingPlanId ? "This will retire the reviewed active plan and make the selected approved plan the source for Home and Calendar. The approved workouts will not be edited or adapted." : "This will make the selected approved plan the source for Home and Calendar. The approved workouts will not be edited or adapted." : confirmation.snapshot.kind === "approve" ? confirmation.snapshot.replacingPlanId ? "This explicitly settles the reviewed proposed goal, retires the reviewed active plan, and activates the new immutable version for Home and Calendar." : "This explicitly settles the reviewed proposed goal and makes this immutable plan version active for Home and Calendar." : "The reviewed draft will be durably rejected. Your current active goal and plan, if any, will not change."}</p>
      {confirmation.snapshot.kind === "approve" && confirmation.snapshot.historyWasStale ? <label className="checkbox-field"><input autoFocus type="checkbox" checked={confirmation.acknowledgement} disabled={confirmation.phase !== "ready"} onChange={(event) => setConfirmation({ ...confirmation, acknowledgement: event.target.checked })} /><span>I reviewed the stale-history warning and explicitly approve using this proposal.</span></label> : null}
      {confirmation.message ? <p id="plan-confirmation-status" className={`coach-status coach-status--${confirmation.phase === "success" ? "success" : confirmation.phase === "pending" ? "loading" : confirmation.phase === "ready" ? "idle" : "error"}`} role={confirmation.phase === "pending" || confirmation.phase === "success" ? "status" : "alert"} aria-live={confirmation.phase === "pending" || confirmation.phase === "success" ? "polite" : "assertive"}>{confirmation.message}</p> : <span id="plan-confirmation-status" className="sr-only" />}
      {confirmationHistoryWarning ? <p className="coach-status coach-status--error" role="alert">{confirmationHistoryWarning}</p> : null}
      <div className="coach-actions">
        {(confirmation.phase === "ready" || confirmation.phase === "failure") ? <button autoFocus={!confirmation.snapshot.historyWasStale} className="button button-primary" type="button" disabled={!canSubmitConfirmation(confirmation)} onClick={() => void confirmPlanAction()}>Confirm {confirmation.snapshot.kind === "activate" ? "activation" : confirmation.snapshot.kind}</button> : null}
        {(confirmation.phase === "conflict" || confirmation.phase === "uncertain") ? <button className="button button-secondary" type="button" onClick={() => void reconcileConfirmation()}>Check current Plan</button> : null}
        {confirmationRecoveryReady ? <button className="button button-primary" type="button" onClick={returnToReview}>Return to review</button> : null}
        {confirmationHistoryWarning ? <button className="button button-secondary" type="button" onClick={() => void refreshHistoryAfterConfirmedWrite()}>Retry version history</button> : null}
        {confirmation.phase !== "pending" ? <button className="button button-secondary" type="button" onClick={closeConfirmation}>{confirmation.phase === "success" ? "Close" : "Cancel"}</button> : null}
      </div>
    </section></div> : null}
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
  const preferredWideView = useRef<"week" | "agenda">("week");
  const [sessions, setSessions] = useState<CalendarSessionView[]>([]);
  const [activities, setActivities] = useState<CalendarActivityView[]>([]);
  const [activitiesReadStatus, setActivitiesReadStatus] = useState<"available" | "unavailable">("available");
  const [rangeAnnouncement, setRangeAnnouncement] = useState("");
  const [activityDetails, setActivityDetails] = useState<Record<string, ActivityDetailState>>({});
  const [selectedDetail, setSelectedDetail] = useState<CalendarDetail | null>(focusSessionId ? { kind: "session", id: focusSessionId, date: anchorDate } : null);
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
  const detailLauncherRef = useRef<HTMLElement | null>(null);
  const calendarRegionRef = useRef<HTMLElement | null>(null);
  const calendarRequestRef = useRef<AbortController | null>(null);
  const wheelDeltaRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const loadedOnce = useRef(false);
  const pendingModal = useModalKeyboard<HTMLFormElement>(Boolean(pending), () => {
    if (actionState !== "loading") setPending(null);
  }, pendingLauncherRef);
  const amendmentModal = useModalKeyboard<HTMLElement>(Boolean(amendDraft), () => {
    if (actionState !== "loading") setAmendDraft(null);
  }, amendmentLauncherRef);
  const detailModal = useModalKeyboard<HTMLElement>(Boolean(selectedDetail), () => setSelectedDetail(null), detailLauncherRef);
  const range = calendarWindowRange(anchorDate);

  async function loadCalendar(successMessage?: string) {
    calendarRequestRef.current?.abort();
    const request = new AbortController();
    calendarRequestRef.current = request;
    if (!loadedOnce.current) setState("loading");
    setMessage("Loading the approved schedule…");
    try {
      const [response, active, todayContext] = await Promise.all([
        apiRequest(`/api/v1/coaching/calendar?from=${range.from}&to=${range.to}`, { signal: request.signal }),
        apiRequest("/api/v1/coaching/plans/active", { signal: request.signal }).catch(() => null),
        apiRequest("/api/v1/coaching/today", { signal: request.signal }).catch(() => null),
      ]);
      if (calendarRequestRef.current !== request) return;
      const activeRecord = asRecord(active);
      const startsOn = String(activeRecord.startsOn ?? "");
      const endsOn = String(activeRecord.endsOn ?? "");
      const timezone = String(activeRecord.timezone ?? timezoneDefault);
      setPlanTimezone(timezone);
      if (!loadedOnce.current && !initialDate) {
        const resolvedToday = localDateInTimezone(timezone);
        if (resolvedToday !== anchorDate) { setAnchorDate(resolvedToday); return; }
      }
      setPlanRange(/^\d{4}-\d{2}-\d{2}$/.test(startsOn) && /^\d{4}-\d{2}-\d{2}$/.test(endsOn) ? { startsOn, endsOn } : null);
      const stale = asRecord(asRecord(todayContext).stale);
      setStaleMessage(stale.isStale === true ? String(stale.reason ?? "The approved schedule was built from older activity history.") : undefined);
      const normalizedSessions = normalizeCalendarSessions(response);
      const normalizedActivities = normalizeCalendarActivities(response);
      setSessions(normalizedSessions);
      setActivities(normalizedActivities);
      setActivitiesReadStatus(calendarActivitiesReadStatus(response));
      setSelectedDetail((current) => {
        if (current?.kind === "session" && normalizedSessions.some((session) => session.id === current.id)) return current;
        if (current?.kind === "day") return current;
        return null;
      });
      loadedOnce.current = true;
      setState("success"); setMessage(successMessage);
      setRangeAnnouncement(`${formatCoachingDate(range.from, timezone)} to ${formatCoachingDate(range.to, timezone)}`);
    } catch (error) {
      if (request.signal.aborted || calendarRequestRef.current !== request) return;
      setState(loadedOnce.current ? "success" : "error");
      setMessage(error instanceof Error ? error.message : "Calendar could not be loaded.");
    }
  }
  useEffect(() => {
    void loadCalendar();
    return () => calendarRequestRef.current?.abort();
  }, [range.from, range.to]);

  useEffect(() => {
    if (!selectedDetail) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selectedDetail]);

  useEffect(() => {
    const open = Boolean(selectedDetail || pending || amendDraft);
    const content = document.querySelector<HTMLElement>(".coaching-content--calendar");
    const nav = document.querySelector<HTMLElement>(".dashboard-nav");
    if (!open || !content) return;
    const background = Array.from(content.children).filter((element) => !element.classList.contains("coach-dialog-backdrop")) as HTMLElement[];
    background.forEach((element) => { element.inert = true; });
    if (nav) nav.inert = true;
    return () => {
      background.forEach((element) => { element.inert = false; });
      if (nav) nav.inert = false;
    };
  }, [selectedDetail, pending, amendDraft]);

  useEffect(() => {
    const narrowCalendar = window.matchMedia("(max-width: 1199px)");
    if (narrowCalendar.matches) setView("agenda");
    const useAgenda = (event: MediaQueryListEvent) => {
      setView(event.matches ? "agenda" : preferredWideView.current);
    };
    narrowCalendar.addEventListener("change", useAgenda);
    return () => narrowCalendar.removeEventListener("change", useAgenda);
  }, []);

  useEffect(() => {
    if (state !== "success" || !focusSessionId) return;
    if (focusHandled.current === focusSessionId) return;
    const session = sessions.find((candidate) => candidate.id === focusSessionId);
    if (session) {
      setSelectedDetail((current) => current?.kind === "session" && current.id === focusSessionId
        ? current
        : { kind: "session", id: focusSessionId, date: session.effectiveDate });
      focusHandled.current = focusSessionId;
      setFocusMessage(undefined);
      return;
    }
    const focusKey = `${range.from}:${focusSessionId}`;
    if (focusHandled.current === focusKey) return;
    setFocusMessage("The linked session was not found in this calendar view. Check that the link date matches the approved session.");
    focusHandled.current = focusKey;
  }, [focusSessionId, range.from, sessions, state]);

  useEffect(() => {
    if (!selectedDetail || selectedDetail.date > today) return;
    const records = activities.filter((activity) => activity.localDate === selectedDetail.date);
    const missing = records.filter((activity) => !activityDetails[activity.id]);
    if (missing.length === 0) return;
    const request = new AbortController();
    setActivityDetails((current) => ({ ...current, ...Object.fromEntries(missing.map((activity) => [activity.id, { status: "loading" as const }])) }));
    void Promise.all(missing.map(async (summary) => {
      try {
        const response = await fetch(`/api/v1/activities/${encodeURIComponent(summary.id)}`, { signal: request.signal });
        const data = await readActivityDetailResponse(response);
        if (!request.signal.aborted) setActivityDetails((current) => ({ ...current, [summary.id]: { status: "success", activity: data.activity } }));
      } catch (error) {
        if (!request.signal.aborted) setActivityDetails((current) => ({ ...current, [summary.id]: { status: "error", error: error instanceof Error ? error.message : "The activity could not be loaded." } }));
      }
    }));
    return () => request.abort();
  }, [activities, selectedDetail, today]);

  function moveWeek(days: number) {
    if (selectedDetail || state === "loading") return;
    const date = new Date(`${anchorDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    setAnchorDate(date.toISOString().slice(0, 10));
    setFocusMessage(undefined);
  }

  function handleCalendarKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.currentTarget !== event.target || selectedDetail) return;
    if (event.key === "PageUp") { event.preventDefault(); moveWeek(-7); }
    if (event.key === "PageDown") { event.preventDefault(); moveWeek(7); }
  }

  function handleCalendarWheel(event: ReactWheelEvent<HTMLElement>) {
    if (selectedDetail || state === "loading" || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const region = event.currentTarget;
    const atTop = region.scrollTop <= 0;
    const atBottom = region.scrollTop + region.clientHeight >= region.scrollHeight - 1;
    if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) return;
    wheelDeltaRef.current += event.deltaY;
    if (Math.abs(wheelDeltaRef.current) < 90) return;
    event.preventDefault();
    moveWeek(wheelDeltaRef.current < 0 ? -7 : 7);
    wheelDeltaRef.current = 0;
  }

  function handleCalendarTouchStart(event: ReactTouchEvent<HTMLElement>) {
    touchStartYRef.current = event.touches.length === 1 ? event.touches[0].clientY : null;
  }

  function handleCalendarTouchEnd(event: ReactTouchEvent<HTMLElement>) {
    const startY = touchStartYRef.current;
    touchStartYRef.current = null;
    if (startY === null || selectedDetail || state === "loading" || event.changedTouches.length !== 1) return;
    const deltaY = startY - event.changedTouches[0].clientY;
    if (Math.abs(deltaY) < 60) return;
    const region = event.currentTarget;
    const atTop = region.scrollTop <= 0;
    const atBottom = region.scrollTop + region.clientHeight >= region.scrollHeight - 1;
    if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return;
    moveWeek(deltaY < 0 ? -7 : 7);
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

  const firstEditableDate = (() => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  })();

  function modalReturnTarget(fallback: HTMLElement) {
    return selectedDetail ? detailLauncherRef.current ?? fallback : fallback;
  }

  function reviewMove(session: CalendarSessionView, launcher: HTMLElement) {
    const input = document.getElementById(`move-${session.id}`) as HTMLInputElement | null;
    const date = input?.value || session.effectiveDate;
    const rangeWarning = planRange
      ? outOfPlanRangeWarning(date, planRange)
      : "The approved plan range could not be verified. Retry the calendar before moving this session.";
    const warnings = [sameDayConflictWarning(sessions, session.id, date), rangeWarning]
      .filter((warning): warning is string => Boolean(warning));
    pendingLauncherRef.current = modalReturnTarget(launcher);
    setSelectedDetail(null);
    setPending({ session, operation: "reschedule", date, reason: "", warnings, blocksConfirmation: Boolean(rangeWarning) });
  }

  function renderSessionCard(session: CalendarSessionView, includeId = true) {
    const isToday = session.effectiveDate === today;
    const isFuture = canAmendFutureSession(session, today);
    const canRecordPastSkip = canRecordPastSessionSkip(session, today);
    const original = session.original;
    const originalTarget = [
      original.distanceMeters ? `${Number((original.distanceMeters / 1000).toFixed(2))} km` : null,
      original.durationMinutes ? `${original.durationMinutes} min` : null,
      original.intensityRpe ? `RPE ${original.intensityRpe}` : null,
    ].filter(Boolean).join(" · ") || "Follow the approved prescription";
    return <article className={`session-card${isToday ? " session-card--today" : ""}`} id={includeId ? `session-${session.id}` : undefined} tabIndex={-1} key={session.id}>
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
        <button className="button button-secondary" type="button" onClick={(event) => { amendmentLauncherRef.current = modalReturnTarget(event.currentTarget); setSelectedDetail(null); setActionState("idle"); setActionMessage(undefined); setAmendDraft(amendmentDraft(session)); }}>Amend session</button>
        {session.status === "skipped"
          ? <button className="button button-secondary" type="button" onClick={(event) => { pendingLauncherRef.current = modalReturnTarget(event.currentTarget); setSelectedDetail(null); setPending({ session, operation: "restore", reason: "", warnings: [] }); }}>Restore</button>
          : <button className="button button-secondary" type="button" onClick={(event) => { pendingLauncherRef.current = modalReturnTarget(event.currentTarget); setSelectedDetail(null); setPending({ session, operation: "skip", reason: "", warnings: [] }); }}>Skip</button>}
      </div> : canRecordPastSkip ? <div className="session-actions">
        <p className="adjustment-cue">Past sessions can only be recorded as skipped. The approved source remains unchanged.</p>
        <button className="button button-secondary" type="button" onClick={(event) => { pendingLauncherRef.current = modalReturnTarget(event.currentTarget); setSelectedDetail(null); setPending({ session, operation: "skip", reason: "", warnings: [] }); }}>Record skipped</button>
      </div> : <p className="adjustment-cue">Past and current-day sessions are read-only. Future changes belong in Calendar.</p>}
    </article>;
  }

  function renderCalendarDay(date: string) {
    const daySessions = sessions.filter((session) => session.effectiveDate === date);
    const dayActivities = activities.filter((activity) => activity.localDate === date);
    const isToday = date === today;
    const isPast = date < today;
    const showActivity = (isPast || isToday) && dayActivities.length > 0;
    const primarySession = daySessions[0];
    const supplementaryCount = Math.max(0, dayActivities.length + daySessions.length - 1);
    let status = "Nothing scheduled";
    let title = "No plan scheduled";
    let metrics = "No plan or run recorded";
    let cue = "No plan or run recorded";
    let detail: CalendarDetail = { kind: "day", date };

    if (showActivity) {
      const activity = dayActivities[0];
      const activityMetrics = [
        activity.distanceMeters > 0 ? `${Number((activity.distanceMeters / 1000).toFixed(2))} km` : null,
        activity.elapsedTimeSeconds > 0 ? formatDuration(activity.elapsedTimeSeconds) : null,
        activity.averagePaceSecondsPerKm > 0 ? `${formatPace(activity.averagePaceSecondsPerKm)}/km` : null,
      ].filter(Boolean).join(" · ");
      status = dayActivities.length === 1 ? "Recorded run" : `${dayActivities.length} recorded runs`;
      title = dayActivities.length === 1 ? activity.title : `${dayActivities.length} recorded runs`;
      metrics = activityMetrics || "Recorded run";
      cue = daySessions.length > 0 ? "Scheduled plan context available" : "No scheduled plan on this date";
    } else if (!isPast && primarySession) {
      status = primarySession.kind === "rest" ? "Rest scheduled" : primarySession.status === "skipped" ? "Skipped" : "Planned";
      title = primarySession.title;
      metrics = formatSessionTarget(primarySession);
      cue = primarySession.amendments.length > 0
        ? `${primarySession.amendments.length} approved schedule change${primarySession.amendments.length === 1 ? "" : "s"}`
        : "Approved schedule";
      detail = { kind: "session", id: primarySession.id, date };
    } else if (isPast) {
      status = activitiesReadStatus === "unavailable" ? "Records unavailable" : "No run recorded";
      title = activitiesReadStatus === "unavailable" ? "Activity records could not be loaded" : "No recorded run";
      metrics = daySessions.length > 0 ? "Scheduled plan available in details" : "No scheduled plan";
      cue = activitiesReadStatus === "unavailable" ? "Retry the calendar to check recorded runs" : "No completion inferred";
    }

    return <section className={`calendar-day${isToday ? " calendar-day--today" : ""}`} aria-label={`${formatCoachingDate(date, planTimezone)}${isToday ? ", today" : ""}`} key={date}>
      <header className="calendar-day-heading"><time dateTime={date}>{formatCoachingDate(date, planTimezone)}</time>{isToday ? <span className="today-marker">Today</span> : null}<button className="calendar-info-button" type="button" onClick={(event) => { detailLauncherRef.current = event.currentTarget; setSelectedDetail(detail); }} aria-label={`View details for ${formatCoachingDate(date, planTimezone)}`}>ⓘ</button></header>
      <div className={`calendar-day-card${showActivity ? " calendar-day-card--actual" : ""}`}>
        <p className="eyebrow">{status}</p><strong>{title}</strong><span>{metrics}</span><small>{supplementaryCount > 0 ? `${supplementaryCount + 1} records in details · ` : ""}{cue}</small>
      </div>
    </section>;
  }

  function renderActivityCard(activity: CalendarActivityView) {
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
      <Link className="text-link" href={`/dashboard/activities?activityId=${encodeURIComponent(activity.id)}#coach-review-${encodeURIComponent(activity.id)}`}>View activity and review</Link>
    </article>;
  }

  function renderCalendarDetail() {
    if (!selectedDetail) return null;
    const date = selectedDetail.date;
    const dayActivities = activities.filter((activity) => activity.localDate === date);
    const daySessions = sessions.filter((session) => session.effectiveDate === date);
    const selectedSession = selectedDetail.kind === "session"
      ? daySessions.find((session) => session.id === selectedDetail.id) ?? null
      : null;
    const hasRecords = date <= today && dayActivities.length > 0;
    const title = hasRecords ? "Run details" : selectedSession ? "Plan details" : "Calendar details";

    return <div className="coach-dialog-backdrop"><section ref={detailModal.dialogRef} onKeyDown={detailModal.onKeyDown} className="coach-dialog coach-dialog--calendar-detail" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title">
      <div className="calendar-detail-heading"><div><p className="eyebrow">{formatCoachingDate(date, planTimezone)}</p><h2 id="calendar-detail-title">{title}</h2></div><button autoFocus className="button button-secondary" type="button" onClick={() => setSelectedDetail(null)}>Close details</button></div>
      {hasRecords ? <section className="calendar-detail-records" aria-label="Activity records">
        {dayActivities.map((summary) => {
          const detail = activityDetails[summary.id];
          if (!detail || detail.status === "loading") return <p className="adjustment-cue" key={summary.id}>Loading activity record…</p>;
          if (detail.status === "error") return <section className="coach-status coach-status--error" role="alert" key={summary.id}><p>Could not load this activity record: {detail.error}</p><button className="button button-secondary" type="button" onClick={() => setActivityDetails((current) => { const next = { ...current }; delete next[summary.id]; return next; })}>Retry</button></section>;
          return detail.activity ? <section className="activity-detail calendar-activity-record" aria-labelledby={`calendar-activity-${summary.id}`} key={summary.id}><ActivityRecordContent activity={detail.activity} headingId={`calendar-activity-${summary.id}`} headingLevel={3} /></section> : null;
        })}
      </section> : date <= today ? <p className="adjustment-cue">{activitiesReadStatus === "unavailable" ? "Activity records could not be loaded. Retry the calendar to check recorded runs." : "No run recorded."}</p> : null}
      <section className="calendar-plan-context" aria-label="Active plan session details">
        <p className="eyebrow">Active plan · session scheduled for this date</p>
        {daySessions.length > 0
          ? <>{hasRecords ? <p className="adjustment-cue">This scheduled session is context only; it does not indicate that any recorded run completed the prescription.</p> : null}{daySessions.map((session) => renderSessionCard(session, true))}</>
          : <p className="adjustment-cue">{planRange ? "No session scheduled in the active plan for this date." : "No active plan."}</p>}
      </section>
    </section></div>;
  }

  return <CoachShell page="calendar" title="Calendar" subtitle={onlineMode ? "Owner-managed future sessions with preserved approved sources" : "Approved sessions and reasoned, auditable future changes"} meta={`${formatCoachingDate(range.from, planTimezone)} – ${formatCoachingDate(range.to, planTimezone)} · ${planTimezone}`}>
    <section className="coach-panel calendar-controls" aria-label="Calendar controls"><nav className="local-plan-switch" aria-label="Plan views"><Link href="/dashboard/plan">Overview</Link><Link aria-current="page" href="/dashboard/calendar">Calendar</Link></nav><p id="calendar-scroll-help">Browse the approved schedule by date. Agenda is used below the wide layout.</p><div className="segmented" aria-label="Calendar view"><button className="calendar-week-toggle" type="button" aria-pressed={view === "week"} onClick={() => { preferredWideView.current = "week"; setView("week"); }}>Weeks</button><button type="button" aria-pressed={view === "agenda"} onClick={() => { preferredWideView.current = "agenda"; setView("agenda"); }}>Agenda</button></div></section>
    {state === "loading" ? <StatusLine state="loading" message={message} /> : null}
    {state === "error" ? <section className="coach-panel calendar-state-panel calendar-state-panel--error" role="alert"><h3>Calendar could not be loaded</h3><p>{message ?? "The approved schedule is temporarily unavailable."}</p><button className="button button-primary" type="button" onClick={() => void loadCalendar()}>Retry calendar</button></section> : null}
    {state === "success" && message ? <StatusLine state="success" message={message} /> : null}
    <StatusLine state={actionState} message={actionMessage} />
    {state === "success" && staleMessage ? <section className="coach-panel calendar-state-panel calendar-state-panel--stale" role="status"><h3>Schedule context needs review</h3><p>{staleMessage} The approved plan has not been changed.</p><Link className="text-link" href="/dashboard/plan">Review Plan</Link></section> : null}
    {state === "success" && focusMessage ? <p className="coach-status coach-status--error" role="alert">{focusMessage}</p> : null}
    <p className="calendar-range-announcement" aria-live="polite">{rangeAnnouncement}</p>
    {state === "success" ? <section ref={calendarRegionRef} className="calendar-scroll-region" aria-label="Four-week training calendar" aria-describedby="calendar-scroll-help" tabIndex={0} onKeyDown={handleCalendarKeyDown} onWheel={handleCalendarWheel} onTouchStart={handleCalendarTouchStart} onTouchEnd={handleCalendarTouchEnd}>
    {view === "week" ? <section className="calendar-weeks">
      <div className="calendar-weekday-headings"><span aria-hidden="true" />{weekdays.map((weekday) => <strong key={weekday}>{weekday}</strong>)}</div>
      {range.weeks.map((week) => <section className="calendar-week-row" aria-label={`Week of ${formatCoachingDate(week.from, planTimezone)}`} key={week.from}>
        <header className="calendar-week-label"><span>Week of</span><time dateTime={week.from}>{formatCoachingDate(week.from, planTimezone)}</time></header>
        {Array.from({ length: 7 }, (_, index) => {
          const day = new Date(`${week.from}T00:00:00.000Z`);
          day.setUTCDate(day.getUTCDate() + index);
          return day.toISOString().slice(0, 10);
        }).map(renderCalendarDay)}
      </section>)}
    </section> : sessions.length + activities.length > 0 ? <section className="session-grid session-grid--agenda" aria-label="Agenda training schedule">{[
      ...activities.map((activity) => ({ kind: "activity" as const, date: activity.localDate, value: activity })),
      ...sessions.map((session) => ({ kind: "session" as const, date: session.effectiveDate, value: session })),
    ].sort((left, right) => left.date.localeCompare(right.date) || left.kind.localeCompare(right.kind)).map((item) => item.kind === "activity" ? renderActivityCard(item.value) : renderSessionCard(item.value))}</section> : <section className="coach-panel coach-empty"><h3>No runs or planned sessions in this calendar window</h3><p>Scroll to inspect another date range, or import and sync your activity history.</p><Link className="text-link" href="/dashboard/activities">Open Training</Link></section>}</section> : null}
    {renderCalendarDetail()}
    {pending ? <div className="coach-dialog-backdrop"><form ref={pendingModal.dialogRef} onKeyDown={pendingModal.onKeyDown} onSubmit={(event) => { event.preventDefault(); void confirmEdit(); }} className="coach-dialog" role="alertdialog" aria-modal="true" aria-labelledby="calendar-edit-title">
      <h2 id="calendar-edit-title">Confirm {pending.operation}</h2>
      <p><strong>{pending.session.title}</strong>{pending.date ? ` will move from ${pending.session.effectiveDate} to ${pending.date}.` : ` will be marked ${pending.operation === "skip" ? "skipped" : "upcoming"}.`} Its prescribed date remains {pending.session.prescribedDate}.</p>
      {pending.warnings.length > 0 ? <div className="coach-status coach-status--error" role="alert"><strong>Review before confirming</strong><ul>{pending.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
      <label className="reason-field" htmlFor="calendar-change-reason"><span>Reason for this change</span><textarea autoFocus id="calendar-change-reason" required maxLength={500} rows={3} value={pending.reason} onChange={(event) => setPending({ ...pending, reason: event.target.value })} aria-describedby="calendar-change-reason-help" /><small id="calendar-change-reason-help">Required · 1–500 characters · saved for later coaching review</small></label>
      <div className="coach-actions"><button disabled={pending.blocksConfirmation || actionState === "loading"} className="button button-primary" type="submit">{actionState === "loading" ? "Saving…" : "Confirm change"}</button><button className="button button-secondary" type="button" disabled={actionState === "loading"} onClick={() => setPending(null)}>Cancel</button></div>
    </form></div> : null}
    {amendDraft ? <div className="coach-dialog-backdrop"><section ref={amendmentModal.dialogRef} onKeyDown={amendmentModal.onKeyDown} className="coach-dialog coach-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="session-amend-title"><form className="coach-form coach-form-grid" onSubmit={(event) => void confirmAmendment(event)}>
      <div className="field-wide"><h2 id="session-amend-title">Amend future session</h2><p>Update the working session for <strong>{amendDraft.session.title}</strong>. Its approved source prescription remains unchanged.</p></div>
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
  const [baseline, setBaseline] = useState<ReminderDraft | null>(null);
  const [draft, setDraft] = useState<ReminderDraft>({ enabled: false, localTime: "", timezone: "" });
  const [preferencesRead, setPreferencesRead] = useState<SettingsReadState<JsonRecord>>({ status: "loading" });
  const [contextRead, setContextRead] = useState<SettingsReadState<string | null>>({ status: "loading" });
  const [saveState, setSaveState] = useState<RequestState>("idle");
  const [saveMessage, setSaveMessage] = useState<string>();
  const [handoff, setHandoff] = useState("");
  const [externalStatus, setExternalStatus] = useState<ReminderExternalStatus>("not_configured");
  const [artifactReference, setArtifactReference] = useState<string | null>(null);
  const [externalTaskRef, setExternalTaskRef] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [automationState, setAutomationState] = useState<RequestState>("idle");
  const [automationMessage, setAutomationMessage] = useState<string>();
  const [needsAuthoritativeRecovery, setNeedsAuthoritativeRecovery] = useState(false);
  const [settingsGroup, setSettingsGroup] = useState<"preferences" | "reminders" | "privacy">("preferences");
  const [returnTo, setReturnTo] = useState("/dashboard/settings");
  const mutationRef = useRef(false);
  const preferencesGeneration = useRef(0);
  const contextGeneration = useRef(0);
  const dirty = hasUnsavedReminderChanges(baseline, draft);
  const stage = reminderStage({ preferencesAvailable: preferencesRead.status === "ready" || Boolean(preferencesRead.data), dirty, enabled: draft.enabled, externalStatus, generatedHandoff: Boolean(handoff), continuing });

  useEffect(() => {
    setReturnTo(safeRecoveryPath(new URLSearchParams(window.location.search).get("returnTo"), "/dashboard/settings"));
    void loadPreferences();
    void loadContext();
  }, []);

  async function loadPreferences() {
    const generation = ++preferencesGeneration.current;
    setPreferencesRead((current) => current.data ? { status: "refreshing", data: current.data, checkedAt: current.checkedAt ?? Date.now() } : { status: "loading" });
    try {
      const response = await fetch("/api/v1/coaching/reminder-preferences");
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error("Preferences could not be loaded.");
      const parsed = reminderPreferencesApiResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error("Preferences could not be loaded because the response was unsupported.");
      if (generation !== preferencesGeneration.current) return;
      const value = parsed.data.data;
      const next = { enabled: value.enabled, localTime: value.localTime, timezone: value.timezone };
      setBaseline(next);
      setDraft((current) => baseline && hasUnsavedReminderChanges(baseline, current) ? current : next);
      setExternalStatus(value.externalStatus);
      setArtifactReference(value.externalStatus === "prepared" ? value.externalReference : null);
      setExternalTaskRef(externalTaskReference(value.externalStatus, value.externalReference));
      setPreferencesRead({ status: "ready", data: value as unknown as JsonRecord, checkedAt: Date.now() });
      setNeedsAuthoritativeRecovery(false);
    } catch (error) {
      if (generation === preferencesGeneration.current) setPreferencesRead((current) => settingsReadError(current, error instanceof Error ? error.message : "Preferences could not be loaded."));
    }
  }

  async function loadContext() {
    const generation = ++contextGeneration.current;
    setContextRead((current) => current.data !== undefined ? { status: "refreshing", data: current.data, checkedAt: current.checkedAt ?? Date.now() } : { status: "loading" });
    try {
      const response = await fetch("/api/v1/coaching/context/current");
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error("Coaching context could not be checked.");
      const parsed = currentContextApiResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error("Coaching context could not be checked because the response was unsupported.");
      if (generation !== contextGeneration.current) return;
      const context = parsed.data.data.context;
      const reference = context ? "Published coaching context" : null;
      setContextRead({ status: "ready", data: reference, checkedAt: Date.now() });
    } catch (error) {
      if (generation === contextGeneration.current) setContextRead((current) => settingsReadError(current, error instanceof Error ? error.message : "Coaching context could not be checked."));
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationRef.current || !baseline || needsAuthoritativeRecovery) return;
    mutationRef.current = true; setSaveState("loading"); setSaveMessage("Saving app preferences…");
    try {
      const response = await apiRequest("/api/v1/coaching/reminder-preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, days: weekdays.map((day) => day.toLowerCase()), channel: "codex_task", motivationalContext: true }) });
      const next = { enabled: Boolean(response.enabled), localTime: String(response.localTime), timezone: String(response.timezone) };
      setBaseline(next); setDraft(next); setExternalStatus(normalizeReminderExternalStatus(response.externalStatus)); setArtifactReference(null); setHandoff(""); setContinuing(false);
      setSaveState("success"); setSaveMessage("App reminder preference saved. Changing it does not create, update, or cancel a Codex task.");
    } catch (error) {
      const unknown = shouldRecoverBeforeRetry(!(error as Error & { status?: number }).status);
      if (unknown) setNeedsAuthoritativeRecovery(true);
      setSaveState("error"); setSaveMessage(unknown ? "The save outcome is unknown. Your edits are still here; reread saved preferences before trying again." : error instanceof Error ? error.message : "Preferences could not be saved. Your edits are still here.");
    }
    finally { mutationRef.current = false; }
  }

  async function generateHandoff() {
    if (mutationRef.current || needsAuthoritativeRecovery || stage !== "ready") return;
    mutationRef.current = true; setAutomationState("loading"); setAutomationMessage("Preparing a versioned reminder handoff…");
    try {
      const response = await apiRequest("/api/v1/coaching/reminder-handoffs", { method: "POST", headers: { "content-type": "application/json" } });
      setHandoff(String(response.handoff ?? response.instructions ?? response.content ?? "Handoff generated."));
      setExternalStatus(normalizeReminderExternalStatus(response.externalStatus)); setArtifactReference(typeof response.path === "string" ? response.path : null);
      setAutomationState("success"); setAutomationMessage("Handoff prepared. It is not scheduled and delivery has not been verified.");
    } catch (error) {
      const unknown = shouldRecoverBeforeRetry(!(error as Error & { status?: number }).status);
      if (unknown) setNeedsAuthoritativeRecovery(true);
      setAutomationState("error"); setAutomationMessage(unknown ? "Preparation outcome is unknown. Reread saved preferences before preparing again." : error instanceof Error ? error.message : "Handoff could not be prepared.");
    }
    finally { mutationRef.current = false; }
  }

  async function copyHandoff() {
    if (!handoff) return;
    try { await navigator.clipboard.writeText(handoff); setAutomationMessage("Instructions copied. Copying does not create or verify a recurring task."); }
    catch { setAutomationMessage("Copy is unavailable; select the instructions manually. No external task has been created."); }
  }

  async function confirmExternalAutomation(status: "scheduled" | "attention") {
    if (mutationRef.current || needsAuthoritativeRecovery || (status === "scheduled" && !externalTaskRef.trim())) return;
    mutationRef.current = true; setAutomationState("loading"); setAutomationMessage(status === "scheduled" ? "Recording your external scheduling confirmation…" : "Recording that external setup needs attention…");
    try {
      const response = await apiRequest("/api/v1/coaching/reminder-handoffs/status", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ externalStatus: status, externalReference: status === "scheduled" ? externalTaskRef.trim() : null }),
      });
      const persistedExternalStatus = normalizeReminderExternalStatus(response.externalStatus);
      setExternalStatus(persistedExternalStatus);
      setExternalTaskRef(externalTaskReference(persistedExternalStatus, typeof response.externalReference === "string" ? response.externalReference : null));
      setAutomationState("success");
      setAutomationMessage(status === "scheduled"
        ? "Recorded as scheduled from your confirmation. The app does not infer or verify external delivery."
        : "External setup is marked as needing attention.");
    } catch (error) {
      const unknown = shouldRecoverBeforeRetry(!(error as Error & { status?: number }).status);
      if (unknown) setNeedsAuthoritativeRecovery(true);
      setAutomationState("error"); setAutomationMessage(unknown ? "Confirmation outcome is unknown. Reread saved preferences before trying again." : error instanceof Error ? error.message : "External status could not be saved.");
    } finally { mutationRef.current = false; }
  }

  return <CoachShell page="settings" title="Settings" subtitle="Local coaching preferences and Codex reminder handoff" meta={baseline ? `${baseline.localTime} · ${baseline.timezone}` : "Checking preferences"}>
    <h2 className="sr-only">Settings sections</h2>
    {returnTo !== "/dashboard/settings" ? <section className="coach-panel"><p>Return to the import recovery without changing a preference or connection.</p><Link className="button button-secondary" href={returnTo}>Return to import recovery</Link></section> : null}
    <details className="settings-group" open={settingsGroup === "preferences"} onToggle={(event) => { if (event.currentTarget.open) setSettingsGroup("preferences"); }}><summary>Preferences <span className="status-chip">{baseline ? (baseline.enabled ? "Enabled" : "Disabled") : "Unavailable"}</span></summary><section className="coach-panel settings-panel settings-panel--preference" aria-labelledby="reminder-settings-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Reminder preference</p><h3 id="reminder-settings-heading">Daily coaching reminder</h3></div></div>{preferencesRead.status === "error" && !preferencesRead.data ? <><p className="quiet-copy">Preferences could not be loaded. No editable defaults are shown until the saved preference is read.</p><button className="button button-primary" type="button" onClick={() => void loadPreferences()}>Retry preferences</button><StatusLine state="error" message={preferencesRead.message} /></> : <form className="coach-form coach-form-grid" onSubmit={save}><label className="checkbox-field field-wide"><input disabled={saveState === "loading" || preferencesRead.status === "refreshing"} type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span>Enable the daily reminder preference</span></label><label><span>Local time</span><input disabled={saveState === "loading"} type="time" value={draft.localTime} onChange={(event) => setDraft({ ...draft, localTime: event.target.value })} /></label><label><span>IANA timezone</span><input disabled={saveState === "loading"} value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} /></label><button className="button button-primary field-wide" disabled={saveState === "loading" || !dirty || needsAuthoritativeRecovery} type="submit">{saveState === "loading" ? "Saving…" : "Save preferences"}</button></form>} {needsAuthoritativeRecovery ? <button className="button button-secondary" type="button" onClick={() => void loadPreferences()}>Reread saved preferences</button> : null}{preferencesRead.status === "error" && preferencesRead.data ? <><StatusLine state="error" message={`${preferencesRead.message} Showing the last confirmed settings.`} /><button className="button button-secondary" type="button" onClick={() => void loadPreferences()}>Retry preferences</button></> : null}<StatusLine state={saveState} message={saveMessage} /></section></details>
    <details className="settings-group" open={settingsGroup === "privacy"} onToggle={(event) => { if (event.currentTarget.open) setSettingsGroup("privacy"); }}><summary>Privacy <span className="status-chip">Local control</span></summary><section className="coach-panel settings-panel settings-panel--privacy" aria-labelledby="settings-privacy-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Privacy boundary</p><h3 id="settings-privacy-heading">Structured coaching context only</h3></div></div><p>The app shares only the selected structured coaching context used for the handoff. Reminder preferences never scan notes or change an approved plan.</p></section></details>
    <details className="settings-group" open={settingsGroup === "reminders"} onToggle={(event) => { if (event.currentTarget.open) setSettingsGroup("reminders"); }}><summary>Reminder handoff <span className="status-chip">{handoffStatusLabel(externalStatus)}</span></summary><section className="coach-panel settings-panel settings-panel--operations" aria-labelledby="handoff-heading"><div className="coach-panel-heading"><div><p className="eyebrow">Reminder handoff</p><h3 id="handoff-heading" tabIndex={-1}>Recurring motivation setup</h3></div></div><p>Generate a versioned handoff for Codex. The app stores your preference; Codex owns the recurring task. A prepared handoff is not a scheduled reminder.</p>{needsAuthoritativeRecovery ? <p className="quiet-copy">A reminder write outcome is unknown. Reread saved preferences before taking another reminder action.</p> : stage === "preferences-unavailable" ? <p className="quiet-copy">Load preferences before preparing a handoff.</p> : stage === "editing" ? <p className="quiet-copy">Save your changed preferences before preparing a handoff.</p> : stage === "disabled" ? <p className="quiet-copy">Reminders are disabled. Return to Preferences to enable them; this will not change a task you may already have created in Codex.</p> : stage === "ready" || stage === "attention" ? <div className="coach-actions"><button className="button button-primary" type="button" disabled={automationState === "loading"} onClick={() => void generateHandoff()}>{stage === "attention" ? "Prepare a new handoff" : "Prepare reminder handoff"}</button></div> : stage === "continue" ? <div className="coach-actions"><button className="button button-primary" type="button" onClick={() => { setContinuing(true); requestAnimationFrame(() => document.getElementById("external-task-reference")?.focus()); }}>Continue to confirmation</button><button className="button button-secondary" type="button" onClick={() => void copyHandoff()}>Copy instructions</button></div> : stage === "confirm" ? <div className="external-confirmation"><h4>Confirm external setup</h4><p className="field-help">Create or update the recurring Codex task, then paste its ID or link. This records only your confirmation; delivery is not verified.</p><label htmlFor="external-task-reference"><span>External task reference</span><input id="external-task-reference" value={externalTaskRef} onChange={(event) => setExternalTaskRef(event.target.value)} placeholder="Codex task ID or link" /></label><div className="coach-actions"><button className="button button-primary" disabled={automationState === "loading" || !externalTaskRef.trim()} type="button" onClick={() => void confirmExternalAutomation("scheduled")}>{automationState === "loading" ? "Confirming…" : "Confirm scheduled externally"}</button><button className="button button-secondary" disabled={automationState === "loading"} type="button" onClick={() => void confirmExternalAutomation("attention")}>Mark setup needs attention</button></div></div> : <p className="quiet-copy">Scheduled is recorded from your confirmation only. The app cannot verify external delivery.</p>}{handoff ? <textarea className="handoff-output" aria-label="Generated Codex reminder handoff" readOnly rows={7} value={handoff} /> : null}{artifactReference ? <p className="field-help context-reference">Prepared artifact: {artifactReference}. This is not an external task reference.</p> : null}<StatusLine state={automationState} message={automationMessage} /><dl className="status-list"><div><dt>App preference</dt><dd>{baseline ? (dirty ? "Unsaved changes" : "Confirmed") : "Unknown"}</dd></div><div><dt>External automation</dt><dd>{externalAutomationStatusLabel(externalStatus)}</dd></div><div><dt>Coaching context</dt><dd className="context-reference">{contextRead.status === "loading" ? "Checking…" : contextRead.status === "error" ? "Could not be checked" : contextRead.data ?? "No published coaching context"}</dd></div></dl>{contextRead.status === "error" ? <button className="button button-secondary" type="button" onClick={() => void loadContext()}>Retry context</button> : null}</section></details>
  </CoachShell>;
}
