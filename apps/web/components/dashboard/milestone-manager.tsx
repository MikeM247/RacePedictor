"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NativeModal } from "../coaching/native-modal";
import type { RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import type { GoalContextRouteData, RaceMilestone } from "../../../../packages/core/src/contracts/coaching.ts";
import { buildRaceJourney, type JourneyTarget } from "../../../../packages/core/src/services/race-journey.ts";
import { milestoneChangeIsCurrent, milestoneChangeLabel, prepareMilestoneChange, type MilestoneChangeRequest } from "../../../../packages/core/src/services/milestone-management.ts";
import { discardMilestoneChange, milestoneChangeExists, readMilestoneChange, storeMilestoneChange } from "../../lib/milestone-change-storage.ts";
import { loadMilestoneRecords, MilestoneWriteError, removeMilestoneRecord } from "../../lib/milestone-history-client.ts";
import { formatDistance, formatDuration } from "../../lib/activity-formatters";
import { formatCoachingDate, localDateInTimezone } from "../../lib/coaching-ui-state";
import { MilestoneAchievementEditor } from "./milestone-achievement-editor";
import { MilestoneTargetForm, PreparedMilestoneChange } from "./milestone-plan-update";

type View = "choose" | "achievement" | "target" | "remove-achievement" | "remove-target" | null;
export function MilestoneManager({ history, targets, context, timezone, historyReady, onChange }: {
  history: RaceHistoryRecord[]; targets: JourneyTarget[]; context: GoalContextRouteData | null; timezone: string; historyReady: boolean; onChange: () => void;
}) {
  const [tab, setTab] = useState<"achievements" | "targets">("achievements");
  const [view, setView] = useState<View>(null);
  const [record, setRecord] = useState<RaceHistoryRecord>();
  const [initialTarget, setInitialTarget] = useState<JourneyTarget>();
  const [target, setTarget] = useState<RaceMilestone>();
  const [targetContext, setTargetContext] = useState<GoalContextRouteData | null>(null);
  const [assign, setAssign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [prepared, setPrepared] = useState<MilestoneChangeRequest | null>(null);
  const [storedRequestPresent, setStoredRequestPresent] = useState(false);
  const [replace, setReplace] = useState(false);
  const writeGuard = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const today = localDateInTimezone(timezone);
  const canPrepare = context?.state === "ready" && Boolean(context.plan) && context.goal?.target.kind === "performance";
  const journey = buildRaceJourney(context, history, today);
  const achieved = new Set(journey.achieved.map((item) => item.id));
  const ahead = journey.ahead.filter((item) => !item.mainGoal);

  useEffect(() => {
    if (!context?.goal) { setPrepared(null); setStoredRequestPresent(false); return; }
    try { setStoredRequestPresent(milestoneChangeExists(window.sessionStorage, context.goal.athleteId)); setPrepared(readMilestoneChange(window.sessionStorage, context.goal.athleteId)); }
    catch { setStoredRequestPresent(true); setPrepared(null); setMessage("A prepared request could not be read. Discard or replace it in Plan."); }
  }, [context]);
  function reset() { setError(""); setMessage(""); setConflict(false); setReplace(false); }
  function close() { if (!writeGuard.current) { setView(null); setError(""); setConflict(false); } }
  function onBusy(value: boolean) { writeGuard.current = value; setBusy(value); }
  function editAchievement(item?: RaceHistoryRecord, assigning = false, raceTarget?: JourneyTarget) {
    reset(); setRecord(item); setAssign(assigning); setInitialTarget(raceTarget); setView("achievement");
  }
  function editTarget(item?: RaceMilestone, removing = false) { reset(); setTarget(item); setTargetContext(context); setView(removing ? "remove-target" : "target"); }
  function finished(text: string) { setView(null); setError(""); setConflict(false); setMessage(text); onChange(); requestAnimationFrame(() => addButton.current?.focus()); }
  function preparedChange(request: MilestoneChangeRequest) { setPrepared(request); setStoredRequestPresent(true); setView(null); setMessage(`${milestoneChangeLabel(request)}: request prepared in this tab. Your approved plan has not changed.`); requestAnimationFrame(() => addButton.current?.focus()); }
  async function remove() {
    if (!record || writeGuard.current || conflict) return;
    onBusy(true); setError("");
    try { await removeMilestoneRecord(record); finished(`Milestone removed. Its recorded activity remains in history.${record.targetId ? " Its approved target may return to Result pending." : ""}`); }
    catch (cause) { if (cause instanceof MilestoneWriteError && cause.conflict) { setConflict(true); onChange(); } setError(cause instanceof Error ? cause.message : "Removal failed."); }
    finally { onBusy(false); }
  }
  async function reload() {
    if (!record || writeGuard.current) return;
    onBusy(true);
    try { const latest = (await loadMilestoneRecords()).find((item) => item.id === record.id); onChange(); if (latest) editAchievement(latest); else finished("This milestone was removed in another session."); }
    catch { setError("The latest history could not be loaded. Retry before deciding again."); }
    finally { onBusy(false); }
  }
  function prepareRemoval() {
    if (!target) return;
    if (!canPrepare) { setError("The current approved plan could not be verified. Cancel and reload targets before preparing a removal."); return; }
    if (storedRequestPresent && !replace) { setError("Confirm replacement of the prepared request in this tab."); return; }
    try { const request = prepareMilestoneChange(targetContext, { operation: "remove", milestoneId: target.id }); if (!milestoneChangeIsCurrent(request, context)) { setError("The approved plan changed. Cancel and reopen this target against the current plan."); return; } storeMilestoneChange(window.sessionStorage, request); preparedChange(request); }
    catch { setError("The removal request could not be kept. Refresh the plan and allow session storage, then retry."); }
  }
  function discard() {
    if (!context?.goal) return;
    try { discardMilestoneChange(window.sessionStorage, context.goal.athleteId); setPrepared(null); setStoredRequestPresent(false); setMessage("Prepared change discarded. The approved plan is unchanged."); }
    catch { setMessage("The prepared change could not be discarded. Allow session storage and retry."); }
  }
  const title = view === "choose" ? "Add milestone" : view === "remove-achievement" ? "Remove milestone?" : view === "remove-target" ? "Remove race target?" : view === "target" ? target ? "Edit race target" : "Add race target" : record ? "Edit milestone" : "Add achieved milestone";

  return <div className="milestone-manager">
    <div className="milestone-manager-toolbar"><p>Race targets and achievements on your Home timeline.</p><button ref={addButton} className="button button-primary" type="button" onClick={() => { reset(); setView("choose"); }}>Add milestone</button></div>
    <div className="milestone-tabs" role="group" aria-label="Milestone category"><button className="text-link" type="button" aria-pressed={tab === "achievements"} onClick={() => setTab("achievements")}>Achievements{historyReady ? ` (${history.length})` : ""}</button><button className="text-link" type="button" aria-pressed={tab === "targets"} onClick={() => setTab("targets")}>Race targets{context?.state === "ready" ? ` (${ahead.length})` : ""}</button></div>
    {tab === "achievements" ? <section aria-label="Achievements and race results"><p className="quiet-copy">Confirmed achievements and saved race results. Unknown dates and results can stay blank.</p>{!historyReady ? <p>Load your saved history to manage achievements.</p> : history.length === 0 ? <p>No achievements yet. Add a milestone to record your story so far.</p> : <ul className="milestone-records">{history.map((item) => <li key={item.id}>
      <div className="milestone-record-heading"><h3>{item.title}</h3><span className={`milestone-state ${achieved.has(item.id) ? "milestone-state--achieved" : ""}`}>{achieved.has(item.id) ? item.achievement === "personal_best" ? "Confirmed personal best" : "Confirmed achievement" : "Result recorded"}</span></div>
      <p>{item.raceDate ? formatCoachingDate(item.raceDate, timezone) : "Date not set"}{item.distanceMeters ? ` · ${formatDistance(item.distanceMeters)}` : ""} · {item.elapsedTimeSeconds ? formatDuration(item.elapsedTimeSeconds) : "Result not set"}</p><p className="quiet-copy">{item.activityId ? "Recorded race linked" : "No recorded race linked"}{item.targetId ? " · Approved target linked" : ""}</p>
      <div className="milestone-actions"><button className="text-link" type="button" onClick={() => editAchievement(item)} aria-label={`Edit ${item.title}`}>Edit</button><button className="text-link" type="button" onClick={() => editAchievement(item, true)} aria-label={`${item.activityId ? "Change race for" : "Assign race to"} ${item.title}`}>{item.activityId ? "Change race" : "Assign race"}</button><button className="text-link milestone-remove" type="button" onClick={() => { reset(); setRecord(item); setView("remove-achievement"); }} aria-label={`Remove ${item.title}`}>Remove</button></div>
    </li>)}</ul>}</section> : <section aria-label="Approved race targets">{context?.state !== "ready" ? <p>Verified race targets are unavailable. Achievements can still be managed when history is loaded.</p> : ahead.length === 0 ? <p>No remaining intermediate race targets in your approved plan.</p> : <ul className="milestone-records">{ahead.map((item) => <li key={item.id}>
      <div className="milestone-record-heading"><h3>{item.eventName || item.title}</h3><span className="milestone-state">{item.date < today ? "Result pending" : "Upcoming"}</span></div><p>{formatCoachingDate(item.date, timezone)} · {formatDistance(item.distanceMeters)}{item.targetTimeSeconds ? ` · Target ${formatDuration(item.targetTimeSeconds)}` : ""}</p>
      <div className="milestone-actions">{item.date <= today ? <button className="text-link" type="button" disabled={!historyReady} onClick={() => editAchievement(undefined, true, item)}>Record result<span className="sr-only"> for {item.eventName || item.title}</span></button> : <span className="quiet-copy">Record a result on or after race day.</span>}<button className="text-link" type="button" onClick={() => editTarget(context.milestones?.find((r) => r.id === item.id))} aria-label={`Edit target ${item.eventName || item.title}`}>Edit</button><button className="text-link milestone-remove" type="button" onClick={() => editTarget(context.milestones?.find((r) => r.id === item.id), true)} aria-label={`Remove target ${item.eventName || item.title}`}>Remove</button></div>
    </li>)}</ul>}<p className="quiet-copy">Target changes require a complete replacement plan, explicit approval and publication.</p></section>}
    {prepared ? <PreparedMilestoneChange request={prepared} onDiscard={discard} /> : storedRequestPresent && context?.goal ? <p><Link className="text-link" href="/dashboard/plan?milestoneUpdate=1">Review prepared request in Plan</Link></p> : null}{message ? <p role="status" className="milestone-feedback">{message}</p> : null}
    <NativeModal open={view !== null} titleId="milestone-dialog-heading" onClose={close} busy={busy} className="road-history-dialog milestone-dialog">
      <header className="road-dialog-heading"><h2 id="milestone-dialog-heading">{title}</h2><button className="road-close" aria-label="Close milestone dialog" type="button" disabled={busy} onClick={close}>×</button></header>
      {view === "choose" ? <div className="milestone-type-choice"><p>Choose what this milestone represents.</p><button className="button button-secondary" disabled={!historyReady} type="button" onClick={() => editAchievement()}>Achieved milestone</button><p className="quiet-copy">A confirmed achievement or recorded race result.</p><button className="button button-secondary" type="button" disabled={!canPrepare} onClick={() => editTarget()}>Planned race target</button><p className="quiet-copy">Prepare a change for plan review.{!canPrepare ? " A verified approved performance plan is required." : ""}</p></div> : null}
      {view === "achievement" ? <MilestoneAchievementEditor record={record} initialTarget={initialTarget} assignRace={assign} targets={targets} history={history} timezone={timezone} onSaved={finished} onCancel={close} onBusy={onBusy} onRefresh={onChange} /> : null}
      {view === "target" && targetContext ? <MilestoneTargetForm key={target?.id ?? "new"} context={targetContext} latestContext={context} target={target} onPrepared={preparedChange} onCancel={close} /> : null}
      {view === "remove-achievement" && record ? <div><p>Remove “{record.title}” from your milestones? Its linked recorded activity will stay in your history.{record.targetId ? " Its approved target may return to Result pending." : ""}</p><div className="road-form-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={close}>Keep milestone</button><button className="button button-secondary milestone-remove" type="button" disabled={busy || conflict} onClick={() => void remove()}>{busy ? "Removing…" : "Remove milestone"}</button></div></div> : null}
      {view === "remove-target" && target ? <div><p>Prepare removal of “{target.eventName || target.title}”? It stays in your approved plan until a complete replacement plan is reviewed, approved and published.</p>{storedRequestPresent ? <label className="road-confirmation"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Replace the prepared request in this tab.</label> : null}<div className="road-form-actions"><button className="button button-secondary" type="button" onClick={close}>Keep target</button><button className="button button-primary" type="button" onClick={prepareRemoval}>Prepare removal</button></div></div> : null}
      {error ? <p role="alert" className="milestone-error">{error}</p> : null}{conflict ? <button className="text-link" type="button" disabled={busy} onClick={() => void reload()}>Reload saved milestone</button> : null}
    </NativeModal>
  </div>;
}
