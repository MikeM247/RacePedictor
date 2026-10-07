"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyWellbeingCheckIn, SaveDailyWellbeingRequest } from "../../../../packages/core/src/contracts/athlete-journal";

const empty: SaveDailyWellbeingRequest = { expectedRevision: 0, timezone: "Africa/Johannesburg", status: "saved", answers: {} };
const options = [["very_poor", "Very poor"], ["poor", "Poor"], ["normal", "Normal"], ["good", "Good"], ["very_good", "Very good"]] as const;
const levels = [["none", "None"], ["mild", "Mild"], ["moderate", "Moderate"], ["high", "High"], ["very_high", "Very high"]] as const;

function localDate(timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export function DailyWellbeingCheckIn({ timezone = "Africa/Johannesburg" }: { timezone?: string }) {
  const date = useMemo(() => localDate(timezone), [timezone]);
  const [entry, setEntry] = useState<DailyWellbeingCheckIn | null>(null);
  const [draft, setDraft] = useState<SaveDailyWellbeingRequest>({ ...empty, timezone });
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/wellbeing-check-ins?from=${date}&to=${date}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Daily check-in is temporarily unavailable.");
      return response.json() as Promise<{ data: { items: DailyWellbeingCheckIn[] } }>;
    }).then((result) => {
      if (!active) return;
      const found = result.data.items[0] ?? null;
      setEntry(found); setDraft(found ? { expectedRevision: found.revision, timezone: found.timezone, status: found.status, answers: found.answers } : { ...empty, timezone }); setStatus("ready");
    }).catch((error) => { if (active) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Daily check-in is unavailable."); } });
    return () => { active = false; };
  }, [date, timezone]);

  function update(patch: Partial<SaveDailyWellbeingRequest["answers"]>) { setDraft((current) => ({ ...current, answers: { ...current.answers, ...patch }, status: "saved" })); }
  async function save(statusValue: "saved" | "skipped") {
    setStatus("saving"); setMessage("");
    try {
      const response = await fetch(`/api/v1/wellbeing-check-ins/${date}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, timezone, status: statusValue }) });
      const result = await response.json() as { data?: DailyWellbeingCheckIn; error?: { message?: string } };
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Daily check-in could not be saved.");
      setEntry(result.data); setDraft({ expectedRevision: result.data.revision, timezone: result.data.timezone, status: result.data.status, answers: result.data.answers }); setOpen(false); setStatus("ready"); setMessage(statusValue === "skipped" ? "Skipped for today." : "Check-in saved.");
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Daily check-in could not be saved."); }
  }

  if (status === "loading") return <p className="daily-check-in-state" role="status">Checking today&apos;s recovery check-in…</p>;
  if (status === "error" && !open) return <p className="daily-check-in-state" role="status">{message}</p>;
  return <section className="daily-check-in" aria-labelledby="daily-check-in-heading"><div><p className="eyebrow">Recovery check-in</p><h3 id="daily-check-in-heading">How are you feeling today?</h3><p>{entry?.status === "saved" ? "Check-in saved. You can update it any time today." : entry?.status === "skipped" ? "Skipped for today." : "Add a quick check-in about sleep, energy and recovery. Optional."}</p></div><div className="daily-check-in-actions">{entry?.status === "skipped" ? <button className="button button-secondary" type="button" onClick={() => setOpen(true)}>Add today&apos;s check-in</button> : <button className="button button-secondary" type="button" onClick={() => setOpen(true)}>{entry?.status === "saved" ? "Edit check-in" : "Check in"}</button>}{!entry ? <button className="text-button" type="button" onClick={() => void save("skipped")}>Skip today</button> : null}</div>{message ? <p className="daily-check-in-state" role="status">{message}</p> : null}{open ? <div className="daily-check-in-form" role="dialog" aria-modal="false" aria-labelledby="daily-check-in-form-heading"><h4 id="daily-check-in-form-heading">Today&apos;s check-in</h4><label>How do you feel overall?<select value={draft.answers.overallFeeling ?? ""} onChange={(event) => update({ overallFeeling: event.target.value ? event.target.value as typeof draft.answers.overallFeeling : undefined })}><option value="">Unanswered</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>How did you sleep?<select value={draft.answers.sleepQuality ?? ""} onChange={(event) => update({ sleepQuality: event.target.value ? event.target.value as typeof draft.answers.sleepQuality : undefined })}><option value="">Unanswered</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>How fatigued do you feel?<select value={draft.answers.fatigue ?? ""} onChange={(event) => update({ fatigue: event.target.value ? event.target.value as typeof draft.answers.fatigue : undefined })}><option value="">Unanswered</option>{levels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>How sore are your muscles?<select value={draft.answers.soreness ?? ""} onChange={(event) => update({ soreness: event.target.value ? event.target.value as typeof draft.answers.soreness : undefined })}><option value="">Unanswered</option>{levels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>How ready do you feel to train?<select value={draft.answers.readiness ?? ""} onChange={(event) => update({ readiness: event.target.value ? event.target.value as typeof draft.answers.readiness : undefined })}><option value="">Unanswered</option><option value="not_ready">Not ready</option><option value="below_normal">Below normal</option><option value="normal">Normal</option><option value="ready">Ready</option><option value="very_ready">Very ready</option></select></label><label>Anything else affecting you today?<textarea value={draft.answers.notes ?? ""} onChange={(event) => update({ notes: event.target.value || undefined })} rows={3} maxLength={2000} /></label>{status === "error" ? <p role="alert">{message}</p> : null}<div className="journal-form-actions"><button className="button button-primary" type="button" disabled={status === "saving"} onClick={() => void save("saved")}>{status === "saving" ? "Saving…" : "Save check-in"}</button><button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button></div></div> : null}</section>;
}
