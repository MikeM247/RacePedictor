"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { ActivitiesListResponse } from "../../../../packages/core/src/contracts";
import { formatActivityDate, formatDistance, formatDuration, formatPace, sportLabel } from "../../lib/activity-formatters";
import { readActivitiesListResponse } from "../../lib/activities-api-client";
import { reviewMatchLabel, reviewStatusLabel, reviewStatusMessage } from "../activities/review-presentation";
import { useActivityCoachReview } from "../activities/use-activity-coach-review";
import { createRecoveryContext, dataQualityHref, readRecoveryContext, restoreRecoveryFocus } from "../../lib/recovery-context";
import { presentHomeReview } from "../../lib/home-review-presentation";

type State = "loading" | "ready" | "empty" | "error";
export function HomeRecentTraining() {
  const [state, setState] = useState<State>("loading");
  const [activity, setActivity] = useState<ActivitiesListResponse["items"][number] | null>(null);
  const reviewRead = useActivityCoachReview(activity?.id ?? null);
  const fullReviewLauncher = useRef<HTMLAnchorElement | null>(null);
  const focusedReviewLauncher = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/activities?limit=40", { cache: "no-store" }).then(readActivitiesListResponse).then((activities) => {
      if (!active) return;
      const latest = [...activities.items].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0] ?? null;
      setActivity(latest);
      setState(latest ? "ready" : "empty");
    }).catch(() => {
      if (active) setState("error");
    });
    return () => { active = false; };
  }, []);

  if (state === "loading") return <p className="state-copy" role="status" aria-busy="true">Loading the latest recorded session…</p>;
  if (state === "error") return <div className="home-state home-state--error" role="alert"><p>Recent training could not be loaded. Your prediction and approved schedule are unchanged.</p><Link className="text-link" href="/dashboard/activities">Open Training</Link></div>;
  if (state === "empty" || !activity) return <div className="home-state"><p>No recorded training yet. Add a session to make recent training available.</p><Link className="button button-secondary" href="/dashboard/data-quality" onClick={(event) => { event.preventDefault(); const context = createRecoveryContext({ kind: "home", path: "/dashboard", scrollY: window.scrollY, focusKey: "recent-training-heading", issue: "No recorded training is available for the recent-training assessment." }); window.location.assign(dataQualityHref(context)); }}>Add training</Link></div>;

  const activityLabel = activity.title || `${sportLabel(activity.sport)} session`;
  const feedback = reviewRead.data;
  const review = feedback?.review;
  const presentation = review ? presentHomeReview(review) : null;
  const reviewLabel = reviewRead.phase === "loading" ? "Checking review" : reviewRead.phase === "error" ? "Review unavailable" : reviewStatusLabel(feedback?.status);
  const fullReviewLauncherId = `full-review-${activity.id}`;
  const sessionHref = `/dashboard/activities?activityId=${encodeURIComponent(activity.id)}&returnTo=%2Fdashboard#coach-review-${encodeURIComponent(activity.id)}`;
  const openFullReview = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const context = createRecoveryContext({
      kind: "home",
      path: "/dashboard",
      activityId: activity.id,
      scrollY: window.scrollY,
      focusKey: fullReviewLauncherId,
      issue: "Return to the latest recorded session review.",
    });
    window.location.assign(`/dashboard/activities?activityId=${encodeURIComponent(activity.id)}&returnTo=%2Fdashboard&recovery=${encodeURIComponent(context.id)}`);
  };
  const restoreFullReviewLauncher = (node: HTMLAnchorElement | null) => {
    fullReviewLauncher.current = node;
    const context = readRecoveryContext(new URLSearchParams(window.location.search).get("recovery"));
    if (!node || focusedReviewLauncher.current === node || context?.kind !== "home" || context.activityId !== activity.id || context.focusKey !== fullReviewLauncherId) return;
    focusedReviewLauncher.current = node;
    restoreRecoveryFocus(context);
    window.requestAnimationFrame(() => node.focus({ preventScroll: true }));
  };
  return <article className="home-session-summary">
    <div className="home-session-heading"><div><h3>{activityLabel}</h3><p className="metadata">{formatActivityDate(activity.localOccurredAt, activity.occurredAt)} · {formatDistance(activity.distanceM)} · {formatDuration(activity.elapsedTimeS)} · {formatPace(activity.avgPaceSecPerKm)}</p></div><span className={`status-chip${review ? " status-chip--current" : " status-chip--warning"}`}>{reviewLabel}</span></div>
    {review && presentation ? <>
      {feedback?.status !== "ready" ? <p className="home-session-caveat" role="status"><strong>{reviewStatusLabel(feedback?.status)}:</strong> {reviewStatusMessage(feedback?.status, true)}</p> : null}
      {reviewRead.refreshing ? <p className="home-session-caveat" role="status">Checking for an updated review. The saved review remains visible.</p> : null}
      {reviewRead.phase === "error" ? <p className="home-session-caveat" role="alert">Feedback could not be checked. The saved review below may not reflect the current request status.</p> : null}
      <div className="home-review-commentary" aria-label="Coach's review commentary">
        {presentation.headline ? <p><strong>{presentation.headline}</strong></p> : null}
        <p>{presentation.assessment}</p>
        {presentation.isFullPassageFallback ? <p className="home-review-fallback">Full review passage shown because safely shortening this supplied text could change its meaning.</p> : null}
      </div>
      <p className="home-session-caveat"><strong>{reviewMatchLabel(review.comparison)}:</strong>{review.comparison.planVersion ? ` Plan version ${review.comparison.planVersion}.` : " No plan version was supplied."} {review.comparison.interpretation}</p>
      <p className="home-session-caveat"><strong>Goal impact:</strong> Goal impact cannot be assessed from the available review evidence.</p>
      {presentation.limitations.length > 0 ? <p className="home-session-caveat"><strong>Evidence limits:</strong> {presentation.limitations.join(" ")}</p> : null}
      <p className="home-session-caveat">This advisory review does not change your approved prescription.</p>
      <Link id={fullReviewLauncherId} ref={restoreFullReviewLauncher} className="text-link" href={sessionHref} onClick={openFullReview}>View full session review</Link>
    </> : <><p role="status">{reviewRead.phase === "error" ? `Feedback could not be checked${reviewRead.message ? `: ${reviewRead.message}` : ""}. Its request status and training conclusions are unknown.` : reviewRead.phase === "loading" ? "Checking this session’s review status…" : reviewStatusMessage(feedback?.status)}</p><p className="home-session-caveat">Goal impact cannot be assessed without sufficient review evidence. The recorded facts remain available.</p><Link id={fullReviewLauncherId} ref={restoreFullReviewLauncher} className="text-link" href={sessionHref} onClick={openFullReview}>View latest session</Link></>}
  </article>;
}
