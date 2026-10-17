"use client";

import { useEffect, useState, type FormEvent } from "react";
import { NativeModal } from "../coaching/native-modal";
import type { RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import type { JourneyTarget } from "../../../../packages/core/src/services/race-journey.ts";
import type { ActivitiesListResponse } from "../../../../packages/core/src/contracts/activity.ts";
import { readActivitiesListResponse } from "../../lib/activities-api-client";
import { formatDistance, formatDuration } from "../../lib/activity-formatters";
import { localDateInTimezone } from "../../lib/coaching-ui-state";

type Draft = { id: string; title: string; achievement: "personal_best" | "goal_achieved" | "race_result"; raceDate: string; distance: string; elapsed: string; activityId: string; targetId: string; revision: number };
function newDraft(): Draft { return { id: `achievement_${crypto.randomUUID()}`, title: "", achievement: "goal_achieved", raceDate: "", distance: "", elapsed: "", activityId: "", targetId: "", revision: 0 }; }
function editDraft(record: RaceHistoryRecord): Draft { return { id: record.id, title: record.title, achievement: record.achievement ?? "race_result", raceDate: record.raceDate ?? "", distance: record.distanceMeters ? String(record.distanceMeters / 1000) : "", elapsed: record.elapsedTimeSeconds ? formatDuration(record.elapsedTimeSeconds) : "", activityId: record.activityId ?? "", targetId: record.targetId ?? "", revision: record.revision ?? 1 }; }
function durationSeconds(value: string) {
  if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value)) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.slice(1).some((part) => part > 59)) return undefined;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

