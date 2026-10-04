"use client";

import { useEffect, useState } from "react";
import { type ActivityAthleteFeedback as Feedback, type ActivityCoachReview } from "../../../../packages/core/src/contracts/activity-review";
import { readActivityFeedbackResponse } from "../../lib/activities-api-client";

export function ActivityAthleteFeedback({ activityId, headingLevel = 3, recordHeadingId }: { activityId: string; headingLevel?: 3 | 4; recordHeadingId?: string }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [legacyReviews, setLegacyReviews] = useState<ActivityCoachReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const Heading = headingLevel === 3 ? "h3" : "h4";

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/feedback`, { cache: "no-store" })
      .then(async (response) => {
        return readActivityFeedbackResponse(response);
      })
      .then((value) => { if (!cancelled) { setFeedback(value.athleteFeedback); setLegacyReviews(value.legacyReviews); } })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Athlete feedback could not be loaded."); });
    return () => { cancelled = true; };
  }, [activityId]);

  return (
    <section className="activity-athlete-feedback detail-subsection" aria-labelledby={`athlete-feedback-${activityId}${recordHeadingId ? ` ${recordHeadingId}` : ""}`}>
      <div className="detail-section-heading"><div><p className="eyebrow">Athlete reflection</p><Heading id={`athlete-feedback-${activityId}`}>AI athlete feedback</Heading></div>
        {feedback ? <span className="activity-review-badge">Locally approved</span> : null}</div>
      {error ? <p className="activity-review-state activity-review-state--error" role="alert">{error}</p> : null}
      {feedback ? <div className="activity-review-content"><p className="activity-review-meta">Added {new Date(feedback.publishedAt).toLocaleString()} · {feedback.model}</p><h4>{feedback.headline}</h4><p className="activity-review-assessment">{feedback.summary}</p></div> : !error ? <p className="activity-review-state">Athlete feedback has not been provided.</p> : null}
      {legacyReviews.length > 0 ? <details className="activity-review-details"><summary>Previous combined reviews</summary><ul>{legacyReviews.map((review) => <li key={review.id}>{review.headline} · {new Date(review.publishedAt).toLocaleString()}</li>)}</ul></details> : null}
    </section>
  );
}
