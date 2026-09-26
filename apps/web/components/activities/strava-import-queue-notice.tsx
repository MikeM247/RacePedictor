"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StravaBackfillJobSummary } from "../../../../packages/core/src/ports/strava-ingestion-worker.ts";
import { backfillStatusLabel, backfillStatusMessage } from "../../lib/strava-backfill-view.ts";

export function StravaImportQueueNotice({ onRefreshTraining }: { onRefreshTraining: () => void }) {
  const [job, setJob] = useState<StravaBackfillJobSummary | null>(null);
  const [readError, setReadError] = useState(false);

  async function refreshStatus() {
    try {
      const response = await fetch("/api/v1/providers/strava/backfill", { cache: "no-store" });
      if (!response.ok) throw new Error("Import status unavailable");
      const body = await response.json();
      if (!Array.isArray(body?.data?.jobs)) throw new Error("Import status unavailable");
      setJob(body.data.jobs[0] ?? null);
      setReadError(false);
    } catch {
      setReadError(true);
    }
  }

  useEffect(() => { void refreshStatus(); }, []);
  useEffect(() => {
    if (job?.status !== "queued" && job?.status !== "processing") return;
    const timeout = window.setTimeout(() => { void refreshStatus(); }, 20_000);
    return () => window.clearTimeout(timeout);
  }, [job]);

  if (!job && !readError) return null;
  return <section className="strava-import-notice" aria-label="Strava import status">
    <div><p className="eyebrow">Recent Strava import</p>
      {job ? <><strong aria-live="polite">{backfillStatusLabel(job)}</strong><p>{backfillStatusMessage(job)}</p><p className="strava-import-requested">Requested {new Date(job.createdAt).toLocaleString()}. A finished import does not confirm every workout was accepted.</p></> : null}
      {readError ? <p role="alert">Import status could not be checked. Training history is still available.</p> : null}
    </div>
    <div className="strava-import-notice-actions">
      <button className="button button-secondary" type="button" onClick={() => void refreshStatus()}>Refresh status</button>
      <button className="button button-secondary" type="button" onClick={onRefreshTraining}>Refresh training</button>
      <Link className="text-link" href="/dashboard/settings?section=connections">View import history</Link>
    </div>
  </section>;
}
