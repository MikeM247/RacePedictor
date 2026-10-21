"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { raceHistoryRecordSchema, type RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import { milestoneDurationSeconds } from "../../../../packages/core/src/services/milestone-management.ts";
import type { JourneyTarget } from "../../../../packages/core/src/services/race-journey.ts";
import type { ActivitiesListResponse } from "../../../../packages/core/src/contracts/activity.ts";
import { readActivitiesListResponse } from "../../lib/activities-api-client";
import { loadMilestoneRecords, MilestoneWriteError, saveMilestoneRecord } from "../../lib/milestone-history-client.ts";
import { formatDistance, formatDuration } from "../../lib/activity-formatters";
import { formatCoachingDate, localDateInTimezone } from "../../lib/coaching-ui-state";

type Draft = { id: string; title: string; type: "goal_achieved" | "personal_best" | "race_result"; date: string; distance: string; time: string; activityId: string; targetId: string; revision: number };
const fromRecord = (record: RaceHistoryRecord): Draft => ({ id: record.id, title: record.title, type: record.achievement ?? "race_result", date: record.raceDate ?? "", distance: record.distanceMeters ? String(record.distanceMeters / 1000) : "", time: record.elapsedTimeSeconds ? formatDuration(record.elapsedTimeSeconds) : "", activityId: record.activityId ?? "", targetId: record.targetId ?? "", revision: record.revision ?? 1 });
const running = new Set(["run", "trail_run", "treadmill_run"]);

