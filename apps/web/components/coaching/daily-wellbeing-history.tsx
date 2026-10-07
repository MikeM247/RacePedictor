"use client";

import { useEffect, useState } from "react";
import type { DailyWellbeingCheckIn } from "../../../../packages/core/src/contracts/athlete-journal";

export function DailyWellbeingHistory({ localDate, timezone }: { localDate: string; timezone: string }) {
  const [entry, setEntry] = useState<DailyWellbeingCheckIn | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    fetch(`/api/v1/wellbeing-check-ins?from=${localDate}&to=${localDate}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      return response.json() as Promise<{ data: { items: DailyWellbeingCheckIn[] } }>;
    }).then((result) => { if (active) { setEntry(result.data.items[0] ?? null); setState("ready"); } }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [localDate]);
  if (state === "loading" || state === "error" || !entry) return null;
  const answerLabels = [entry.answers.overallFeeling, entry.answers.sleepQuality, entry.answers.fatigue, entry.answers.soreness, entry.answers.readiness].filter(Boolean).map((value) => String(value).replaceAll("_", " "));
  return <section className="calendar-wellbeing-history" aria-labelledby={`wellbeing-history-${localDate}`}><p className="eyebrow">Athlete recovery</p><h3 id={`wellbeing-history-${localDate}`}>{entry.status === "skipped" ? "Check-in skipped" : `Check-in recorded · ${answerLabels.join(" · ") || "Notes provided"}`}</h3>{entry.answers.notes ? <p>{entry.answers.notes}</p> : null}<p className="activity-review-meta">Recorded {entry.recordedAt ? new Date(entry.recordedAt).toLocaleString([], { timeZone: timezone }) : "as skipped"}</p></section>;
}
