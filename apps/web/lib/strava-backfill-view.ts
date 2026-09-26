import type { StravaBackfillJobSummary } from "../../../packages/core/src/ports/strava-ingestion-worker.ts";

export function backfillStatusLabel(job: StravaBackfillJobSummary, now = Date.now()) {
  if (job.status === "queued" && Date.parse(job.availableAt) > now) return "Waiting to retry";
  if (job.status === "processing") return "Processing";
  if (job.status === "completed") return "Finished";
  if (job.status === "failed" || job.status === "dead_letter") return "Needs attention";
  return "Queued";
}

export function backfillStatusMessage(job: StravaBackfillJobSummary, now = Date.now()) {
  if (job.status === "queued" && Date.parse(job.availableAt) > now) return `Next attempt after ${new Date(job.availableAt).toLocaleString()}.`;
  if (job.status === "queued") return "Waiting for the import worker or the next recovery run.";
  if (job.status === "processing") return "Strava history is being processed. This status updates automatically.";
  if (job.status === "completed") return `Processing finished ${new Date(job.completedAt ?? job.updatedAt).toLocaleString()}.`;
  if (job.diagnosticCode === "STRAVA_REAUTH_REQUIRED" || job.diagnosticCode === "STRAVA_ACCESS_DENIED") {
    return `Strava access needs attention. Reconnect Strava in Settings, then request another import. Diagnostic code: ${job.diagnosticCode}.`;
  }
  if (job.diagnosticCode) {
    return `The import stopped before it finished. Diagnostic code: ${job.diagnosticCode}. Check Training for accepted workouts and report this code.`;
  }
  return "The import stopped before it finished. Check Training for any accepted workouts, then request another import or report the problem.";
}