export function MilestoneAchievementEditor({ record, initialTarget, assignRace, targets, history, timezone, onSaved, onCancel, onBusy, onRefresh }: {
  record?: RaceHistoryRecord; initialTarget?: JourneyTarget; assignRace: boolean; targets: JourneyTarget[]; history: RaceHistoryRecord[]; timezone: string;
  onSaved: (message: string) => void; onCancel: () => void; onBusy: (value: boolean) => void; onRefresh: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => record ? fromRecord(record) : { id: `achievement_${crypto.randomUUID()}`, title: initialTarget?.eventName || initialTarget?.title || "", type: initialTarget ? "race_result" : "goal_achieved", date: initialTarget?.date ?? "", distance: initialTarget ? String(initialTarget.distanceMeters / 1000) : "", time: "", activityId: "", targetId: initialTarget?.id ?? "", revision: 0 });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(assignRace);
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const [activities, setActivities] = useState<ActivitiesListResponse["items"]>([]);
  const [searchState, setSearchState] = useState<"loading" | "ready" | "error">("loading");
  const [nextCursor, setNextCursor] = useState<string>();
  const generation = useRef(0);
  const writeGuard = useRef(false);
  const today = localDateInTimezone(timezone);
  const duplicate = draft.activityId ? history.find((item) => item.id !== draft.id && item.activityId === draft.activityId) : undefined;
  const eligible = (items: ActivitiesListResponse["items"]) => items.filter((item) => running.has(item.sport) && localDateInTimezone(timezone, new Date(item.occurredAt)) <= today);

  useEffect(() => {
    const token = ++generation.current;
    if (!pickerOpen) return;
    const controller = new AbortController(); setSearchState("loading"); setNextCursor(undefined);
    const timer = window.setTimeout(() => {
      void fetch(`/api/v1/activities?limit=20&search=${encodeURIComponent(search)}`, { cache: "no-store", signal: controller.signal }).then(readActivitiesListResponse).then((result) => {
        if (controller.signal.aborted || token !== generation.current) return;
        setActivities(eligible(result.items)); setNextCursor(result.nextCursor); setSearchState("ready");
      }).catch(() => { if (!controller.signal.aborted && token === generation.current) setSearchState("error"); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); generation.current += 1; };
  }, [pickerOpen, search, retry, timezone, today]);

  function change(values: Partial<Draft>) { setDraft((value) => ({ ...value, ...values })); setConfirmed(false); }
  function busyState(value: boolean) { writeGuard.current = value; setBusy(value); onBusy(value); }
  async function more() {
    if (!nextCursor || searchState === "loading") return;
    const token = generation.current; setSearchState("loading");
    try {
      const result = await readActivitiesListResponse(await fetch(`/api/v1/activities?limit=20&search=${encodeURIComponent(search)}&cursor=${encodeURIComponent(nextCursor)}`, { cache: "no-store" }));
      if (token !== generation.current) return;
      setActivities((value) => [...value, ...eligible(result.items).filter((item) => !value.some((saved) => saved.id === item.id))]); setNextCursor(result.nextCursor); setSearchState("ready");
    } catch { if (token === generation.current) setSearchState("error"); }
  }
  function select(activity: ActivitiesListResponse["items"][number]) {
    change({ title: draft.title.trim() || activity.title || "Race achievement", date: localDateInTimezone(timezone, new Date(activity.occurredAt)), distance: String(activity.distanceM / 1000), time: formatDuration(activity.elapsedTimeS), activityId: activity.id }); setPickerOpen(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (writeGuard.current || conflict) return;
    if (!confirmed) { setError("Confirm this race result or achievement before saving."); return; }
    const elapsed = draft.time ? milestoneDurationSeconds(draft.time) : undefined;
    if (draft.time && !elapsed) { setError("Use a positive mm:ss or h:mm:ss result; minutes and seconds after a colon must be below 60."); return; }
    if (draft.date > today) { setError("An achieved race cannot have a future date."); return; }
    const parsed = raceHistoryRecordSchema.safeParse({ id: draft.id, title: draft.title, confirmedBy: "user", ...(draft.type !== "race_result" ? { achievement: draft.type } : {}), ...(draft.date ? { raceDate: draft.date } : {}), ...(draft.distance ? { distanceMeters: Number(draft.distance) * 1000 } : {}), ...(elapsed ? { elapsedTimeSeconds: elapsed } : {}), ...(draft.activityId ? { activityId: draft.activityId } : {}), ...(draft.targetId ? { targetId: draft.targetId } : {}) });
    if (!parsed.success) { setError("Check the name and official result. A linked target requires a race date, official distance and elapsed result. A race-result record also requires a target."); return; }
    busyState(true); setError("");
    try { await saveMilestoneRecord(parsed.data, draft.revision); onSaved("Milestone saved. Home will use the confirmed history and existing target-comparison rules."); }
    catch (cause) { if (!(cause instanceof MilestoneWriteError) || cause.conflict) { setConflict(true); onRefresh(); } setError(cause instanceof MilestoneWriteError ? cause.message : "The save response could not be verified. Reload saved history before retrying."); }
    finally { busyState(false); }
  }
  async function reload() {
    if (writeGuard.current) return; busyState(true);
    try { const latest = (await loadMilestoneRecords()).find((item) => item.id === draft.id); onRefresh(); if (latest) { setDraft(fromRecord(latest)); setConfirmed(false); setConflict(false); setError(""); } else if (draft.revision === 0) { setConflict(false); setConfirmed(false); setError("No saved milestone was found. Review your inputs and confirm before saving again."); } else onSaved("This milestone was removed in another session."); }
    catch { setError("The latest history could not be loaded. Retry before making another change."); }
    finally { busyState(false); }
  }
  return <form className="road-achievement-form" onSubmit={(event) => void save(event)}><fieldset disabled={busy}>
    <details className="road-activity-picker" open={pickerOpen} onToggle={(event) => setPickerOpen(event.currentTarget.open)}><summary>{draft.activityId ? "Change recorded race" : "Find a recorded race"}</summary><label>Search recorded activities<input autoFocus={assignRace} type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>{searchState === "loading" ? <p role="status">Loading recorded activities…</p> : searchState === "error" ? <div role="status"><p>Activity search is unavailable. You can still confirm historical facts manually.</p><button className="text-link" type="button" onClick={() => setRetry((value) => value + 1)}>Retry activity search</button></div> : activities.length ? <ul>{activities.map((activity) => <li key={activity.id}><button type="button" onClick={() => select(activity)}><strong>{activity.title || "Recorded run"}</strong><span>{formatCoachingDate(localDateInTimezone(timezone, new Date(activity.occurredAt)), timezone)} · {formatDistance(activity.distanceM)} · {formatDuration(activity.elapsedTimeS)}</span></button></li>)}</ul> : <p>No recorded running activities match this search.</p>}{nextCursor ? <button className="text-link" type="button" disabled={searchState === "loading"} onClick={() => void more()}>Load more activities</button> : null}</details>
    {draft.activityId ? <div className="milestone-linked"><p>Recorded race linked. Check the official distance and elapsed result below.</p><button className="text-link" type="button" onClick={() => change({ activityId: "" })}>Unlink race</button></div> : null}
    {duplicate ? <p className="milestone-notice">This recorded activity is also linked to “{duplicate.title}”. Review whether a separate milestone is intended before confirming.</p> : null}
    <label>Milestone name<input autoFocus={!assignRace} required maxLength={200} value={draft.title} onChange={(e) => change({ title: e.target.value })} /></label>
    <label>Record type<select value={draft.type} onChange={(e) => change({ type: e.target.value as Draft["type"] })}><option value="goal_achieved">Confirmed goal achieved</option><option value="personal_best">Confirmed personal best</option><option value="race_result">Race result — compare with linked target</option></select></label>
    <div className="road-form-row"><label>Race date{draft.targetId ? "" : " (optional)"}<input required={Boolean(draft.targetId)} type="date" max={today} value={draft.date} onChange={(e) => change({ date: e.target.value })} /></label><label>Official distance, km{draft.targetId ? "" : " (optional)"}<input required={Boolean(draft.targetId)} type="number" min="0.001" max="500" step="0.001" value={draft.distance} onChange={(e) => change({ distance: e.target.value })} /></label></div>
    <label>Elapsed result{draft.targetId ? "" : " (optional)"}<input required={Boolean(draft.targetId)} pattern="[0-9]{1,3}:[0-5][0-9](:[0-5][0-9])?" value={draft.time} onChange={(e) => change({ time: e.target.value })} placeholder="h:mm:ss or mm:ss" /></label>
    <label>Linked approved target<select required={draft.type === "race_result"} value={draft.targetId} onChange={(e) => change({ targetId: e.target.value })}><option value="">No target link</option>{draft.targetId && !targets.some((item) => item.id === draft.targetId) ? <option value={draft.targetId}>Saved approved target</option> : null}{targets.map((item) => <option key={item.id} value={item.id}>{item.eventName || item.title} · {item.date}</option>)}</select></label><p className="quiet-copy">A target link requires a race date, official distance and elapsed result. Linking alone does not prove the target was achieved.</p>
    <label className="road-confirmation"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm this race result or achievement, including any personal-best claim.</label>
    <div className="road-form-actions"><button className="button button-primary" type="submit" disabled={!confirmed || conflict}>{busy ? "Saving…" : "Save milestone"}</button><button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button></div>
  </fieldset>{error ? <p role="alert" className="milestone-error">{error}</p> : null}{conflict ? <button className="text-link" type="button" disabled={busy} onClick={() => void reload()}>Reload saved milestone</button> : null}</form>;
}
