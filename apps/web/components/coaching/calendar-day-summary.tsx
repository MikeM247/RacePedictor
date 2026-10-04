import type { MouseEvent } from "react";
import type { CalendarActivityView, CalendarSessionView } from "../../lib/coaching-ui-state";
import { formatSessionTarget } from "../../lib/coaching-ui-state";
import { formatDistance, formatDuration } from "../../lib/activity-formatters";
import { relativeCalendarLabel } from "../../lib/calendar-display";

export function CalendarDaySummary({ date, today, planned, recorded, activitiesUnavailable, onOpen }: {
  date: string;
  today: string;
  planned: CalendarSessionView[];
  recorded: CalendarActivityView[];
  activitiesUnavailable: boolean;
  onOpen: (kind: "session" | "activity", id: string, date: string, launcher: HTMLButtonElement) => void;
}) {
  const open = (kind: "session" | "activity", id: string) => (event: MouseEvent<HTMLButtonElement>) => onOpen(kind, id, date, event.currentTarget);
  return <section className="calendar-day-summary" aria-label={`Agenda for ${date}`}>
    <h2><time dateTime={date}>{relativeCalendarLabel(date, today)}</time></h2>
    {planned.map((session) => <article className={`calendar-agenda-entry calendar-agenda-entry--planned${session.kind === "rest" ? " calendar-agenda-entry--rest" : ""}`} key={`session-${session.id}`}>
      <p className="eyebrow">Planned{session.status === "skipped" ? " · skipped" : session.amendments.length ? " · adjusted" : ""}</p>
      <h3>{session.title}</h3>
      {session.kind !== "rest" ? <p className="metadata">{formatSessionTarget(session)}</p> : null}
      <p>{session.purpose || "Purpose not supplied."}</p>
      {session.warnings.map((warning) => <p className="calendar-entry-warning" key={warning}>{warning}</p>)}
      <button className="text-link" type="button" aria-label={`View planned session: ${session.title}`} onClick={open("session", session.id)}>View planned session →</button>
    </article>)}
    {recorded.map((activity) => <article className="calendar-agenda-entry calendar-agenda-entry--recorded" key={`activity-${activity.id}`}>
      <p className="eyebrow">Recorded{date > today ? " · future-dated record" : ""}</p>
      <h3>{activity.title}</h3>
      <p className="metadata">{formatDistance(activity.distanceMeters)} · {formatDuration(activity.elapsedTimeSeconds)} elapsed</p>
      <button className="text-link" type="button" aria-label={`View activity: ${activity.title}`} onClick={open("activity", activity.id)}>View activity →</button>
    </article>)}
    {planned.length === 0 ? <p className="quiet-copy">No planned session for this date.</p> : null}
    {activitiesUnavailable ? <p className="calendar-entry-warning" role="status">Recorded activities could not be loaded. Retry Calendar to check.</p> : recorded.length === 0 && planned.length === 0 ? <p className="quiet-copy">No recorded activity.</p> : null}
    {planned.length > 0 && recorded.length > 0 ? <p className="calendar-match-limit">Sharing a date does not confirm a plan link or completion.</p> : null}
  </section>;
}
