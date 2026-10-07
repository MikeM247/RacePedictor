"use client";

import { useEffect, useState } from "react";
import type { ActivityReflection, ActivityReflectionType, SaveActivityReflectionRequest } from "../../../../packages/core/src/contracts/athlete-journal";

const blank: SaveActivityReflectionRequest = { expectedRevision: 0, type: null, answers: {}, sections: [] };
const feelingOptions = [["very_poor", "Very poor"], ["poor", "Poor"], ["normal", "Normal"], ["good", "Good"], ["very_good", "Very good"]] as const;

export function ActivityReflection({ activityId, headingLevel = 3, recordHeadingId }: { activityId: string; headingLevel?: 3 | 4; recordHeadingId?: string }) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const [saved, setSaved] = useState<ActivityReflection | null>(null);
  const [draft, setDraft] = useState<SaveActivityReflectionRequest>(blank);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/reflection`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Reflection is temporarily unavailable.");
        return response.json() as Promise<{ data: ActivityReflection | null }>;
      })
      .then((result) => {
        if (!active) return;
        setSaved(result.data);
        setDraft(result.data ? { expectedRevision: result.data.revision, type: result.data.type, answers: result.data.answers, sections: result.data.sections } : blank);
        setStatus("ready");
      })
      .catch((error) => { if (active) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Reflection could not be loaded."); } });
    return () => { active = false; };
  }, [activityId]);

  function updateAnswers(patch: Partial<SaveActivityReflectionRequest["answers"]>) {
    setDraft((current) => ({ ...current, answers: { ...current.answers, ...patch } }));
  }

  function toggleLimiter(value: NonNullable<SaveActivityReflectionRequest["answers"]["limiters"]>[number]) {
    const current = draft.answers.limiters ?? [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : (value === "none" || value === "unsure" ? [value] : [...current.filter((item) => item !== "none" && item !== "unsure"), value]);
    updateAnswers({ limiters: next.length ? next : undefined });
  }

  async function save() {
    setStatus("saving"); setMessage("");
    try {
      const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/reflection`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json() as { data?: ActivityReflection; error?: { message?: string } };
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Reflection could not be saved.");
      setSaved(result.data); setDraft({ expectedRevision: result.data.revision, type: result.data.type, answers: result.data.answers, sections: result.data.sections }); setOpen(false); setStatus("ready"); setMessage("Reflection saved.");
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Reflection could not be saved."); }
  }

  function addSection() {
    setDraft((current) => ({ ...current, sections: [...current.sections, { id: `section_${Date.now()}`, kind: "turning_point" as const }] }));
  }

  return <section className="activity-athlete-reflection detail-subsection" aria-labelledby={`activity-reflection-${activityId}${recordHeadingId ? ` ${recordHeadingId}` : ""}`}>
    <div className="detail-section-heading"><div><p className="eyebrow">Athlete journal</p><Heading id={`activity-reflection-${activityId}`}>Your reflection</Heading></div>{saved ? <span className="activity-review-badge">Saved</span> : null}</div>
    {status === "loading" ? <p className="activity-review-state" role="status">Checking for your reflection…</p> : null}
    {status === "error" && !open ? <p className="activity-review-state activity-review-state--error" role="alert">{message}</p> : null}
    {!open ? <><p className="activity-review-state">{saved ? "Your answers are saved separately from AI feedback." : "Add context that the activity numbers cannot show. Every answer is optional."}</p><button className="button button-secondary" type="button" onClick={() => { setOpen(true); setStatus("ready"); }}>{saved ? "Edit reflection" : "Add reflection"}</button>{message && saved ? <p className="activity-review-context" role="status">{message}</p> : null}</> : <div className="athlete-journal-form">
      <fieldset><legend>What kind of activity was this?</legend><p className="form-help">Optional. Leave this unanswered to see all questions.</p><div className="journal-choice-row">{([ ["training", "Training"], ["race", "Race"], [null, "Ignore"] ] as const).map(([value, label]) => <label key={label}><input type="radio" name={`reflection-type-${activityId}`} checked={draft.type === value} onChange={() => setDraft((current) => ({ ...current, type: value as ActivityReflectionType | null }))} /> {label}</label>)}</div></fieldset>
      <fieldset><legend>How did it feel?</legend><label>Whole activity RPE <select value={draft.answers.overallRpe ?? ""} onChange={(event) => updateAnswers({ overallRpe: event.target.value ? Number(event.target.value) : undefined })}><option value="">Unanswered</option>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><label>Overall feeling <select value={draft.answers.overallFeeling ?? ""} onChange={(event) => updateAnswers({ overallFeeling: event.target.value ? event.target.value as typeof draft.answers.overallFeeling : undefined })}><option value="">Unanswered</option>{feelingOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Compared with expectations <select value={draft.answers.expectation ?? ""} onChange={(event) => updateAnswers({ expectation: event.target.value ? event.target.value as typeof draft.answers.expectation : undefined })}><option value="">Unanswered</option><option value="easier">Easier</option><option value="as_expected">As expected</option><option value="harder">Harder</option><option value="unsure">Unsure</option></select></label></fieldset>
      <fieldset><legend>What limited you?</legend><div className="journal-choice-row">{([ ["none", "Nothing"], ["unsure", "Unsure"], ["breathing", "Breathing"], ["legs", "Legs"], ["energy", "Energy"], ["stomach", "Stomach"], ["heat", "Heat"], ["motivation", "Motivation"], ["other", "Other"] ] as const).map(([value, label]) => <label key={value}><input type="checkbox" checked={draft.answers.limiters?.includes(value) ?? false} onChange={() => toggleLimiter(value)} /> {label}</label>)}</div><label>Pain or unusual discomfort <select value={draft.answers.pain?.present ?? ""} onChange={(event) => updateAnswers({ pain: event.target.value ? { ...draft.answers.pain, present: event.target.value as NonNullable<typeof draft.answers.pain>["present"] } : undefined })}><option value="">Unanswered</option><option value="no">No</option><option value="yes">Yes</option><option value="unsure">Unsure</option></select></label></fieldset>
      <fieldset><legend>What should your coach know?</legend><label>Context notes <textarea value={draft.answers.contextNotes ?? ""} onChange={(event) => updateAnswers({ contextNotes: event.target.value || undefined })} maxLength={2000} rows={3} /></label><label>Coach note <textarea value={draft.answers.coachNote ?? ""} onChange={(event) => updateAnswers({ coachNote: event.target.value || undefined })} maxLength={2000} rows={3} /></label></fieldset>
      {draft.type !== "race" ? <fieldset><legend>Training questions</legend><label>What were you trying to achieve?<textarea value={draft.answers.training?.objective ?? ""} onChange={(event) => updateAnswers({ training: { ...draft.answers.training, objective: event.target.value || undefined } })} maxLength={2000} rows={2} /></label><label>Did you complete the intended workout?<select value={draft.answers.training?.completion ?? ""} onChange={(event) => updateAnswers({ training: { ...draft.answers.training, completion: event.target.value ? event.target.value as NonNullable<typeof draft.answers.training>["completion"] : undefined } })}><option value="">Unanswered</option><option value="yes">Yes</option><option value="partly">Partly</option><option value="no">No</option><option value="unsure">Unsure</option></select></label><label>What worked well or would you change?<textarea value={draft.answers.training?.changeNextTime ?? ""} onChange={(event) => updateAnswers({ training: { ...draft.answers.training, changeNextTime: event.target.value || undefined } })} maxLength={2000} rows={2} /></label></fieldset> : null}
      {draft.type !== "training" ? <fieldset><legend>Race questions</legend><label>Target time, if any<input value={draft.answers.race?.targetTime ?? ""} onChange={(event) => updateAnswers({ race: { ...draft.answers.race, targetTime: event.target.value || undefined } })} maxLength={32} /></label><label>How did preparation and pacing go?<textarea value={draft.answers.race?.pacingExecution ?? ""} onChange={(event) => updateAnswers({ race: { ...draft.answers.race, pacingExecution: event.target.value || undefined } })} maxLength={2000} rows={2} /></label><label>Fuelling and energy<textarea value={draft.answers.race?.fuelling ?? ""} onChange={(event) => updateAnswers({ race: { ...draft.answers.race, fuelling: event.target.value || undefined } })} maxLength={2000} rows={2} /></label></fieldset> : null}
      <fieldset><legend>Sections and turning points</legend><p className="form-help">Optional. Add opening, middle, closing or turning-point observations.</p>{draft.sections.map((section, index) => <div className="journal-section-row" key={section.id}><select value={section.kind} onChange={(event) => setDraft((current) => ({ ...current, sections: current.sections.map((item, itemIndex) => itemIndex === index ? { ...item, kind: event.target.value as typeof item.kind } : item) }))}><option value="opening">Opening</option><option value="middle">Middle</option><option value="closing">Closing</option><option value="repetition">Repetition</option><option value="turning_point">Turning point</option></select><input placeholder="Location, e.g. km 15–18" value={section.location ?? ""} onChange={(event) => setDraft((current) => ({ ...current, sections: current.sections.map((item, itemIndex) => itemIndex === index ? { ...item, location: event.target.value || undefined } : item) }))} maxLength={160} /><input placeholder="Notes" value={section.notes ?? ""} onChange={(event) => setDraft((current) => ({ ...current, sections: current.sections.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value || undefined } : item) }))} maxLength={2000} /></div>)}<button className="button button-secondary" type="button" onClick={addSection} disabled={draft.sections.length >= 20}>Add section</button></fieldset>
      {status === "error" ? <p className="activity-review-error" role="alert">{message}</p> : null}<div className="journal-form-actions"><button className="button button-primary" type="button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save reflection"}</button><button className="button button-secondary" type="button" onClick={() => { setOpen(false); setStatus("ready"); setDraft(saved ? { expectedRevision: saved.revision, type: saved.type, answers: saved.answers, sections: saved.sections } : blank); }}>Cancel</button></div>
    </div>}
  </section>;
}
