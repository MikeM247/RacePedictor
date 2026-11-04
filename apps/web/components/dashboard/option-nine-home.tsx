"use client";
import Link from "next/link";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import type { MilestoneEntry } from "../../../../packages/core/src/contracts/milestone-timeline.ts";
import type { TrainingSection } from "../../../../packages/core/src/contracts/home-training.ts";
import {
  homeMilestones,
  entryTargetLabel,
  entryStatus, milestoneResultTime, milestoneResultDistance,
  daysUntil,
} from "../../../../packages/core/src/services/home-milestones.ts";
import { entryImage } from "../../../../packages/core/src/services/milestone-images.ts";
import type { ImageState } from "../../../../packages/core/src/contracts/milestone-images.ts";
import { useMilestoneTimeline } from "../../lib/use-milestone-timeline.ts";
import { useMilestoneImages } from "../../lib/use-milestone-images.ts";
import { useHomeTraining } from "../../lib/use-home-training.ts";
import {
  localDateInTimezone,
  formatCoachingDate,
} from "../../lib/coaching-ui-state.ts";
import {
  formatDistance,
  formatDuration,
} from "../../lib/activity-formatters.ts";
import {
  createRecoveryContext,
  readRecoveryContext,
  restoreRecoveryFocus,
} from "../../lib/recovery-context.ts";
import { useDashboardFeatures } from "./dashboard-feature-context";
import { NativeModal } from "../coaching/native-modal";
import { DashboardNavigation } from "./dashboard-navigation";
import { millisecondsUntilLocalMidnight } from "../../lib/home-midnight.ts";
import "./option-nine-reference.css";
import "./option-nine-home.css";
const paths = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  coach: "M4 4h16v12H9l-5 4V4Z",
  calendar: "M4 5h16v16H4ZM4 10h16M8 2v6M16 2v6",
  readiness: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  check: "m5 12 4 4L19 6",
  menu: "M4 7h16M4 12h16M4 17h16",
};
function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
function dateLabel(
  date: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
) {
  const formatted = new Intl.DateTimeFormat("en-ZA", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  return options.day === "numeric"
    ? formatted.replace(/^0(\d\s)/, "$1")
    : formatted;
}
function HomeNavigation({
  date,
  coachAvailable,
}: {
  date: string;
  coachAvailable: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const links = [
    { name: "Home", path: "/dashboard", icon: "home" as const },
    ...(coachAvailable
      ? [{ name: "Coach", path: "/dashboard/coach", icon: "coach" as const }]
      : []),
    {
      name: "Calendar",
      path: "/dashboard/calendar",
      icon: "calendar" as const,
    },
    {
      name: "Readiness",
      path: "/dashboard/readiness",
      icon: "readiness" as const,
    },
  ];
  const items = (mobile = false) =>
    links.map((link) => (
      <Link
        key={link.path}
        className={
          mobile
            ? link.name === "Home"
              ? "active"
              : ""
            : `nav-item${link.name === "Home" ? " active" : ""}`
        }
        href={link.path}
        aria-current={link.name === "Home" ? "page" : undefined}
      >
        <Icon name={link.icon} />
        <span>{link.name}</span>
      </Link>
    ));
  return (
    <>
      <a className="home-skip-link" href="#dashboard-main-content">
        Skip to page content
      </a>
      <header className="topnav">
        <div className="mobile-menu">
          <button
            ref={trigger}
            aria-label="Open navigation"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <Icon name="menu" />
          </button>
          <span>Home</span>
        </div>
        <nav className="nav-group" aria-label="Main navigation">
          {items()}
        </nav>
        <div className="utility">
          <span className="date-chip">{date}</span>
          <Link
            className="settings"
            href="/dashboard/settings"
            aria-label="Settings"
          >
            <Icon name="settings" />
          </Link>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {items(true)}
      </nav>
      <NativeModal
        open={menu}
        titleId="home-navigation-title"
        onClose={() => setMenu(false)}
        returnFocusRef={trigger}
        className="app-dialog"
      >
        <h2 id="home-navigation-title">Navigation</h2>
        <nav className="home-menu-links">
          {items()}
          <Link href="/dashboard/settings">Settings</Link>
        </nav>
        <button className="button" onClick={() => setMenu(false)}>
          Close navigation
        </button>
      </NativeModal>
    </>
  );
}
export function MilestoneMark({
  entry,
  state,
}: {
  entry: MilestoneEntry;
  state?: ImageState;
}) {
  const mark = entryImage(state, entry),
    [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [mark.url]);
  const pb = entry.achievement?.achievement === "personal_best";
  const distance =
    milestoneResultDistance(entry) ?? entry.target?.distanceMeters;
  const number = distance
    ? String(Math.round(distance / 1000))
    : pb
      ? /\b(\d+(?:\.\d+)?)\s*km\b/i.exec(entry.title)?.[1]
      : undefined;
  return mark.url && !failed ? (
    <img
      className="race-mark"
      src={mark.url}
      alt={mark.label ?? ""}
      width={66}
      height={66}
      onError={() => setFailed(true)}
    />
  ) : pb ? (
    <div className="personal-best-mark" aria-hidden="true">
      <strong>{number ?? "PB"}</strong>
      <small>{number ? "KM · PB" : "PERSONAL BEST"}</small>
      <span className="personal-best-check" aria-hidden="true">
        <Icon name="check" />
      </span>
    </div>
  ) : (
    <div className="race-mark home-neutral-mark" aria-hidden="true">
      {number ? `${number} km` : "Race"}
    </div>
  );
}
function MilestoneStops({
  entries,
  nextId,
  state,
  onSelect,
}: {
  entries: MilestoneEntry[];
  nextId?: string;
  state?: ImageState;
  onSelect: (entry: MilestoneEntry) => void;
}) {
  return (
    <ol className="achievement-stops">
      {entries.map((entry, index) => {
        const status = entryStatus(entry),
          achieved = status === "Achieved",
          final = entry.target?.mainGoal;
        const role = achieved
          ? "Achieved"
          : entry.completion === "completed"
            ? "Completed"
            : entry.id === nextId
              ? "Next goal"
              : final
                ? "The destination"
                : entry.completion === "result_pending"
                  ? "Result pending"
                  : "Milestone";
        const result = milestoneResultTime(entry);
        return (
          <li
            key={entry.id}
            className={`achievement-stop${achieved ? " achievement-stop--achieved" : ""}${entry.id === nextId ? " achievement-stop--next" : ""}${final ? " achievement-stop--final" : ""}`}
          >
            <span className="achievement-node" aria-hidden="true">
              {achieved ? <Icon name="check" /> : null}
            </span>
            <div className="achievement-stop-label">
              {String(index + 1).padStart(2, "0")} · {role}
            </div>
            <MilestoneMark entry={entry} state={state} />
            <div className="achievement-stop-copy">
              <h3>
                <button
                  className="home-milestone-name"
                  onClick={() => onSelect(entry)}
                >
                  {entry.title}
                </button>
              </h3>
              <p className="achievement-target">
                {result
                  ? formatDuration(result)
                  : entry.achievement?.achievement === "personal_best"
                    ? "Personal best"
                    : entryTargetLabel(entry)}
              </p>
              {entry.date ? (
                <time dateTime={entry.date}>
                  {dateLabel(entry.date, "UTC", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
              ) : null}
              {entry.completion === "completed" ? (
                <span
                  className={
                    achieved ? "achievement-confirmed" : "home-result-state"
                  }
                >
                  {achieved ? <Icon name="check" /> : null}
                  {status}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
export function OptionNineHome({
  now,
  refreshKey,
  onRefresh,
}: {
  now: Date;
  refreshKey: number;
  onRefresh?: () => void;
}) {
  const timeline = useMilestoneTimeline(false, refreshKey),
    images = useMilestoneImages(true, refreshKey),
    training = useHomeTraining(refreshKey);
  const { coachAvailable } = useDashboardFeatures();
  const [reviewQueue, setReviewQueue] = useState<any[]>([]), [selectedReviewId, setSelectedReviewId] = useState<string | null>(null), [reviewBusy, setReviewBusy] = useState(false);
  const reviewReturnFocus = useRef<HTMLHeadingElement | null>(null);
  const reviewCandidate = reviewQueue[0] ?? null;
  const reviewOptions = reviewCandidate ? reviewQueue.filter((candidate) => candidate.target.id === reviewCandidate.target.id) : [];
  const reviewGroupCount = new Set(reviewQueue.map(candidate => candidate.target.id)).size;
  const selectedReview = selectedReviewId ? reviewOptions.find((candidate) => candidate.achievement.id === selectedReviewId) : undefined;
  const activeReview = selectedReview ?? reviewCandidate;
  const officialFacts = activeReview ? activeReview.achievement.officialResult : undefined;
  const resultFacts = activeReview ? officialFacts ?? activeReview.achievement : undefined;
  const reviewTargetLabel = activeReview ? entryTargetLabel({ title: activeReview.target.title, target: activeReview.target } as MilestoneEntry) : "Finish goal";
  const reviewOutcome = activeReview?.assessment?.performance === "achieved"
    ? `This result appears to meet the ${reviewTargetLabel} target.`
    : activeReview?.assessment?.performance === "missed"
      ? `You finished the race; this result appears outside the ${reviewTargetLabel} target.`
      : activeReview?.assessment?.performance === "not_set"
        ? "The race can be completed without a time target."
        : "The finish can be confirmed, but these facts do not yet support a target assessment.";
  const reviewDifference = activeReview?.assessment?.timeDifferenceSeconds;
  const timezone =
    timeline.data?.context?.plan?.timezone ??
    training.data?.timezone ??
    "Africa/Johannesburg";
  const today = localDateInTimezone(timezone, now),
    date = dateLabel(today, timezone, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const journey = homeMilestones(timeline.data?.entries ?? [], today),
    next = journey.next,
    target = next?.target;
  useEffect(() => {
    let active=true;
    let focusTimer:number|undefined;
    const check=async()=>{
      if(document.visibilityState!=="visible" || !timeline.data || document.querySelector("dialog[open]"))return;
      const focused=document.activeElement;
      if(focused instanceof HTMLElement && focused!==document.body && focused!==document.documentElement && focused.matches("a,button,input,textarea,select,[role=button],[contenteditable=true],[tabindex]:not([tabindex='-1'])"))return;
      try { const response=await fetch("/api/v1/coaching/milestones/reviews",{cache:"no-store"}); if(!response.ok)return; const data=(await response.json()).data; if(!active)return; setReviewQueue((current)=>current.length?current:data.candidates); }
      catch { /* keep Home usable when review checks are unavailable */ }
    };
    void check(); const refresh=()=>void check(); const timer=window.setInterval(refresh,30_000);
    const focusout=()=>{window.clearTimeout(focusTimer);focusTimer=window.setTimeout(refresh,0);};
    window.addEventListener("focus",refresh); document.addEventListener("visibilitychange",refresh);
    document.addEventListener("focusout",focusout);
    window.addEventListener("milestones-changed",refresh); window.addEventListener("race-history-changed",refresh); window.addEventListener("activities-changed",refresh); window.addEventListener("activity-sync-complete",refresh);
    return()=>{active=false;window.clearInterval(timer);window.clearTimeout(focusTimer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);document.removeEventListener("focusout",focusout);window.removeEventListener("milestones-changed",refresh);window.removeEventListener("race-history-changed",refresh);window.removeEventListener("activities-changed",refresh);window.removeEventListener("activity-sync-complete",refresh);};
  },[timeline.data]);
  async function decideReview(decision:"confirm"|"deferred"|"rejected") {
    if(!activeReview||reviewBusy||!timeline.data)return; setReviewBusy(true);
    try {
      const target=activeReview.target, result=activeReview.achievement;
      const entry=timeline.data.entries.find(e=>e.target?.id===target.id) ?? timeline.data.entries.find(e=>e.achievement?.id===result.id);
      if(!entry)throw new Error("Reload milestones to review this race.");
      const command={operation:"link",entryId:entry.id,achievementId:result.id,confirmedSameRace:true,expectedRevision:timeline.data.revision,sourceVersion:timeline.data.sourceVersion};
      if(decision==="confirm") {
        const previewResponse=await fetch("/api/v1/coaching/milestones/results/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}); const preview=await previewResponse.json(); if(!previewResponse.ok)throw new Error(preview.error?.message??"Could not review this result.");
        if(preview.data.imageConflict)throw new Error("Choose which milestone image to keep in Settings before linking.");
        const response=await fetch("/api/v1/coaching/milestones/results/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...command,previewDigest:preview.data.digest})}); if(!response.ok)throw new Error("Milestones changed. Reload before confirming.");
        timeline.accept((await response.json()).data); window.dispatchEvent(new Event("milestones-changed")); window.dispatchEvent(new Event("milestone-images-changed"));
      } else {
        const groupDecision=!!reviewCandidate?.ambiguous&&!selectedReview;
        const response=await fetch("/api/v1/coaching/milestones/changes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation:"review",entryId:target.id,achievementId:groupDecision?"*":result.id,reviewDecision:decision,expectedRevision:timeline.data.revision,sourceVersion:timeline.data.sourceVersion})}); if(!response.ok)throw new Error("Milestones changed. Reload before deciding."); timeline.accept((await response.json()).data);
      }
      setReviewQueue((current)=>decision==="confirm"||!!reviewCandidate?.ambiguous&&!selectedReview?current.filter(candidate=>candidate.target.id!==target.id):current.filter(candidate=>candidate.achievement.id!==result.id));
      setSelectedReviewId(null);
    } catch(error) { window.alert(error instanceof Error?error.message:"Could not save your review decision."); } finally {setReviewBusy(false);}
  }
  useEffect(() => {
    if (!onRefresh) return;
    const timer = window.setTimeout(
      onRefresh,
      millisecondsUntilLocalMidnight(timezone),
    );
    return () => window.clearTimeout(timer);
  }, [timezone, today, onRefresh]);
  const [savedSelection, setSelection] = useState<MilestoneEntry | null>(null),
    [all, setAll] = useState(false),
    [hero, setHero] = useState("/road-to-comrades-v2.webp"),
    [orbitFailed, setOrbitFailed] = useState(false);
  const selection = savedSelection ? timeline.data?.entries.find(e => e.id === savedSelection.id || e.sources.some(source => savedSelection.sources.some(old => old.kind === source.kind && old.id === source.id))) ?? null : null;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/dashboard/appearance", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (r.ok) {
          const x = await r.json();
          if (
            typeof x.data?.heroImageUrl === "string" &&
            !controller.signal.aborted
          )
            setHero(x.data.heroImageUrl);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [refreshKey]);
  useEffect(() => {
    const context = readRecoveryContext(
      new URLSearchParams(window.location.search).get("recovery"),
    );
    if (context?.kind === "home") {
      restoreRecoveryFocus(context);
      requestAnimationFrame(() =>
        document
          .getElementById(context.focusKey ?? "")
          ?.focus({ preventScroll: true }),
      );
    }
  }, [training.data]);
  const raceName = target?.eventName || next?.title || "";
  const split = /^(.*?)\s+(\d+(?:\.\d+)?\s*km)\.?$/i.exec(raceName);
  const days = target ? daysUntil(target.date, today) : null;
  return (
    <div className="option-nine-home spotlight hybrid with-achievements with-training">
      <DashboardNavigation activePage="home" />
      <main className="app-main" id="dashboard-main-content" tabIndex={-1}>
        <header className="page-head">
          <div>
          <h1 ref={reviewReturnFocus} tabIndex={-1}>One milestone closer.</h1>
            <p>Your next goal in focus. See how far you’ve already come.</p>
          </div>
          <span className="small-note">{date}</span>
        </header>
        <div className="spotlight-grid">
          <section
            className="spotlight-hero"
            aria-labelledby="next-goal"
            style={
              {
                "--home-hero-image": `url(${JSON.stringify(hero)})`,
              } as CSSProperties
            }
          >
            <div className="hero-copy">
              <div className="overline">
                {target?.mainGoal ? "Your final goal" : "Your next goal"}
              </div>
              <h2 id="next-goal" className="race-name">
                {next ? (
                  split ? (
                    <>
                      <span>{split[1]}</span>{" "}
                      <span className="hybrid-distance">{split[2]}.</span>
                    </>
                  ) : (
                    raceName
                  )
                ) : timeline.data ? (
                  "Your next finish line."
                ) : (
                  "Loading your goal…"
                )}
              </h2>
              {target && next ? (
                <>
                  <p className="race-subtitle">
                    {dateLabel(target.date, timezone, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <div className="race-facts">
                    <div className="fact">
                      <span>Your target</span>
                      <strong>{entryTargetLabel(next)}</strong>
                    </div>
                    <div className="fact">
                      <span>Race day</span>
                      <strong>
                        <time dateTime={target.date}>
                          {dateLabel(target.date, timezone, {
                            day: "2-digit",
                            month: "short",
                          })}
                        </time>
                      </strong>
                    </div>
                  </div>
                  <button className="button" onClick={() => setSelection(next)}>
                    View {target.mainGoal ? "final" : "next"} goal
                    <Icon name="arrow" />
                  </button>
                </>
              ) : (
                <p className="race-subtitle">
                  {timeline.error ||
                  timeline.data?.context?.state === "unavailable" ||
                  timeline.data?.context?.state === "projection_pending"
                    ? "Your approved goal is unavailable. Reload verified milestones."
                    : "Set a race goal in Plan to start your next chapter."}{" "}
                  <Link href="/dashboard/plan">View Plan →</Link>
                </p>
              )}
            </div>
            {days !== null ? (
              <div
                className="countdown"
                aria-label={
                  days === 0 ? "Race day" : `${days} days until ${raceName}`
                }
              >
                <strong>
                  {days === 0 ? "Today" : String(days).padStart(2, "0")}
                </strong>
                <span>{days === 0 ? "Race day" : "days to go"}</span>
              </div>
            ) : null}
          </section>
          <aside className="spotlight-coach" aria-label="My AI Coach">
            <div className="coach-top">
              <div className="overline">My AI Coach</div>
              <h2>ORBIT</h2>
            </div>
            {orbitFailed ? (
              <div className="coach-character home-orbit-fallback">ORBIT</div>
            ) : (
              <img
                className="coach-character"
                src="/images/orbit-coach-full.webp"
                alt="ORBIT, your humanoid AI running coach"
                width={500}
                height={750}
                onError={() => setOrbitFailed(true)}
              />
            )}
            <p className="coach-line">
              A little perspective.
              <br />A plan for your next step.
            </p>
            {coachAvailable ? (
              <Link className="button" href="/dashboard/coach">
                Talk to ORBIT
                <Icon name="arrow" />
              </Link>
            ) : (
              <button className="button" disabled>
                Coach unavailable
              </button>
            )}
          </aside>
        </div>
        <section
          className="hybrid-journey"
          aria-labelledby="race-timeline-heading"
        >
          <header className="milestone-heading">
            <h2 id="race-timeline-heading">Your journey: achieved and ahead</h2>
            <Link
              className="home-management-link"
              aria-label="Manage milestones"
              href="/dashboard/settings?section=milestones"
            >
              <span className="home-management-full">Manage milestones</span>
              <span className="home-management-compact">Manage</span> →
            </Link>
          </header>
          {timeline.error ? (
            <p className="home-status" role="status">
              {timeline.data
                ? "Showing your last saved milestone view. "
                : "Milestones unavailable. "}
              <button onClick={timeline.refresh}>Reload milestones</button>
            </p>
          ) : null}
          {images.error ? (
            <p className="home-status" role="status">
              Race images unavailable; saved milestone facts remain visible.{" "}
              <button onClick={images.refresh}>Retry images</button>
            </p>
          ) : null}
          <div className="hybrid-timeline achievements-timeline">
            {journey.highlights.length ? (
              <MilestoneStops
                entries={journey.highlights}
                nextId={next?.id}
                state={images.data?.state}
                onSelect={setSelection}
              />
            ) : (
              <p role="status">
                {timeline.data
                  ? "No visible milestones yet."
                  : "Loading milestones…"}
              </p>
            )}
          </div>
          {journey.ordered.length > 4 ? (
            <button
              className="text-link home-view-all"
              onClick={() => setAll(true)}
            >
              View all milestones ({journey.ordered.length})
              <Icon name="arrow" />
            </button>
          ) : null}
        </section>
        <section
          className="training-pair"
          aria-label="Last run and next planned session"
        >
          <HomeTrainingCard
            title="Last run"
            kind="last"
            section={training.data?.lastRun}
            error={training.errors.lastRun}
            refresh={training.refresh}
          />
          <HomeTrainingCard
            title="Next in your plan"
            kind="next"
            section={training.data?.nextSession}
            error={training.errors.nextSession}
            refresh={training.refresh}
          />
        </section>
      </main>
      <NativeModal open={!!reviewCandidate} titleId="milestone-review-title" onClose={()=>void decideReview("deferred")} busy={reviewBusy} returnFocusRef={reviewReturnFocus} className="app-dialog milestone-review-dialog">
        {reviewCandidate && activeReview ? <>
          <p className="overline">Milestone check · {reviewGroupCount} {reviewGroupCount===1?"race review":"race reviews"}</p>
          <h2 id="milestone-review-title">Review a possible completed milestone</h2>
          <p className="milestone-review-outcome">{activeReview.assessment.performance==="achieved"?"Congratulations—your result appears to meet this target.":activeReview.assessment.performance==="missed"?"You completed the race. Review the target result.":"Review your race result"}</p>
          <p>We found a possible race match. Confirm the race identity to record completion; the result comparison below is based only on saved facts.</p>
          <section className="milestone-review-summary" aria-label="Race and target comparison">
            <h3>{activeReview.target.eventName||activeReview.target.title}</h3>
            <p>Milestone date · {formatCoachingDate(activeReview.target.date,timezone)}</p>
            <p>Target · {formatDistance(activeReview.target.distanceMeters)} · {reviewTargetLabel}</p>
            <h4>{activeReview.achievement.title}</h4>
            <p>{officialFacts?"Confirmed official result facts":"Saved historical facts (legacy basis)"}</p>
            <dl>
              <div><dt>Race date</dt><dd>{resultFacts?.raceDate?formatCoachingDate(resultFacts.raceDate,timezone):"Not recorded"}</dd></div>
              <div><dt>Official distance</dt><dd>{resultFacts?.distanceMeters?formatDistance(resultFacts.distanceMeters):"Not recorded"}</dd></div>
              <div><dt>Elapsed result</dt><dd>{resultFacts?.elapsedTimeSeconds?formatDuration(resultFacts.elapsedTimeSeconds):"Not recorded"}</dd></div>
              <div><dt>Achievement claim</dt><dd>{activeReview.achievement.achievement==="personal_best"?"Personal best":activeReview.achievement.achievement==="goal_achieved"?"Goal achieved":"Race result"}</dd></div>
            </dl>
            <p className="milestone-review-outcome">{reviewOutcome}</p>
            {reviewDifference!==undefined?<p>{formatDuration(Math.abs(reviewDifference))} {reviewDifference<0?"faster":"slower"} than the target time.</p>:null}
            {activeReview.assessment.assessmentReasons.map((reason:string)=><p key={reason}>{reason}</p>)}
          </section>
          {reviewCandidate.ambiguous?<fieldset className="milestone-review-choices"><legend>Choose the result that belongs to this race</legend>
            {reviewOptions.map((candidate:any)=><label key={candidate.achievement.id}><input type="radio" name="milestone-review-result" checked={selectedReviewId===candidate.achievement.id} onChange={()=>setSelectedReviewId(candidate.achievement.id)} />{candidate.achievement.title} · {candidate.achievement.officialResult?.elapsedTimeSeconds?formatDuration(candidate.achievement.officialResult.elapsedTimeSeconds):candidate.achievement.elapsedTimeSeconds?formatDuration(candidate.achievement.elapsedTimeSeconds):"Time not recorded"}</label>)}
          </fieldset>:null}
          {reviewGroupCount>1?<p>{reviewGroupCount-1} other race {reviewGroupCount-1===1?"review":"reviews"} will follow.</p>:null}
          <div className="road-form-actions">
            <button className="button button-primary" disabled={reviewBusy||!!reviewCandidate.ambiguous&&!selectedReview} onClick={()=>void decideReview("confirm")}>Confirm result and complete milestone</button>
            <button className="button button-secondary" disabled={reviewBusy} onClick={()=>void decideReview("deferred")}>Later</button>
            <button className="text-link" disabled={reviewBusy} onClick={()=>void decideReview("rejected")}>Not this race</button>
            <Link className="text-link" href={`/dashboard/settings?section=milestones&milestone=${encodeURIComponent(reviewCandidate.target.id)}`}>Review or correct result</Link>
          </div>
        </>:null}
      </NativeModal>
      <NativeModal
        open={!!selection}
        titleId="home-milestone-title"
        onClose={() => setSelection(null)}
        className="app-dialog"
      >
        <button
          className="close"
          onClick={() => setSelection(null)}
          aria-label="Close milestone details"
        >
          ×
        </button>
        <h2 id="home-milestone-title">{selection?.title}</h2>
        {selection ? (
          <>
            <MilestoneMark entry={selection} state={images.data?.state} />
            <p>{entryStatus(selection)}</p>
            {selection.date ? (
              <p>{formatCoachingDate(selection.date, timezone)}</p>
            ) : null}
            <p>
              {milestoneResultDistance(selection)
                ? formatDistance(milestoneResultDistance(selection)!)
                : selection.target
                  ? formatDistance(selection.target.distanceMeters)
                  : "Distance not recorded"}
            </p>
            <p>
              {milestoneResultTime(selection)
                ? `Recorded ${formatDuration(milestoneResultTime(selection)!)}`
                : selection.target
                  ? entryTargetLabel(selection)
                  : "Result time not recorded"}
            </p>
            {selection.target && selection.achievement ? <p>Original target: {entryTargetLabel(selection)}</p> : null}
            {selection.timeDifferenceSeconds !== undefined ? <p>{Math.abs(selection.timeDifferenceSeconds)} seconds {selection.timeDifferenceSeconds < 0 ? "under" : "over"} target</p> : null}
            {selection.assessmentReasons?.map(reason => <p key={reason}>{reason}</p>)}
            {selection.target && selection.target.date <= today ? <Link className="button" href={`/dashboard/settings?section=milestones&milestone=${encodeURIComponent(selection.target.id)}`}>Record or align result</Link> : null}
            {selection.target?.mainGoal ? (
              <Link className="text-link" href="/dashboard/plan">
                View approved Plan →
              </Link>
            ) : null}
          </>
        ) : null}
        <button className="button" onClick={() => setSelection(null)}>
          Back to Home
        </button>
      </NativeModal>
      <NativeModal
        open={all}
        titleId="all-home-milestones"
        onClose={() => setAll(false)}
        className="app-dialog home-all-milestones"
      >
        <button
          className="close"
          onClick={() => setAll(false)}
          aria-label="Close all milestones"
        >
          ×
        </button>
        <h2 id="all-home-milestones">All milestones</h2>
        {all ? <MilestoneStops
          entries={journey.ordered}
          nextId={next?.id}
          state={images.data?.state}
          onSelect={(entry) => {
            setAll(false);
            setSelection(entry);
          }}
        /> : null}
        <button className="button" onClick={() => setAll(false)}>
          Back to Home
        </button>
      </NativeModal>
    </div>
  );
}
function HomeTrainingCard({
  title,
  kind,
  section,
  error,
  refresh,
}: {
  title: string;
  kind: "last" | "next";
  section?: TrainingSection;
  error: boolean;
  refresh: () => void;
}) {
  const item = section?.status === "ready" ? section.item : null,
    fullDate = item?.date
      ? dateLabel(item.date, "UTC", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : undefined;
  const href = item
    ? kind === "last"
      ? `/dashboard/activities?activityId=${encodeURIComponent(item.id)}&returnTo=%2Fdashboard`
      : `/dashboard/calendar?date=${item.date}&session=${encodeURIComponent(item.id)}`
    : kind === "last"
      ? "/dashboard/activities"
      : "/dashboard/calendar";
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !item ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const context = createRecoveryContext({
      kind: "home",
      path: "/dashboard",
      activityId: kind === "last" ? item.id : undefined,
      scrollY: window.scrollY,
      focusKey: `home-${kind}-action`,
    });
    event.preventDefault();
    window.location.assign(
      `${href}&recovery=${encodeURIComponent(context.id)}`,
    );
  }
  return (
    <article
      className={`training-summary training-summary--${kind}`}
      aria-labelledby={`home-${kind}-heading`}
    >
      <time
        className="training-date"
        dateTime={item?.date ?? undefined}
        aria-label={fullDate}
      >
        <span>
          {item?.date
            ? dateLabel(item.date, "UTC", { weekday: "short" }).toUpperCase()
            : "—"}
        </span>
        <strong>
          {item?.date ? dateLabel(item.date, "UTC", { day: "2-digit" }) : "—"}
        </strong>
      </time>
      <div className="training-copy">
        <h2 className="training-label" id={`home-${kind}-heading`}>
          {title}
        </h2>
        <h3>
          {item?.title ??
            (!section && !error
              ? "Loading…"
              : section?.status === "empty"
                ? kind === "last"
                  ? "No recorded runs yet"
                  : "No upcoming run in your plan"
                : "Training summary unavailable")}
        </h3>
        {item && !item.date ? <p className="home-status">Recorded date unavailable</p> : null}
        {item ? (
          <p className="training-metrics">
            {item.detail.split(" · ").map((text, index) => (
              <Fragment key={index}>
                {index > 0 ? <span aria-hidden="true">·</span> : null}
                <span>{text}</span>
              </Fragment>
            ))}
          </p>
        ) : null}
        {error ? (
          <p className="home-status" role="status">
            {item ? "Showing last loaded details. " : ""}
            <button onClick={refresh}>Retry summary</button>
          </p>
        ) : null}
      </div>
      <Link
        id={`home-${kind}-action`}
        className="text-link training-link"
        href={href}
        onClick={open}
      >
        {item
          ? kind === "last"
            ? "View run"
            : "View session"
          : kind === "last"
            ? "Open Training"
            : "Open Calendar"}
        <Icon name="arrow" />
      </Link>
    </article>
  );
}

