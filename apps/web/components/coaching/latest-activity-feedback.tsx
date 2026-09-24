"use client";

import { useEffect, useState } from "react";
import type { ActivityCoachReviewSummary } from "../../../../packages/core/src/contracts/activity-review";
import { readActivityCoachReviewSummaryListResponse } from "../../lib/activities-api-client";

export function LatestActivityFeedback() {
  const [review, setReview] = useState<ActivityCoachReviewSummary | null>(null);
  useEffect(() => {
    void fetch("/api/v1/coaching/activity-reviews/latest?limit=1", { cache: "no-store" })
      .then(readActivityCoachReviewSummaryListResponse)
      .then((result) => setReview(result.items[0] ?? null))
      .catch(() => undefined);
  }, []);
  if (!review) return null;
  return <section className="latest-activity-feedback state-panel" aria-labelledby="latest-activity-feedback-title">
    <div><p className="eyebrow">Latest workout feedback</p><h2 id="latest-activity-feedback-title">{review.headline}</h2><p>{review.nextStep}</p></div>
    <a className="button button-secondary" href={`/dashboard/activities?activityId=${encodeURIComponent(review.activityId)}#coach-review-${encodeURIComponent(review.activityId)}`}>Read feedback</a>
  </section>;
}