export function RaceAchievementManager({ history, targets, timezone, onChange }: { history: RaceHistoryRecord[]; targets: JourneyTarget[]; timezone: string; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [activities, setActivities] = useState<ActivitiesListResponse["items"]>([]);
  const [searchState, setSearchState] = useState<"loading" | "ready" | "error">("ready");
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [conflictRecord, setConflictRecord] = useState<RaceHistoryRecord | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState("loading");
      void fetch(`/api/v1/activities?limit=20&search=${encodeURIComponent(search)}`, { cache: "no-store", signal: controller.signal })
        .then(readActivitiesListResponse).then((result) => {
          if (!controller.signal.aborted) { setActivities(result.items.filter((activity) => ["run", "trail_run", "treadmill_run"].includes(activity.sport))); setNextCursor(result.nextCursor); setSearchState("ready"); }
        }).catch(() => { if (!controller.signal.aborted) setSearchState("error"); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, search]);

  const startEdit = (record?: RaceHistoryRecord) => { setDraft(record ? editDraft(record) : newDraft()); setConfirmed(false); setMessage(""); setConflict(false); };
  const close = () => { if (!busy) setOpen(false); };
  async function loadMoreActivities() {
    if (!nextCursor || searchState === "loading") return;
    setSearchState("loading");
    try {
      const response = await fetch(`/api/v1/activities?limit=20&search=${encodeURIComponent(search)}&cursor=${encodeURIComponent(nextCursor)}`, { cache: "no-store" });
      const result = await readActivitiesListResponse(response);
      setActivities((current) => [...current, ...result.items.filter((activity) => ["run", "trail_run", "treadmill_run"].includes(activity.sport) && !current.some((item) => item.id === activity.id))]);
      setNextCursor(result.nextCursor); setSearchState("ready");
    } catch { setSearchState("error"); }
  }
  function selectActivity(activity: ActivitiesListResponse["items"][number]) {
    setDraft((current) => ({ ...(current ?? newDraft()), title: activity.title || "Race achievement", raceDate: localDateInTimezone(timezone, new Date(activity.occurredAt)), distance: String(activity.distanceM / 1000), elapsed: formatDuration(activity.elapsedTimeS), activityId: activity.id }));
    setConfirmed(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !confirmed || busy || conflict) return;
    const elapsedTimeSeconds = draft.elapsed ? durationSeconds(draft.elapsed) : undefined;
    if (draft.elapsed && !elapsedTimeSeconds) { setMessage("Use mm:ss or h:mm:ss for the elapsed result."); return; }
    const record = { id: draft.id, title: draft.title, confirmedBy: "user", ...(draft.achievement !== "race_result" ? { achievement: draft.achievement } : {}),
      ...(draft.raceDate ? { raceDate: draft.raceDate } : {}), ...(draft.distance ? { distanceMeters: Number(draft.distance) * 1000 } : {}),
      ...(elapsedTimeSeconds ? { elapsedTimeSeconds } : {}), ...(draft.activityId ? { activityId: draft.activityId } : {}), ...(draft.targetId ? { targetId: draft.targetId } : {}) };
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/v1/coaching/race-history", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ record, expectedRevision: draft.revision }) });
      const body = await response.json();
      if (response.status === 409) {
        setConflict(true); setConflictRecord(null); onChange();
        const latestResponse = await fetch("/api/v1/coaching/race-history", { cache: "no-store" });
        if (latestResponse.ok) {
          const latest = await latestResponse.json();
          setConflictRecord(latest.data.items.find((item: RaceHistoryRecord) => item.id === draft.id) ?? null);
        }
      }
      if (!response.ok) throw new Error(body.error?.message ?? "Achievement could not be saved.");
      onChange(); setDraft(null); setMessage("Achievement saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Achievement could not be saved."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!draft?.revision || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/coaching/race-history?id=${encodeURIComponent(draft.id)}&revision=${draft.revision}`, { method: "DELETE" });
      if (!response.ok) { if (response.status === 409) { setConflict(true); onChange(); } throw new Error("Achievement could not be removed. Reload the latest history and try again."); }
      onChange(); setDraft(null); setMessage("Achievement removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Removal failed."); }
    finally { setBusy(false); }
  }

  return <>
    <button className="road-manage text-link" type="button" onClick={() => { setOpen(true); setDraft(null); setMessage(""); }}>Manage achievements</button>
    <NativeModal open={open} titleId="race-history-heading" onClose={close} busy={busy} className="road-history-dialog">
      <header className="road-dialog-heading"><div><p className="eyebrow">Your story so far</p><h2 id="race-history-heading">Race achievements</h2></div><button className="road-close" aria-label="Close achievements" type="button" disabled={busy} onClick={close}>×</button></header>
      <p className="road-dialog-intro">Choose a recorded race, or add a confirmed achievement. Dates and times can stay blank when unknown.</p>
      {!draft ? <><ul className="road-history-list">{history.map((record) => <li key={record.id}><span>{record.title}</span><button className="text-link" type="button" onClick={() => startEdit(record)}>Edit<span className="sr-only"> {record.title}</span></button></li>)}</ul><button className="button button-secondary" type="button" onClick={() => startEdit()}>Add achievement</button></> : null}
      <details className="road-activity-picker"><summary>Find a race in your activities</summary><label>Search recorded activities<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Race name, for example Comrades" /></label>{searchState === "loading" ? <p role="status">Loading activities…</p> : searchState === "error" ? <p role="status">Activity search is unavailable. You can still add a confirmed achievement.</p> : <ul>{activities.map((activity) => <li key={activity.id}><button type="button" onClick={() => selectActivity(activity)} disabled={busy}><strong>{activity.title || "Recorded run"}</strong><span>{localDateInTimezone(timezone, new Date(activity.occurredAt))} · {formatDistance(activity.distanceM)} · {formatDuration(activity.elapsedTimeS)}</span></button></li>)}</ul>}{nextCursor ? <button className="text-link" type="button" disabled={searchState === "loading"} onClick={() => void loadMoreActivities()}>Load more activities</button> : null}</details>
      {draft ? <form className="road-achievement-form" onSubmit={(event) => void save(event)}>
        <label>Achievement name<input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="For example, my half-marathon goal" /></label>
        <label>Record type<select value={draft.achievement} onChange={(event) => setDraft({ ...draft, achievement: event.target.value as Draft["achievement"] })}><option value="goal_achieved">Confirmed goal achieved</option><option value="personal_best">Confirmed personal best</option><option value="race_result">Race result — compare with linked target</option></select></label>
        <div className="road-form-row"><label>Race date (optional)<input type="date" max={localDateInTimezone(timezone)} value={draft.raceDate} onChange={(event) => setDraft({ ...draft, raceDate: event.target.value })} /></label><label>Official distance, km<input type="number" min="0.001" max="500" step="0.001" value={draft.distance} onChange={(event) => setDraft({ ...draft, distance: event.target.value })} /></label></div>
        <label>Elapsed result (optional)<input inputMode="text" value={draft.elapsed} onChange={(event) => setDraft({ ...draft, elapsed: event.target.value })} placeholder="h:mm:ss or mm:ss" /></label>
        <label>Linked approved target<select value={draft.targetId} onChange={(event) => setDraft({ ...draft, targetId: event.target.value })}><option value="">Historical achievement</option>{draft.targetId && !targets.some((target) => target.id === draft.targetId) ? <option value={draft.targetId}>Saved target</option> : null}{targets.map((target) => <option key={target.id} value={target.id}>{target.eventName || target.title} · {target.date}</option>)}</select></label>
        {draft.activityId ? <div><p className="quiet-copy">Linked to your selected recorded activity. Check the official race distance and elapsed result above.</p><button className="text-link" type="button" disabled={busy} onClick={() => setDraft({ ...draft, activityId: "" })}>Unlink recorded activity</button></div> : null}
        <label className="road-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this race result or achievement.</label>
        <div className="road-form-actions"><button className="button button-primary" type="submit" disabled={!confirmed || busy || conflict}>{busy ? "Saving…" : "Save achievement"}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>{draft.revision > 0 ? <button className="text-link" type="button" disabled={busy || conflict} onClick={() => void remove()}>Remove achievement</button> : null}</div>
        {conflict ? <button className="text-link" type="button" disabled={busy} onClick={() => { if (conflictRecord) startEdit(conflictRecord); else { setDraft(null); setConflict(false); } }}>Reload saved achievement</button> : null}
      </form> : null}
      {message ? <p className="road-form-message" role="status">{message}</p> : null}
    </NativeModal>
  </>;
}
