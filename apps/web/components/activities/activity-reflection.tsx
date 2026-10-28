"use client";

import { useEffect, useRef, useState } from "react";
import type { ActivityReflection, ActivityReflectionType, SaveActivityReflectionRequest } from "../../../../packages/core/src/contracts/athlete-journal";

const blank: SaveActivityReflectionRequest = { expectedRevision: 0, type: null, answers: {}, sections: [] };
const feelingOptions = [["very_poor", "Very poor"], ["poor", "Poor"], ["normal", "Normal"], ["good", "Good"], ["very_good", "Very good"]] as const;

type ActivityReflectionProps = { activityId: string; sport?: string; movingTimeS?: number; headingLevel?: 3 | 4; recordHeadingId?: string };

export function ActivityReflection(props: ActivityReflectionProps) {
  if (["run", "trail_run", "treadmill_run"].includes(props.sport ?? "")) return <PostRunReflection {...props} />;
  return <LegacyActivityReflection {...props} />;
}

function LegacyActivityReflection({ activityId, headingLevel = 3, recordHeadingId }: ActivityReflectionProps) {
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

type RunFeedbackAnswers = {
  [key: string]: unknown;
  overallRpe?: number;
  expectation?: "easier" | "as_expected" | "harder" | "unsure";
  overallFeeling?: "very_poor" | "poor" | "normal" | "good" | "very_good";
  postRun: {
    rpeAnswer?: "rated" | "unable";
    discomfort?: "none" | "discomfort" | "pain" | "prefer_not_to_say";
    symptoms?: { bodyArea?: string; severity?: number; affectedRunning?: "yes" | "no" | "unsure" };
    energy?: "fresh" | "okay" | "drained" | "skip";
    note?: string;
    fuel?: "no_issues" | "not_enough" | "stomach_issues" | "unsure";
    fuelNote?: string;
    raceNotes?: { workedWell?: string; changeNextTime?: string };
  };
};

type RunFeedbackDraft = { type: ActivityReflectionType | null; answers: RunFeedbackAnswers; sections: ActivityReflection["sections"]; expectedRevision?: number };
type RunFeedbackState = { activityId: string; completedAt: string | null; completedReflectionRevision: number | null; suppressedAt: string | null; reopenedAt: string | null; revision: number } | null;
const emptyRunFeedback: RunFeedbackDraft = { type: null, answers: { postRun: {} }, sections: [] };
const runSports = new Set(["run", "trail_run", "treadmill_run"]);

/** Shared run-review form used by Coach and activity detail. */
export function PostRunReflection({ activityId, movingTimeS, headingLevel = 3, recordHeadingId, compact = false, promptLabel = "Give feedback", onSaved }: ActivityReflectionProps & { compact?: boolean; promptLabel?: string; onSaved?: (revision: number) => void }) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const [saved, setSaved] = useState<ActivityReflection | null>(null);
  const [state, setState] = useState<RunFeedbackState>(null);
  const [activityRevision, setActivityRevision] = useState(0);
  const [reflectionRevision, setReflectionRevision] = useState(0);
  const [draft, setDraft] = useState<RunFeedbackDraft>(emptyRunFeedback);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const [outcomeUncertain, setOutcomeUncertain] = useState(false);
  const operationId = useRef<string | null>(null);
  const authLostRef = useRef(false);

  function hidePrivateReviewForAuthenticationLoss() {
    authLostRef.current = true;
    clearRunReviewDrafts();
    operationId.current = null;
    setStorageKey(null); setSaved(null); setState(null); setDraft(emptyRunFeedback); setOpen(false);
    setStale(false); setOutcomeUncertain(false); setStatus("error"); setMessage("Sign in again to continue.");
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const sessionResponse = await fetch("/api/v1/auth/session", { cache: "no-store" });
        const sessionPayload = await sessionResponse.json() as { data?: { authenticated?: boolean; actor?: { activeAthleteId?: string } }; authenticated?: boolean; actor?: { activeAthleteId?: string } };
        const session = sessionPayload.data ?? sessionPayload;
        if (!sessionResponse.ok || session.authenticated !== true || !session.actor?.activeAthleteId) {
          hidePrivateReviewForAuthenticationLoss();
          return;
        }
        const scope = getRunReviewDraftScope(session.actor.activeAthleteId);
        const key = `racepredictor.run-review.draft.${scope}.${activityId}`;
        if (!active) return;
        setStorageKey(key);
        const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/reflection/run-review`, { cache: "no-store" });
        const payload = await response.json() as { data?: { state: RunFeedbackState; reflection: ActivityReflection | null; activityRevision?: number }; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Run feedback is temporarily unavailable.");
        const reflection = payload.data.reflection;
        const baseAnswers = reflection?.answers ? { ...reflection.answers } : {};
        const postRun = "postRun" in baseAnswers ? baseAnswers.postRun : {};
        let nextDraft: RunFeedbackDraft = {
          type: reflection?.type ?? null,
          answers: { ...baseAnswers, postRun } as RunFeedbackAnswers,
          sections: reflection?.sections ?? [],
        };
        const stored = sessionStorage.getItem(key);
        let storedDraftStale = false;
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as RunFeedbackDraft;
            if (parsed && parsed.answers && parsed.sections) {
              nextDraft = parsed;
              storedDraftStale = typeof parsed.expectedRevision === "number" && parsed.expectedRevision !== (reflection?.revision ?? 0);
            }
          } catch { sessionStorage.removeItem(key); }
        }
        if (!active) return;
        setSaved(reflection?.questionnaireVersion === "activity-reflection.v2" ? reflection : null);
        setState(payload.data.state);
        setReflectionRevision(reflection?.revision ?? 0);
        setActivityRevision(payload.data.activityRevision ?? reflection?.activityRevision ?? 0);
        setDraft(nextDraft);
        setStale(storedDraftStale);
        if (stored && payload.data.state?.completedAt) setOpen(true);
        setStatus("ready");
      } catch (error) {
        if (active) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Run feedback could not be loaded."); }
      }
    })();
    return () => { active = false; };
  }, [activityId]);

  useEffect(() => {
    if (status === "loading" || authLostRef.current) return;
    let active = true;
    const revalidate = async () => {
      try {
        const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/reflection/run-review`, { cache: "no-store" });
        if (response.status === 401 || response.status === 403) { hidePrivateReviewForAuthenticationLoss(); return; }
        if (!response.ok) return;
        const payload = await response.json() as { data?: { state: RunFeedbackState; reflection: ActivityReflection | null; activityRevision?: number } };
        const latest = payload.data;
        if (!active || !latest) return;
        const reflectionChanged = (latest.reflection?.revision ?? 0) !== (saved?.revision ?? reflectionRevision);
        const completionChanged = latest.state?.revision !== (state?.revision ?? 0);
        if ((latest.activityRevision ?? activityRevision) !== activityRevision || reflectionChanged || completionChanged) {
          setStale(true);
          setMessage("This run or its feedback changed elsewhere. Your draft is kept; refresh the run details before saving.");
          if (!open) {
            if (latest.reflection?.questionnaireVersion === "activity-reflection.v2" && latest.state?.completedAt) setSaved(latest.reflection);
            setState(latest.state);
            setReflectionRevision(latest.reflection?.revision ?? 0);
            setActivityRevision(latest.activityRevision ?? activityRevision);
          }
        }
      } catch { /* keep the draft usable during a temporary refresh failure */ }
    };
    void revalidate();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void revalidate(); }, 30_000);
    window.addEventListener("focus", revalidate);
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("racepredictor.run-review");
      channel.addEventListener("message", (event) => { if (event.data?.type === "run-review-changed" && event.data.activityId === activityId) void revalidate(); });
    }
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", revalidate); channel?.close(); };
  }, [activityId, activityRevision, open, reflectionRevision, saved?.revision, state?.revision, status]);

  function updateAnswers(patch: Partial<RunFeedbackAnswers>) {
    if (outcomeUncertain) return;
    setDraft((current) => {
      const next = { ...current, answers: { ...current.answers, ...patch } };
      if (storageKey) { try { sessionStorage.setItem(storageKey, JSON.stringify({ ...next, expectedRevision: saved?.revision ?? reflectionRevision })); } catch { /* draft recovery is optional */ } }
      return next;
    });
  }

  function updateType(type: ActivityReflectionType | null) {
    if (outcomeUncertain) return;
    setDraft((current) => {
      const next = { ...current, type, answers: { ...current.answers, postRun: { ...current.answers.postRun, ...(type === "race" ? {} : { raceNotes: undefined }) } } };
      if (storageKey) { try { sessionStorage.setItem(storageKey, JSON.stringify({ ...next, expectedRevision: saved?.revision ?? reflectionRevision })); } catch { /* draft recovery is optional */ } }
      return next;
    });
  }

  function updatePostRun(patch: Partial<RunFeedbackAnswers["postRun"]>) {
    updateAnswers({ postRun: { ...draft.answers.postRun, ...patch } });
  }

  function changeRpeAnswer(value: "rated" | "unable") {
    updateAnswers({ overallRpe: value === "unable" ? undefined : draft.answers.overallRpe, postRun: { ...draft.answers.postRun, rpeAnswer: value } });
  }

  async function reconcile(requestId: string) {
    const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/reflection/operations/${requestId}`, { cache: "no-store" });
    if (response.status === 401 || response.status === 403) { hidePrivateReviewForAuthenticationLoss(); return false; }
    if (response.status === 404) { operationId.current = null; setOutcomeUncertain(false); return false; }
    const result = await response.json() as { data?: { reflection: ActivityReflection | null; state: RunFeedbackState }; error?: { message?: string } };
    if (!response.ok || !result.data) return false;
    if (result.data.reflection?.questionnaireVersion === "activity-reflection.v2") {
      setSaved(result.data.reflection); setReflectionRevision(result.data.reflection.revision); setState(result.data.state); setOpen(false); setStatus("ready"); setOutcomeUncertain(false); setMessage("Feedback saved.");
      if (storageKey) sessionStorage.removeItem(storageKey);
      notifyRunReviewChange(activityId);
      onSaved?.(result.data.reflection.revision);
      return true;
    }
    return false;
  }

  async function save() {
    if (stale || outcomeUncertain) return;
    if (!draft.answers.postRun.rpeAnswer || (draft.answers.postRun.rpeAnswer === "rated" && !draft.answers.overallRpe)) {
      setStatus("error"); setMessage("Choose an RPE from 1 to 10, or select that you could not rate the run.");
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`input[name="run-rpe-${CSS.escape(activityId)}"]`)?.focus()); return;
    }
    if (!draft.answers.postRun.discomfort) {
      setStatus("error"); setMessage("Tell ORBIT whether you felt discomfort, pain, or prefer not to say.");
      requestAnimationFrame(() => document.getElementById(`run-discomfort-${activityId}`)?.focus()); return;
    }
    const requestId = operationId.current ?? crypto.randomUUID();
    operationId.current = requestId;
    setStatus("saving"); setMessage("");
    const answers: RunFeedbackAnswers = { ...draft.answers, postRun: { ...draft.answers.postRun } };
    const body = { requestId, expectedRevision: saved?.revision ?? reflectionRevision, expectedActivityRevision: activityRevision, type: draft.type, answers, sections: draft.sections };
    try {
      const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/reflection`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 401 || response.status === 403) { hidePrivateReviewForAuthenticationLoss(); return; }
      const result = await response.json() as { data?: { reflection: ActivityReflection; state: RunFeedbackState; activityRevision?: number }; error?: { message?: string } };
      if (!response.ok || !result.data) {
        if (response.status === 409) throw new Error(result.error?.message ?? "This run changed elsewhere. Your draft is kept; refresh its latest details before saving.");
        throw new Error(result.error?.message ?? "Feedback could not be saved.");
      }
      operationId.current = null;
      setSaved(result.data.reflection); setReflectionRevision(result.data.reflection.revision); setState(result.data.state); setActivityRevision(result.data.activityRevision ?? activityRevision); setOpen(false); setStatus("ready"); setOutcomeUncertain(false); setMessage("Feedback saved.");
      if (storageKey) sessionStorage.removeItem(storageKey);
      notifyRunReviewChange(activityId);
      onSaved?.(result.data.reflection.revision);
    } catch (error) {
      if (operationId.current) {
        try { if (await reconcile(operationId.current)) { operationId.current = null; return; } } catch { /* retry below uses the same idempotency key */ }
      }
      if (operationId.current) setOutcomeUncertain(true);
      if ((error as { status?: number }).status === 409) setStale(true);
      setStatus("error"); setMessage(error instanceof Error ? error.message : "Feedback could not be saved. Your answers are still here.");
    }
  }

  async function changeState(operation: "delete" | "reopen") {
    if (!state) return;
    setStatus("saving"); setMessage("");
    const requestId = crypto.randomUUID();
    try {
      const actionUrl = operation === "delete" ? `/api/v1/activities/${encodeURIComponent(activityId)}/reflection` : `/api/v1/activities/${encodeURIComponent(activityId)}/reflection/reopen`;
      const response = await fetch(actionUrl, { method: operation === "delete" ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, expectedStateRevision: state.revision }) });
      if (response.status === 401 || response.status === 403) { hidePrivateReviewForAuthenticationLoss(); return; }
      const result = await response.json() as { data?: { reflection: ActivityReflection | null; state: RunFeedbackState }; error?: { message?: string } };
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "The review state could not be updated.");
      setState(result.data.state);
      if (operation === "delete") { setSaved(null); setReflectionRevision((current) => current + 1); setDraft((current) => ({ ...current, answers: { ...current.answers, postRun: {} } })); if (storageKey) sessionStorage.removeItem(storageKey); setOpen(true); setMessage("Saved run feedback was deleted. This run will stay suppressed until you choose to review it again."); }
      else { setOpen(true); setMessage("This run is ready for another review."); }
      setStatus("ready");
      notifyRunReviewChange(activityId);
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "The review state could not be updated."); }
  }

  const postRun = draft.answers.postRun;
  const savedPostRun: RunFeedbackAnswers["postRun"] = saved && "postRun" in saved.answers ? saved.answers.postRun : {};
  const title = compact ? "Your run feedback" : "Your run reflection";
  return <section className={`activity-athlete-reflection detail-subsection run-review-form${compact ? " run-review-form--compact" : ""}`} aria-labelledby={`run-review-${activityId}${recordHeadingId ? ` ${recordHeadingId}` : ""}`}>
    <div className="detail-section-heading"><div><p className="eyebrow">Athlete feedback</p><Heading id={`run-review-${activityId}`}>{title}</Heading></div>{saved ? <span className="activity-review-badge">Saved</span> : null}</div>
    {status === "loading" ? <p className="activity-review-state" role="status">Checking for saved run feedback…</p> : null}
    {status === "error" && !open ? <p className="activity-review-state activity-review-state--error" role="alert">{message}</p> : null}
    {saved && !open ? <div className="run-review-saved" aria-live="polite">
      <p>{savedPostRun.rpeAnswer === "unable" ? "RPE: unable to rate" : `RPE: ${saved.answers.overallRpe ?? "not recorded"}/10`} · {savedPostRun.discomfort === "prefer_not_to_say" ? "Discomfort: prefer not to say" : `Discomfort: ${savedPostRun.discomfort ?? "not recorded"}`}</p>
      {savedPostRun.energy && savedPostRun.energy !== "skip" ? <p>Energy: {savedPostRun.energy}</p> : null}{savedPostRun.note ? <p>{savedPostRun.note}</p> : null}
      <div className="journal-form-actions"><button className="button button-secondary" type="button" onClick={() => { setOpen(true); setMessage(""); }}>Edit feedback</button><button className="button button-secondary" type="button" onClick={() => void changeState("reopen")}>Review this run again</button><button className="button button-secondary" type="button" onClick={() => void changeState("delete")}>Delete feedback</button></div>
    </div> : null}
    {!saved && !open && status !== "loading" ? <><p className="activity-review-state">Tell your coach how the effort felt so future guidance can account for your experience.</p><button className="button button-primary" type="button" onClick={() => { setOpen(true); setStatus("ready"); }}>{promptLabel}</button></> : null}
    {stale && !open ? <div className="activity-review-error" role="status">{message}<button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Refresh run details</button></div> : null}
    {open ? <div className="athlete-journal-form"><fieldset disabled={outcomeUncertain || stale} className="run-review-fields"><legend className="sr-only">Run feedback answers</legend>
      <fieldset><legend>How hard was the run?</legend><p className="form-help">Rate the whole run, not just its hardest moment.</p><div className="run-rpe-choices" role="group" aria-label="Overall run effort, RPE from one to ten">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <label className="run-rpe-choice" key={value}><input type="radio" name={`run-rpe-${activityId}`} value={value} checked={postRun.rpeAnswer === "rated" && draft.answers.overallRpe === value} onChange={() => { changeRpeAnswer("rated"); updateAnswers({ overallRpe: value }); }} /><span>{value}</span></label>)}
        <label className="run-rpe-unable"><input type="radio" name={`run-rpe-${activityId}`} value="unable" checked={postRun.rpeAnswer === "unable"} onChange={() => changeRpeAnswer("unable")} /> I can’t rate it</label>
      </div><p className="form-help">1 very light · 2–3 easy · 4–5 moderate · 6–7 hard · 8–9 very hard · 10 maximum</p><label>Compared with what you expected <select value={draft.answers.expectation ?? ""} onChange={(event) => updateAnswers({ expectation: event.target.value ? event.target.value as NonNullable<RunFeedbackAnswers["expectation"]> : undefined })}><option value="">Choose an answer</option><option value="easier">Easier</option><option value="as_expected">As expected</option><option value="harder">Harder</option><option value="unsure">Not sure</option></select></label></fieldset>
      <fieldset><legend>Did you feel pain or discomfort?</legend><label>Choose an answer <select id={`run-discomfort-${activityId}`} value={postRun.discomfort ?? ""} onChange={(event) => { const value = event.target.value as RunFeedbackAnswers["postRun"]["discomfort"]; updatePostRun({ discomfort: value || undefined, symptoms: value === "none" || value === "prefer_not_to_say" ? undefined : postRun.symptoms }); }}><option value="">Choose an answer (required)</option><option value="none">No pain or discomfort</option><option value="discomfort">Some discomfort</option><option value="pain">Pain</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>{postRun.discomfort === "pain" || postRun.discomfort === "discomfort" ? <><label>Where did you feel it?<input maxLength={100} value={postRun.symptoms?.bodyArea ?? ""} onChange={(event) => updatePostRun({ symptoms: { ...postRun.symptoms, bodyArea: event.target.value || undefined } })} /></label><label>Severity (optional) <select value={postRun.symptoms?.severity ?? ""} onChange={(event) => updatePostRun({ symptoms: { ...postRun.symptoms, severity: event.target.value ? Number(event.target.value) : undefined } })}><option value="">Skip</option>{Array.from({ length: 11 }, (_, index) => <option key={index} value={index}>{index}</option>)}</select></label><label>Did it affect your running? <select value={postRun.symptoms?.affectedRunning ?? ""} onChange={(event) => updatePostRun({ symptoms: { ...postRun.symptoms, affectedRunning: event.target.value ? event.target.value as NonNullable<RunFeedbackAnswers["postRun"]["symptoms"]>["affectedRunning"] : undefined } })}><option value="">Skip</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Not sure</option></select></label></> : null}</fieldset>
      <fieldset><legend>Energy and fueling</legend><label>How was your energy? <select value={postRun.energy ?? ""} onChange={(event) => updatePostRun({ energy: event.target.value ? event.target.value as NonNullable<RunFeedbackAnswers["postRun"]["energy"]> : undefined })}><option value="">Skip</option><option value="fresh">Fresh</option><option value="okay">Okay</option><option value="drained">Drained</option><option value="skip">Prefer to skip</option></select></label>{(draft.type === "race" || (movingTimeS ?? 0) >= 75 * 60) ? <><label>Fuel and fluids during the run <select value={postRun.fuel ?? ""} onChange={(event) => { const value = event.target.value as RunFeedbackAnswers["postRun"]["fuel"]; updatePostRun({ fuel: value || undefined, fuelNote: !value || value === "no_issues" ? undefined : postRun.fuelNote }); }}><option value="">Skip</option><option value="no_issues">No issues</option><option value="not_enough">Not enough</option><option value="stomach_issues">Stomach issues</option><option value="unsure">Not sure</option></select></label>{postRun.fuel && postRun.fuel !== "no_issues" ? <label>Fuel and fluids note<textarea maxLength={1000} rows={2} value={postRun.fuelNote ?? ""} onChange={(event) => updatePostRun({ fuelNote: event.target.value || undefined })} /></label> : null}</> : null}</fieldset>
      <fieldset><legend>Anything else ORBIT should know?</legend><label>Optional note<textarea maxLength={1000} rows={3} value={postRun.note ?? ""} onChange={(event) => updatePostRun({ note: event.target.value || undefined })} /><span className="form-help">{(postRun.note ?? "").length}/1,000</span></label></fieldset>
      {draft.type === "race" ? <fieldset><legend>Race notes</legend><label>What went well?<textarea maxLength={1000} rows={2} value={postRun.raceNotes?.workedWell ?? ""} onChange={(event) => updatePostRun({ raceNotes: { ...postRun.raceNotes, workedWell: event.target.value || undefined } })} /></label><label>What would you change next time?<textarea maxLength={1000} rows={2} value={postRun.raceNotes?.changeNextTime ?? ""} onChange={(event) => updatePostRun({ raceNotes: { ...postRun.raceNotes, changeNextTime: event.target.value || undefined } })} /></label></fieldset> : <label>Was this a race? <select value={draft.type ?? ""} onChange={(event) => updateType(event.target.value ? event.target.value as ActivityReflectionType : null)}><option value="">Training run</option><option value="race">Race</option><option value="training">Training</option></select></label>}
      </fieldset>
      {message ? <p className={status === "error" ? "activity-review-error" : "activity-review-context"} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
      {stale ? <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Refresh run details</button> : null}
      {outcomeUncertain ? <button className="button button-secondary" type="button" onClick={() => { if (operationId.current) void reconcile(operationId.current); }}>Check save status</button> : null}
      <div className="journal-form-actions"><button className="button button-primary" type="button" onClick={() => void save()} disabled={status === "saving" || stale || outcomeUncertain}>{status === "saving" ? "Saving…" : "Save feedback"}</button><button className="button button-secondary" type="button" onClick={() => { setOpen(false); setStatus("ready"); setMessage("Your draft is saved on this device."); }}>Save for later</button></div>
    </div> : null}
  </section>;
}

function getRunReviewDraftScope(athleteId: string) {
  const scopeKey = "racepredictor.run-review.scope.v1";
  const actorKey = "racepredictor.run-review.actor.v1";
  const priorActor = sessionStorage.getItem(actorKey);
  if (priorActor && priorActor !== athleteId) clearRunReviewDrafts();
  sessionStorage.setItem(actorKey, athleteId);
  let scope = sessionStorage.getItem(scopeKey);
  if (!scope) { scope = crypto.randomUUID(); sessionStorage.setItem(scopeKey, scope); }
  return scope;
}

function clearRunReviewDrafts() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith("racepredictor.run-review.")) sessionStorage.removeItem(key);
    }
  } catch { /* optional browser storage */ }
}

function notifyRunReviewChange(activityId: string) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel("racepredictor.run-review");
    channel.postMessage({ type: "run-review-changed", activityId });
    channel.close();
  } catch { /* cross-tab refresh is best-effort */ }
}
