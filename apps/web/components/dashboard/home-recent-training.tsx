"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { ActivitiesListResponse } from "../../../../packages/core/src/contracts";
import { formatDistance, formatDuration, formatPace, sportLabel } from "../../lib/activity-formatters";
import { readActivitiesListResponse } from "../../lib/activities-api-client";
import { useActivityCoachReview } from "../activities/use-activity-coach-review";
import { createRecoveryContext, dataQualityHref, readRecoveryContext, restoreRecoveryFocus } from "../../lib/recovery-context";
import { compactHomeTakeaway } from "../../lib/home-summary";

type State = "loading" | "ready" | "empty" | "error";
export function HomeRecentTraining({ timezone = "Africa/Johannesburg" }: { timezone?: string }) {
  const [state, setState] = useState<State>("loading");
  const [activity, setActivity] = useState<ActivitiesListResponse["items"][number] | null>(null);
  const reviewRead = useActivityCoachReview(activity?.id ?? null);
  const fullReviewLauncher = useRef<HTMLAnchorElement | null>(null);
  const focusedReviewLauncher = useRef<HTMLAnchorElement | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setState("loading");
    void fetch("/api/v1/activities?limit=40", { cache: "no-store" }).then(readActivitiesListResponse).then((activities) => {
      if (!active) return;
      const latest = [...activities.items].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id))[0] ?? null;
      setActivity(latest);
      setState(latest ? "ready" : "empty");
    }).catch(() => {
      if (active) setState("error");
    });
    return () => { active = false; };
  }, [retry]);

  if (state === "loading") return <p className="state-copy" role="status" aria-busy="true">Loading the latest recorded session…</p>;
  if (state === "error") return <div className="home-state home-state--error" role="alert"><p>Recent training could not be loaded.</p><button className="button button-secondary" onClick={() => setRetry((value) => value + 1)}>Retry activity</button><Link className="text-link" href="/dashboard/activities">Open Training</Link></div>;
  if (state === "empty" || !activity) return <div className="home-state"><p>No recorded training yet. Add a session to make recent training available.</p><Link className="button button-secondary" href="/dashboard/data-quality" onClick={(event) => { event.preventDefault(); const context = createRecoveryContext({ kind: "home", path: "/dashboard", scrollY: window.scrollY, focusKey: "recent-training-heading", issue: "No recorded training is available for the recent-training assessment." }); window.location.assign(dataQualityHref(context)); }}>Add training</Link></div>;

  const activityLabel = activity.title || `${sportLabel(activity.sport)} session`;
  const feedback = reviewRead.data;
  const review = feedback?.review;
  const presentation = review ? compactHomeTakeaway(review) : null;
  const fullReviewLauncherId = `full-review-${activity.id}`;
  const sessionHref = `/dashboard/activities?activityId=${encodeURIComponent(activity.id)}&returnTo=%2Fdashboard#coach-review-${encodeURIComponent(activity.id)}`;
  const openFullReview = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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
    <div className="home-session-heading"><div><h3>{activityLabel}</h3><p className="metadata"><time dateTime={activity.occurredAt}>{new Intl.DateTimeFormat("en-ZA", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date(activity.occurredAt))}</time> · {formatDistance(activity.distanceM)} · {formatDuration(activity.elapsedTimeS)} elapsed · {formatPace(activity.avgPaceSecPerKm)}</p></div><span className="home-recorded-label">Recorded</span></div>
    {review && presentation ? <>
      {feedback?.status !== "ready" || reviewRead.phase === "error" ? <p className="home-session-caveat" role="status">Saved takeaway; its freshness could not be confirmed.</p> : null}
      <div className="home-review-commentary" aria-label="Latest activity takeaway">
        <p>{presentation.assessment}</p>
      </div>
      {review.comparison.matchState !== "confirmed" || presentation.limitations.length > 0 ? <p className="home-session-caveat">{review.comparison.matchState !== "confirmed" ? <span>{review.comparison.matchState === "suggested" ? "Possible planned session; link unconfirmed." : "No confirmed planned-session link."} </span> : null}{presentation.limitations.length > 0 ? <span><strong>Evidence limits:</strong> {presentation.limitations.join(" ")}</span> : null}</p> : null}
    </> : <p className="quiet-copy" role="status">{review ? "A short takeaway is unavailable. Read the full review for its context." : reviewRead.phase === "error" ? "Takeaway unavailable. Recorded facts remain available." : "No takeaway available yet."}</p>}
    <Link id={fullReviewLauncherId} ref={restoreFullReviewLauncher} className="text-link" href={sessionHref} onClick={openFullReview}>{review ? "View full session review" : "View latest session"} →</Link>
  </article>;
}
