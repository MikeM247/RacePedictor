"use client";

import { useRef, useState } from "react";
import type { ActivityCoachReviewResponse } from "../../../../packages/core/src/contracts/activity-review";
import { reviewMatchLabel, reviewStatusLabel, reviewStatusMessage } from "./review-presentation";
import {
  readActivityReviewRequestResponse,
} from "../../lib/activities-api-client";
import { useActivityCoachReview } from "./use-activity-coach-review";

type ReviewData = ActivityCoachReviewResponse["data"];

export function ActivityCoachReview({ activityId }: { activityId: string }) {
  const reviewRead = useActivityCoachReview(activityId);
  const [requestMessage, setRequestMessage] = useState<string>();
  const [requesting, setRequesting] = useState(false);
  const requestInFlight = useRef(false);
  const data = reviewRead.data;

  async function requestReview() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRequesting(true);
    setRequestMessage(undefined);
    try {
      const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/coach-review`, { method: "POST" });
      const result = await readActivityReviewRequestResponse(response);
      reviewRead.applyRequestResult(result);
    } catch (error) {
      setRequestMessage(error instanceof Error ? error.message : "Feedback could not be requested.");
    } finally {
      requestInFlight.current = false;
      setRequesting(false);
    }
  }

  return (
    <section className="activity-coach-review detail-subsection" aria-labelledby={`coach-review-${activityId}`}>
      <div className="detail-section-heading">
        <div>
          <p className="eyebrow">Athlete Intelligence</p>
          <h3 id={`coach-review-${activityId}`}>Coach&apos;s review</h3>
        </div>
        {data?.review ? <span className="activity-review-badge">AI-generated</span> : null}
      </div>

      {reviewRead.phase === "loading" && !data?.review ? <p className="activity-review-state" role="status">Checking for feedback…</p> : null}
      {reviewRead.refreshing ? <p className="activity-review-state" role="status">Checking for updated feedback. The saved review remains visible.</p> : null}
      {reviewRead.phase === "error" ? <div className="activity-review-state activity-review-state--error" role="alert"><p>{reviewRead.message}</p><button className="button button-secondary" type="button" onClick={() => void reviewRead.load()}>Try again</button></div> : null}
      {reviewRead.phase !== "loading" && !data?.review ? (
        <div className="activity-review-state">
          <p>{reviewStatusMessage(data?.status)}</p>
          <button className="button button-secondary" type="button" disabled={requesting || data?.status === "processing" || data?.status === "queued"} onClick={() => void requestReview()}>
            {requesting ? "Requesting…" : data?.status === "queued" ? "Review queued" : data?.status === "processing" ? "Review in progress" : "Request coach feedback"}
          </button>
          {data?.status === "queued" || data?.status === "processing" || data?.status === "retry_wait" || data?.status === "attention" || data?.status === "ready"
            ? <button className="button button-secondary" type="button" onClick={() => void reviewRead.load()}>Check for updated feedback</button>
            : null}
          {requestMessage ? <p className="activity-review-error" role="alert">{requestMessage}</p> : null}
        </div>
      ) : null}
      {data?.review ? <ReviewContent review={data.review} status={data.status} onRefresh={() => void reviewRead.load()} /> : null}
    </section>
  );
}

function ReviewContent({ review, status, onRefresh }: { review: NonNullable<ReviewData["review"]>; status: ReviewData["status"]; onRefresh: () => void }) {
  return (
    <div className="activity-review-content">
      <p className="activity-review-meta">Reviewed {new Date(review.publishedAt).toLocaleString()} · {review.model}</p>
      <p className="activity-review-context" role="status"><strong>{reviewStatusLabel(status)}:</strong> {reviewStatusMessage(status, true)}</p>
      <h4>{review.headline}</h4>
      <p className="activity-review-assessment">{review.assessment}</p>
      <div className="activity-review-next"><strong>Next step</strong><p>{review.nextStep}</p></div>
      <p className="activity-review-context"><strong>{reviewMatchLabel(review.comparison)}:</strong> {review.comparison.interpretation}{review.comparison.planVersion ? ` Plan version ${review.comparison.planVersion}.` : ""}</p>
      {review.limitations.map((limit) => <p className="activity-review-limitation" key={limit}><strong>Evidence limit:</strong> {limit}</p>)}
      <p className="activity-review-limitation">This advisory review does not change your approved prescription.</p>
      <details className="activity-review-details">
        <summary>Compare with the plan</summary>
        <dl>
          <div><dt>Planned session</dt><dd>{review.comparison.sessionTitle ?? "No planned session linked"}</dd></div>
          <div><dt>Duration</dt><dd>{formatMinutes(review.comparison.plannedDurationMinutes)} planned · {formatMinutes(review.comparison.actualDurationMinutes)} recorded</dd></div>
          <div><dt>Distance</dt><dd>{formatDistance(review.comparison.plannedDistanceMeters)} planned · {formatDistance(review.comparison.actualDistanceMeters)} recorded</dd></div>
          <div><dt>Interpretation</dt><dd>{review.comparison.interpretation}</dd></div>
        </dl>
      </details>
      <details className="activity-review-details"><summary>Review evidence</summary><ul>{review.evidence.map((item, index) => <li key={index}>{item.label} ({item.source.replaceAll("_", " ")}){item.reference ? ` · Reference: ${item.reference}` : ""}</li>)}</ul><p>Review revision {review.revision}. {review.comparison.planId ? `Plan reference: ${review.comparison.planId}.` : "No plan reference supplied."}</p></details>
      <button className="button button-secondary activity-review-refresh" type="button" onClick={onRefresh}>Check for updated feedback</button>
    </div>
  );
}

function formatMinutes(value: number | null) { return value === null ? "Not supplied" : `${Math.round(value * 10) / 10} min`; }
function formatDistance(value: number | null) { return value === null ? "Not supplied" : `${(value / 1000).toFixed(2)} km`; }
