"use client";

import { useEffect, useState } from "react";
import { NativeModal } from "./native-modal";
import type { DailyWellbeingCheckIn as CheckIn, SaveDailyWellbeingRequest } from "../../../../packages/core/src/contracts/athlete-journal";

const empty: SaveDailyWellbeingRequest = { expectedRevision: 0, timezone: "Africa/Johannesburg", status: "saved", answers: {} };
const options = [["very_poor", "Very poor"], ["poor", "Poor"], ["normal", "Normal"], ["good", "Good"], ["very_good", "Very good"]] as const;
const levels = [["none", "None"], ["mild", "Mild"], ["moderate", "Moderate"], ["high", "High"], ["very_high", "Very high"]] as const;
const quickAnswers = [["good", "Good"], ["normal", "Okay"], ["poor", "Low"]] as const;

type QuickAnswer = typeof quickAnswers[number][0];
type CheckInState = "loading" | "ready" | "saving" | "error";

function localDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function CheckInForm({ draft, status, canSave, message, update, save, close, embedded = false }: {
  draft: SaveDailyWellbeingRequest;
  status: CheckInState;
  canSave: boolean;
  message: string;
  update: (patch: Partial<SaveDailyWellbeingRequest["answers"]>) => void;
  save: () => void;
  close: () => void;
  embedded?: boolean;
}) {
  return <div className="daily-check-in-form" role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : false} aria-labelledby="daily-check-in-form-heading">
    <h3 id="daily-check-in-form-heading">Today&apos;s check-in</h3>
    <label>How do you feel overall?<select value={draft.answers.overallFeeling ?? ""} onChange={(event) => update({ overallFeeling: event.target.value ? event.target.value as typeof draft.answers.overallFeeling : undefined })}><option value="">Unanswered</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>How did you sleep?<select value={draft.answers.sleepQuality ?? ""} onChange={(event) => update({ sleepQuality: event.target.value ? event.target.value as typeof draft.answers.sleepQuality : undefined })}><option value="">Unanswered</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>How fatigued do you feel?<select value={draft.answers.fatigue ?? ""} onChange={(event) => update({ fatigue: event.target.value ? event.target.value as typeof draft.answers.fatigue : undefined })}><option value="">Unanswered</option>{levels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>How sore are your muscles?<select value={draft.answers.soreness ?? ""} onChange={(event) => update({ soreness: event.target.value ? event.target.value as typeof draft.answers.soreness : undefined })}><option value="">Unanswered</option>{levels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>How ready do you feel to train?<select value={draft.answers.readiness ?? ""} onChange={(event) => update({ readiness: event.target.value ? event.target.value as typeof draft.answers.readiness : undefined })}><option value="">Unanswered</option><option value="not_ready">Not ready</option><option value="below_normal">Below normal</option><option value="normal">Normal</option><option value="ready">Ready</option><option value="very_ready">Very ready</option></select></label>
    <label>Anything else affecting you today?<textarea value={draft.answers.notes ?? ""} onChange={(event) => update({ notes: event.target.value || undefined })} rows={3} maxLength={2000} /></label>
    {status === "error" ? <p role="alert">{message}</p> : null}
    <div className="journal-form-actions"><button className="button button-primary" type="button" disabled={!canSave || status === "saving"} onClick={save}>{status === "saving" ? "Saving…" : "Save check-in"}</button><button className="button button-secondary" type="button" disabled={status === "saving"} onClick={close}>Cancel</button></div>
  </div>;
}

export function DailyWellbeingCheckIn({ timezone = "Africa/Johannesburg", date = localDate(timezone), compact = false, dailyModal = false, refreshKey = 0, onSaved }: { timezone?: string; date?: string; compact?: boolean; dailyModal?: boolean; refreshKey?: number; onSaved?: () => void }) {
  const [entry, setEntry] = useState<CheckIn | null>(null);
  const [draft, setDraft] = useState<SaveDailyWellbeingRequest>({ ...empty, timezone });
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CheckInState>("loading");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [readReady, setReadReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [prompted, setPrompted] = useState(false);
  const dismissKey = `racepredictor:check-in:${timezone}:${date}`;

  useEffect(() => {
    if (modalOpen) return;
    let active = true;
    setStatus((current) => current === "ready" ? "ready" : "loading");
    setReadReady(false);
    void fetch(`/api/v1/wellbeing-check-ins?from=${date}&to=${date}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Daily check-in is temporarily unavailable.");
      return response.json() as Promise<{ data: { items: CheckIn[] } }>;
    }).then((result) => {
      if (!active) return;
      const found = result.data.items[0] ?? null;
      setEntry(found);
      setDraft(found ? { expectedRevision: found.revision, timezone: found.timezone, status: found.status, answers: found.answers } : { ...empty, timezone });
      setStatus("ready");
      setReadReady(true);
      setMessage("");
    }).catch((error) => {
      if (active) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Daily check-in is unavailable."); }
    });
    return () => { active = false; };
  }, [date, retry, timezone, refreshKey]);

  useEffect(() => {
    if (!dailyModal || !readReady || entry || prompted) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(dismissKey) === "deferred"; } catch { /* storage is optional */ }
    setPrompted(true);
    if (!dismissed) setModalOpen(true);
  }, [dailyModal, readReady, entry, prompted, dismissKey]);

  function dismissModal() {
    if (status === "saving") return;
    try { sessionStorage.setItem(dismissKey, "deferred"); } catch { /* storage is optional */ }
    setOpen(false);
    setDraft(entry ? { expectedRevision: entry.revision, timezone: entry.timezone, status: entry.status, answers: entry.answers } : { ...empty, timezone });
    setModalOpen(false);
  }

  function update(patch: Partial<SaveDailyWellbeingRequest["answers"]>) {
    setDraft((current) => ({ ...current, answers: { ...current.answers, ...patch }, status: "saved" }));
  }

  async function refreshAfterConflict() {
    setReadReady(false);
    const response = await fetch(`/api/v1/wellbeing-check-ins?from=${date}&to=${date}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Your check-in changed elsewhere and could not be reloaded. Retry to load the latest answers before saving.");
    const result = await response.json() as { data?: { items?: CheckIn[] } };
    if (!Array.isArray(result.data?.items)) throw new Error("The latest check-in could not be read. Retry before saving.");
    const latest = result.data?.items?.[0] ?? null;
    setEntry(latest);
    setDraft(latest ? { expectedRevision: latest.revision, timezone: latest.timezone, status: latest.status, answers: latest.answers } : { ...empty, timezone });
    setReadReady(true);
  }

  async function save(statusValue: "saved" | "skipped", answers = draft.answers) {
    if (!readReady || status === "saving") return;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/v1/wellbeing-check-ins/${date}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, timezone, status: statusValue, answers }),
      });
      const result = await response.json() as { data?: CheckIn; error?: { message?: string } };
      if (response.status === 409) {
        await refreshAfterConflict();
        throw new Error("Your check-in changed elsewhere. It has been reloaded; choose your answer again.");
      }
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Daily check-in could not be saved.");
      setEntry(result.data);
      setDraft({ expectedRevision: result.data.revision, timezone: result.data.timezone, status: result.data.status, answers: result.data.answers });
      setOpen(false);
      setModalOpen(false);
      setStatus("ready");
      setMessage(statusValue === "skipped" ? "Skipped for today." : "Check-in saved.");
      onSaved?.();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Daily check-in could not be saved.");
    }
  }

  function saveQuickAnswer(value: QuickAnswer) {
    const answers = { ...entry?.answers, overallFeeling: value };
    void save("saved", answers);
  }

  function closeForm() {
    setDraft(entry ? { expectedRevision: entry.revision, timezone: entry.timezone, status: entry.status, answers: entry.answers } : { ...empty, timezone });
    setOpen(false);
  }

  if (status === "loading") return <p className="daily-check-in-state" role="status" aria-busy="true">Checking today&apos;s recovery check-in…</p>;

  if (dailyModal) return <div className="road-daily-check-in">
    <button className={`road-check-in-chip${entry?.status === "saved" ? " road-check-in-chip--saved" : ""}`} type="button" onClick={() => { setModalOpen(true); setOpen(false); }}><span className="road-check-in-icon" aria-hidden="true">{entry?.status === "saved" ? "✓" : "☺"}</span><span className="road-check-in-label">{entry?.status === "saved" ? "Check-in saved · Edit" : entry?.status === "skipped" ? "Skipped today · Edit" : "Daily check-in"}</span></button>
    {!readReady && !modalOpen ? <span className="daily-check-in-state" role="status">Check-in unavailable · <button className="text-link" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></span> : null}
    <NativeModal open={modalOpen} onClose={dismissModal} busy={status === "saving"} titleId="daily-feeling-heading" className="road-feeling-dialog">
      <header className="road-dialog-heading"><div><p className="eyebrow">Start with you</p><h2 id="daily-feeling-heading">How are you feeling?</h2></div><button className="road-close" type="button" aria-label="Close daily check-in" onClick={dismissModal} disabled={status === "saving"}>×</button></header>
      <p className="road-dialog-intro">A moment to check in before the next step.</p>
      {readReady ? <>
        <div className="road-feeling-choices" role="group" aria-label="Choose your overall feeling">{quickAnswers.map(([value, label], index) => <button key={value} className={`road-feeling-choice road-feeling-choice--${value}`} type="button" disabled={status === "saving"} aria-pressed={draft.answers.overallFeeling === value} onClick={() => update({ overallFeeling: value })}><span aria-hidden="true">{["☺", "−", "☹"][index]}</span>{label}</button>)}</div>
        {!open ? <div className="road-form-actions"><button className="button button-primary" type="button" disabled={!draft.answers.overallFeeling || status === "saving"} onClick={() => void save("saved")}>{status === "saving" ? "Saving…" : "Save check-in"}</button><button className="text-link" type="button" disabled={status === "saving"} onClick={() => void save("skipped", {})}>Skip today</button></div> : null}
        <button className="text-link" type="button" disabled={status === "saving"} onClick={() => setOpen((value) => !value)}>{open ? "Fewer details" : "Add sleep and recovery details"}</button>
        {open ? <CheckInForm embedded draft={draft} status={status} canSave={readReady} message={message} update={update} save={() => void save("saved")} close={closeForm} /> : null}
      </> : <button className="button button-secondary" type="button" onClick={() => { setModalOpen(false); setRetry((value) => value + 1); setPrompted(false); }}>Retry check-in</button>}
      {message && status !== "saving" ? <p className="daily-check-in-state" role={status === "error" ? "alert" : "status"}>{message}</p> : null}
    </NativeModal>
  </div>;
  if (status === "error" && !compact && !open) return <p className="daily-check-in-state" role="alert">{message} <button className="text-button" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>;

  if (compact) return <section className="daily-check-in daily-check-in--compact" aria-labelledby="daily-check-in-heading">
    <h3 id="daily-check-in-heading">How are you feeling today?</h3>
    {!readReady ? <button className="text-button daily-check-in-edit" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button> : <div className="daily-check-in-quick" role="group" aria-label="Choose your overall feeling">
      {quickAnswers.map(([value, label]) => <button key={value} className="button button-secondary daily-check-in-choice" type="button" disabled={status === "saving" || open} aria-pressed={entry?.status === "saved" && entry.answers.overallFeeling === value} onClick={() => saveQuickAnswer(value)}>{label}</button>)}
    </div>}
    {status === "saving" ? <p className="daily-check-in-state" role="status">Saving your check-in…</p> : null}
    {message && status !== "saving" ? <p className="daily-check-in-state" role={status === "error" ? "alert" : "status"}>{message}</p> : null}
    {entry?.status === "saved" && readReady ? <button className="text-button daily-check-in-edit" type="button" disabled={status === "saving"} onClick={() => setOpen(true)}>Edit check-in details</button> : entry?.status === "skipped" ? <p className="quiet-copy">Skipped today · choose a feeling to update</p> : null}
    {open ? <CheckInForm draft={draft} status={status} canSave={readReady} message={message} update={update} save={() => void save("saved")} close={closeForm} /> : null}
  </section>;

  return <section className="daily-check-in" aria-labelledby="daily-check-in-heading">
    <div><p className="eyebrow">Recovery check-in</p><h3 id="daily-check-in-heading">How are you feeling today?</h3><p>{entry?.status === "saved" ? "Check-in saved. You can update it any time today." : entry?.status === "skipped" ? "Skipped for today." : "Add a quick check-in about sleep, energy and recovery. Optional."}</p></div>
    <div className="daily-check-in-actions">{entry?.status === "skipped" ? <button className="button button-secondary" type="button" onClick={() => setOpen(true)}>Add today&apos;s check-in</button> : <button className="button button-secondary" type="button" onClick={() => setOpen(true)}>{entry?.status === "saved" ? "Edit check-in" : "Check in"}</button>}{!entry ? <button className="text-button" type="button" onClick={() => void save("skipped")}>Skip today</button> : null}</div>
    {message ? <p className="daily-check-in-state" role={status === "error" ? "alert" : "status"}>{message}</p> : null}
    {open ? <CheckInForm draft={draft} status={status} canSave={readReady} message={message} update={update} save={() => void save("saved")} close={closeForm} /> : null}
  </section>;
}
