"use client";

import { useEffect, useMemo, useState } from "react";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function planDateProgress(startsOn: string, endsOn: string, today: string) {
  const start = Date.parse(`${startsOn}T00:00:00.000Z`);
  const end = Date.parse(`${endsOn}T00:00:00.000Z`);
  const current = Date.parse(`${today}T00:00:00.000Z`);
  if (![start, end, current].every(Number.isFinite) || end < start) return null;
  const day = 24 * 60 * 60 * 1_000;
  const totalDays = Math.max(1, Math.round((end - start) / day) + 1);
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.floor((current - start) / day) + 1));
  return {
    elapsedDays,
    remainingDays: Math.max(0, totalDays - elapsedDays),
    percent: Math.round((elapsedDays / totalDays) * 100),
  };
}

function targetLabel(workout: JsonRecord) {
  const parts = [
    Number(workout.distanceMeters) > 0 ? `${Number(workout.distanceMeters) / 1000} km` : null,
    Number(workout.durationMinutes) >= 0 ? `${Number(workout.durationMinutes)} min` : null,
    Number(workout.intensityRpe) > 0 ? `RPE ${Number(workout.intensityRpe)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Target not specified";
}

export function ActivePlanOverview({ plan, today }: { plan: JsonRecord; today: string }) {
  const weeks = Array.isArray(plan.weeklyStructure) ? plan.weeklyStructure.map(asRecord) : [];
  const workouts = Array.isArray(plan.workouts) ? plan.workouts.map(asRecord) : [];
  const approval = asRecord(plan.approval);
  const proposedGoal = asRecord(plan.proposedGoal);
  const assumptions = strings(plan.assumptions ?? approval.assumptions);
  const cautions = strings(plan.cautions ?? approval.cautions);
  const rationale = String(plan.rationale ?? approval.rationale ?? "No approved rationale was supplied.");
  const startsOn = String(plan.startsOn ?? "");
  const endsOn = String(plan.endsOn ?? "");
  const progress = planDateProgress(startsOn, endsOn, today);
  const [selectedWeek, setSelectedWeek] = useState(() => String(weeks[0]?.weekStartsOn ?? ""));

  useEffect(() => {
    const selectedStillExists = weeks.some((week) => String(week.weekStartsOn ?? "") === selectedWeek);
    if (!selectedStillExists) setSelectedWeek(String(weeks[0]?.weekStartsOn ?? ""));
  }, [plan.id, weeks, selectedWeek]);

  const workoutById = useMemo(() => new Map(workouts.map((workout) => [String(workout.id ?? ""), workout])), [workouts]);
  const assignedIds = useMemo(() => new Set(weeks.flatMap((week) => strings(week.sessionIds))), [weeks]);
  const unassigned = workouts.filter((workout) => !assignedIds.has(String(workout.id ?? "")));
  const activeWeek = weeks.find((week) => String(week.weekStartsOn ?? "") === selectedWeek) ?? weeks[0];
  const activeWeekSessions = activeWeek
    ? strings(activeWeek.sessionIds).map((id) => workoutById.get(id)).filter((workout): workout is JsonRecord => Boolean(workout))
    : [];
  const goalTitle = typeof proposedGoal.title === "string" ? proposedGoal.title : null;

  return <div className="active-plan-overview">
    {progress ? <section className="plan-progress" aria-labelledby="plan-progress-heading">
      <div className="plan-progress-copy"><div><p className="eyebrow">Date progress</p><h4 id="plan-progress-heading">{progress.percent}% through the approved range</h4></div><span>{progress.remainingDays} day{progress.remainingDays === 1 ? "" : "s"} remaining</span></div>
      <div className="plan-progress-track" role="progressbar" aria-label="Approved plan date progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><span style={{ width: `${progress.percent}%` }} /></div>
      <p>{progress.elapsedDays} approved calendar day{progress.elapsedDays === 1 ? "" : "s"} elapsed. This is date progress, not workout completion.</p>
    </section> : null}

    {goalTitle ? <section className="plan-fact-block"><p className="eyebrow">Approved goal</p><h4>{goalTitle}</h4></section> : null}

    <section className="plan-week-browser" aria-labelledby="plan-weeks-heading">
      <div className="plan-section-heading"><div><p className="eyebrow">Weekly rhythm</p><h4 id="plan-weeks-heading">Sessions by explicit calendar week</h4></div><span className="status-chip">{weeks.length} week{weeks.length === 1 ? "" : "s"}</span></div>
      {weeks.length > 0 ? <>
        <div className="plan-week-tabs" aria-label="Approved calendar weeks">
          {weeks.map((week, index) => {
            const weekStartsOn = String(week.weekStartsOn ?? "");
            const sessionCount = strings(week.sessionIds).length;
            return <button type="button" aria-pressed={weekStartsOn === String(activeWeek?.weekStartsOn ?? "")} onClick={() => setSelectedWeek(weekStartsOn)} key={`${weekStartsOn}-${index}`}>
              <span>Week of {weekStartsOn || "date not supplied"}</span><small>{sessionCount} session{sessionCount === 1 ? "" : "s"}</small>
            </button>;
          })}
        </div>
        {activeWeek ? <div className="plan-week-detail" role="region" aria-live="polite" aria-label={`Week of ${String(activeWeek.weekStartsOn ?? "date not supplied")}`}>
          <div><p className="eyebrow">Week of {String(activeWeek.weekStartsOn ?? "date not supplied")}</p><h4>{String(activeWeek.focus ?? "No weekly focus supplied")}</h4></div>
          {activeWeekSessions.length > 0 ? <div className="plan-week-sessions">{activeWeekSessions.map((workout, index) => <article key={String(workout.id ?? index)}>
            <div><p className="eyebrow">{String(workout.kind ?? "session")} · {String(workout.scheduledDate ?? "date not supplied")}</p><strong>{String(workout.title ?? "Approved session")}</strong></div>
            <span>{targetLabel(workout)}</span>
            <p>{String(workout.purpose ?? "No purpose supplied.")}</p>
            <details><summary>Prescription and cautions</summary><p>{String(workout.prescription ?? "No prescription supplied.")}</p><p><strong>Cautions:</strong> {strings(workout.cautions).join("; ") || "None supplied"}</p></details>
          </article>)}</div> : <p className="quiet-copy">This explicit week contains no referenced sessions.</p>}
        </div> : null}
      </> : <p className="quiet-copy">No explicit weekly structure was supplied with this approved plan.</p>}
      {unassigned.length > 0 ? <details className="plan-unassigned"><summary>{unassigned.length} approved session{unassigned.length === 1 ? " is" : "s are"} not assigned to an explicit week</summary><div>{unassigned.map((workout, index) => <p key={String(workout.id ?? index)}><strong>{String(workout.title ?? "Approved session")}</strong> · {String(workout.scheduledDate ?? "date not supplied")}</p>)}</div></details> : null}
    </section>

    <section className="plan-review-notes" aria-labelledby="plan-notes-heading">
      <div className="plan-section-heading"><div><p className="eyebrow">Approval context</p><h4 id="plan-notes-heading">Rationale, assumptions and cautions</h4></div></div>
      <p><strong>Approved rationale:</strong> {rationale}</p>
      <div className="plan-note-columns">
        <div><h5>Assumptions</h5>{assumptions.length > 0 ? <ul>{assumptions.map((item, index) => <li key={`assumption-${index}`}>{item}</li>)}</ul> : <p className="quiet-copy">None supplied.</p>}</div>
        <div><h5>Cautions</h5>{cautions.length > 0 ? <ul>{cautions.map((item, index) => <li key={`caution-${index}`}>{item}</li>)}</ul> : <p className="quiet-copy">None supplied.</p>}</div>
      </div>
    </section>
  </div>;
}
