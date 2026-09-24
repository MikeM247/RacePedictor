import type { ActivityReviewComparison, ActivityReviewRequestStatus } from "../../../../packages/core/src/contracts/activity-review";

export function reviewStatusLabel(status?: ActivityReviewRequestStatus) {
  return ({ not_requested: "No review requested", queued: "Review queued", processing: "Review in progress", ready: "Reviewed", retry_wait: "Review delayed", attention: "Review needs attention" } as const)[status ?? "not_requested"];
}

export function reviewStatusMessage(status?: ActivityReviewRequestStatus, hasReview = false) {
  if (status === "ready" && !hasReview) return "Review content is unavailable. Check again before drawing training conclusions.";
  if (status === "queued") return "Waiting for your local computer to prepare feedback. Your recorded training remains available.";
  if (status === "processing") return "Your local computer is preparing feedback for this session.";
  if (status === "retry_wait") return "The review was delayed and is waiting to retry.";
  if (status === "attention") return "The review needs attention. Open the session to check or request feedback again.";
  if (status === "ready") return "The saved review is available below.";
  return "No review has been requested for this session. Open it to request feedback or inspect the recorded facts.";
}

export function reviewMatchLabel(comparison: ActivityReviewComparison) {
  return ({ suggested: "Suggested plan match — not confirmed", confirmed: "Confirmed plan match", ambiguous: "Plan match is uncertain", unplanned: "Unplanned session", none: "No planned session linked" } as const)[comparison.matchState];
}

export function reviewExcerpt(text: string, maxWords = 60) {
  const words = text.trim().split(/\s+/);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}…` : text;
}
