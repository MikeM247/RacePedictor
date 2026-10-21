"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { goalContextApiResponseSchema, type GoalContextRouteData, type RaceMilestone } from "../../../../packages/core/src/contracts/coaching.ts";
import { milestoneChangeInstructions, milestoneChangeIsCurrent, milestoneChangeLabel, milestoneDurationSeconds, prepareMilestoneChange, type MilestoneChangeRequest } from "../../../../packages/core/src/services/milestone-management.ts";
import { discardMilestoneChange, milestoneChangeExists, readMilestoneChange, storeMilestoneChange } from "../../lib/milestone-change-storage.ts";
import { formatDuration } from "../../lib/activity-formatters";

export function MilestoneTargetForm({ context, latestContext, target, onPrepared, onCancel }: {
  context: GoalContextRouteData; latestContext: GoalContextRouteData | null; target?: RaceMilestone; onPrepared: (request: MilestoneChangeRequest) => void; onCancel: () => void;
}) {
  const [id] = useState(() => target?.id ?? `milestone_${crypto.randomUUID()}`);
  const [title, setTitle] = useState(target?.title ?? "");
  const [eventName, setEventName] = useState(target?.eventName ?? "");
  const [date, setDate] = useState(target?.targetDate ?? "");
  const [distance, setDistance] = useState(target ? String(target.distanceMeters / 1000) : "");
  const [time, setTime] = useState(target ? formatDuration(target.targetTimeSeconds) : "");
  const [replace, setReplace] = useState(false);
  const [hasPrepared, setHasPrepared] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try { setHasPrepared(Boolean(context.goal && milestoneChangeExists(window.sessionStorage, context.goal.athleteId))); }
    catch { setHasPrepared(true); }
  }, [context.goal]);
  function prepare(event: FormEvent) {
    event.preventDefault();
    const seconds = milestoneDurationSeconds(time);
    if (!title.trim() || !date || !distance || !seconds) { setError("Enter a name, date, positive distance and target time in mm:ss or h:mm:ss."); return; }
    if (hasPrepared && !replace) { setError("Confirm replacement of the prepared request in this tab."); return; }
    try {
      const request = prepareMilestoneChange(context, { operation: target ? "edit" : "add", milestone: {
        id, title: title.trim(), targetDate: date, distanceMeters: Number(distance) * 1000, targetTimeSeconds: seconds,
        ...(eventName.trim() ? { eventName: eventName.trim() } : {}),
      } });
      if (!milestoneChangeIsCurrent(request, latestContext)) { setError("The approved plan changed while you were editing. Cancel and reopen this target against the current plan."); return; }
      storeMilestoneChange(window.sessionStorage, request); onPrepared(request);
    } catch (cause) {
      setError(cause && typeof cause === "object" && "issues" in cause ? "Check the milestone date, distance and time. Dates must be unique and on/before the primary goal; a plan supports twelve milestones." : "The change could not be kept in this tab. Allow browser session storage and retry. Your approved plan has not changed.");
    }
  }
  return <form className="road-achievement-form" onSubmit={prepare}>
    <p className="milestone-notice">This prepares an unapproved request in this browser tab. Your target becomes live after a complete replacement plan is reviewed, approved and published.</p>
    <label>Milestone name<input autoFocus required maxLength={200} value={title} onChange={(e) => { setTitle(e.target.value); e.target.setCustomValidity(e.target.value.trim() ? "" : "Enter a milestone name."); }} /></label>
    <label>Event name (optional)<input maxLength={200} value={eventName} onChange={(e) => setEventName(e.target.value)} /></label>
    <div className="road-form-row"><label>Target date<input required type="date" max={context.goal?.target.kind === "performance" ? context.goal.target.targetDate : undefined} value={date} onChange={(e) => { setDate(e.target.value); e.target.setCustomValidity(context.milestones?.some((item) => item.id !== id && item.targetDate === e.target.value) ? "Another milestone already uses that date." : ""); }} /></label><label>Distance, km<input required type="number" min="0.001" max="500" step="0.001" value={distance} onChange={(e) => setDistance(e.target.value)} /></label></div>
    <label>Target time<input required value={time} onChange={(e) => { setTime(e.target.value); e.target.setCustomValidity(e.target.value && !milestoneDurationSeconds(e.target.value) ? "Enter a positive target time in mm:ss or h:mm:ss, up to seven days." : ""); }} placeholder="h:mm:ss or mm:ss" /></label>
    {hasPrepared ? <label className="road-confirmation"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Replace the prepared request in this tab.</label> : null}
    {error ? <p role="alert">{error}</p> : null}
    <div className="road-form-actions"><button className="button button-primary" type="submit">Prepare plan update</button><button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

export function PreparedMilestoneChange({ request, onDiscard }: { request: MilestoneChangeRequest; onDiscard: () => void }) {
  return <aside className="milestone-notice" aria-label="Prepared plan change"><strong>Plan update prepared</strong><p>{milestoneChangeLabel(request)}</p><p>Kept in this browser tab only. The approved plan stays active until a replacement is approved and published.</p><div className="milestone-actions"><Link className="text-link" href="/dashboard/plan?milestoneUpdate=1">Continue in Plan →</Link><button className="text-link" type="button" onClick={onDiscard}>Discard prepared change</button></div></aside>;
}

export function MilestonePlanHandoff({ onlineMode, onContinue }: { onlineMode: boolean; onContinue: () => void }) {
  const [context, setContext] = useState<GoalContextRouteData | null>(null);
  const [request, setRequest] = useState<MilestoneChangeRequest | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [requested, setRequested] = useState(false);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState("");
  const [continuing, setContinuing] = useState(false);
  useEffect(() => {
    setRequested(new URLSearchParams(window.location.search).get("milestoneUpdate") === "1");
    const controller = new AbortController();
    setState("loading"); setMessage(""); setRequest(null); setContext(null);
    void fetch("/api/v1/coaching/goal-context/active", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const current = goalContextApiResponseSchema.parse(await response.json()).data.context;
      if (controller.signal.aborted) return;
      setContext(current);
      if (current.state !== "ready" || !current.goal) throw new Error();
      setRequest(readMilestoneChange(window.sessionStorage, current.goal.athleteId)); setState("ready");
    }).catch(() => { if (!controller.signal.aborted) setState("error"); });
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); };
  }, [retry]);

  const current = Boolean(request && milestoneChangeIsCurrent(request, context));
  async function copyInstructions() {
    if (!request || !current) return;
    try { await navigator.clipboard.writeText(milestoneChangeInstructions(request)); setMessage("Instructions copied. Review a complete proposal before approval."); }
    catch { setMessage("Copy is unavailable. Select the instructions below, or download the request."); }
  }
  function download() {
    if (!request || !current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(request, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "milestone-change-request.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function discard() {
    if (!context?.goal) return;
    try { discardMilestoneChange(window.sessionStorage, context.goal.athleteId); setRequest(null); setState("ready"); setMessage("Prepared change discarded. Your approved plan has not changed."); }
    catch { setMessage("The browser could not discard this request. Retry after allowing session storage."); }
  }
  async function continueToReview() {
    if (!request || continuing) return;
    setContinuing(true);
    try {
      const response = await fetch("/api/v1/coaching/goal-context/active", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const latest = goalContextApiResponseSchema.parse(await response.json()).data.context;
      setContext(latest);
      if (!milestoneChangeIsCurrent(request, latest)) { setMessage("The approved plan changed. Prepare a new request against the current plan."); return; }
      onContinue();
    } catch { setMessage("The current approved plan could not be verified. Retry before continuing."); }
    finally { setContinuing(false); }
  }
  if (!requested && !request) return null;
  return <section className="coach-panel milestone-plan-handoff" aria-labelledby="milestone-handoff-heading"><h2 id="milestone-handoff-heading">Milestone plan update</h2>
    {state === "loading" ? <p role="status">Checking the current approved plan…</p> : state === "error" ? <div role="alert"><p>The prepared change or current approved plan could not be verified. Your approved plan has not changed.</p><button type="button" className="button button-secondary" onClick={() => setRetry((value) => value + 1)}>Retry milestone handoff</button>{context?.goal ? <button className="text-link" type="button" onClick={discard}>Discard invalid request</button> : null}</div> : !request ? <p>No prepared milestone request exists for this athlete in this tab. <Link href="/dashboard/settings?section=milestones">Return to Milestones</Link>.</p> : <>
      <p><strong>{milestoneChangeLabel(request)}</strong> · Based on approved plan version {request.basePlan.version}.</p>
      {!current ? <p className="milestone-notice" role="alert">The approved plan changed since this request was prepared. Return to Milestones and prepare it against the current plan. This request cannot be used automatically.</p> : <>
        <p>This is a prepared request, not an approved plan. {onlineMode ? "Download or copy it to the paired local planning workflow." : "Copy these instructions for Codex, then continue with the existing plan workflow."} Preserve the primary goal and review any training changes.</p>
        <label className="milestone-instructions">Coaching instructions<textarea readOnly rows={9} value={milestoneChangeInstructions(request)} /></label>
        <div className="coach-actions"><button type="button" className="button button-secondary" onClick={() => void copyInstructions()}>Copy milestone instructions</button><button type="button" className="button button-secondary" onClick={download}>Download change request</button>{!onlineMode ? <button type="button" className="button button-primary" disabled={continuing} onClick={() => void continueToReview()}>{continuing ? "Checking plan…" : "Continue to plan review"}</button> : null}</div>
      </>}
      <div className="milestone-actions"><Link className="text-link" href="/dashboard/settings?section=milestones">Back to Milestones</Link><button className="text-link" type="button" onClick={discard}>Discard prepared change</button></div>
    </>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
