"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NativeModal } from "../coaching/native-modal";
import type { RaceHistoryRecord } from "../../../../packages/core/src/contracts/race-history.ts";
import type {
  GoalContextRouteData,
  RaceMilestone,
} from "../../../../packages/core/src/contracts/coaching.ts";
import type {
  MilestoneEntry,
  MilestoneMutation,
  MilestoneTimeline,
} from "../../../../packages/core/src/contracts/milestone-timeline.ts";
import {
  buildRaceJourney,
  type JourneyTarget,
} from "../../../../packages/core/src/services/race-journey.ts";
import type { MilestoneChangeRequest } from "../../../../packages/core/src/services/milestone-management.ts";
import {
  discardMilestoneChange,
  readMilestoneChange,
} from "../../lib/milestone-change-storage.ts";
import {
  changeMilestoneTimeline,
  loadMilestoneTimeline,
  MilestoneTimelineWriteError,
} from "../../lib/milestone-timeline-client.ts";
import { formatDistance, formatDuration } from "../../lib/activity-formatters";
import { formatCoachingDate } from "../../lib/coaching-ui-state";
import { MilestoneAchievementEditor } from "./milestone-achievement-editor";
import {
  MilestoneTargetForm,
  PreparedMilestoneChange,
} from "./milestone-plan-update";
type View =
  | "choose"
  | "achievement"
  | "target"
  | "remove"
  | "link"
  | "unlink"
  | null;
export function milestoneStatus(entry: MilestoneEntry) {
  if (entry.completion !== "completed")
    return entry.completion === "upcoming" ? "Upcoming" : "Result pending";
  return `Completed${entry.performance === "achieved" ? " · Target achieved" : entry.performance === "missed" ? " · Target missed" : entry.performance === "unassessed" ? " · Target unassessed" : ""}`;
}
export function MilestoneManager({
  timeline,
  unavailable,
  onChange,
  onSaved,
  renderImageControl,
  imageLinkResolution,
  renderLinkImageResolution,
}: {
  renderLinkImageResolution?: (
    entry: MilestoneEntry,
    achievementId: string,
  ) => ReactNode;
  renderImageControl?: (entry: MilestoneEntry) => ReactNode;
  imageLinkResolution?: (
    entry: MilestoneEntry,
    achievementId: string,
  ) => MilestoneMutation["imageResolution"] | false;
  timeline: MilestoneTimeline;
  unavailable: boolean;
  onChange: () => void;
  onSaved: (view: MilestoneTimeline) => void;
}) {
  const { context, history, today } = timeline;
  const timezone = context?.plan?.timezone ?? "Africa/Johannesburg";
  const targets = buildRaceJourney(context, [], today).ahead;
  const [tab, setTab] = useState<"achievements" | "targets" | "removed">(
    "achievements",
  );
  const [view, setView] = useState<View>(null);
  const [record, setRecord] = useState<RaceHistoryRecord>();
  const [initialTarget, setInitialTarget] = useState<JourneyTarget>();
  const [target, setTarget] = useState<RaceMilestone>();
  const [targetContext, setTargetContext] =
    useState<GoalContextRouteData | null>(null);
  const [selection, setSelection] = useState<MilestoneEntry>();
  const [base, setBase] = useState(timeline);
  const [assign, setAssign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [linkId, setLinkId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [undo, setUndo] = useState<{
    id: string;
    base: MilestoneTimeline;
  } | null>(null);
  const [prepared, setPrepared] = useState<MilestoneChangeRequest | null>(null);
  const writeGuard = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const canPrepare =
    !unavailable &&
    context?.state === "ready" &&
    context.goal?.target.kind === "performance";
  const achievements = timeline.entries.filter((entry) => entry.achievement);
  const ahead = timeline.entries.filter(
    (entry) => !entry.achievement && !entry.target?.mainGoal,
  );
  useEffect(() => {
    if (!context?.goal) {
      setPrepared(null);
      return;
    }
    try {
      setPrepared(
        readMilestoneChange(window.sessionStorage, context.goal.athleteId),
      );
    } catch {
      setMessage(
        "A prepared request could not be read. Review or discard it in Plan.",
      );
    }
  }, [context]);
  function reset() {
    setError("");
    setConflict(false);
    setConfirmed(false);
    setLinkId("");
  }
  function close() {
    if (!writeGuard.current) {
      setView(null);
      reset();
    }
  }
  function onBusy(value: boolean) {
    writeGuard.current = value;
    setBusy(value);
  }
  function editAchievement(
    item?: RaceHistoryRecord,
    assigning = false,
    raceTarget?: JourneyTarget,
  ) {
    reset();
    setRecord(item);
    setAssign(assigning);
    setInitialTarget(raceTarget);
    setView("achievement");
  }
  function editTarget(item?: RaceMilestone) {
    reset();
    setTarget(item);
    setTargetContext(context);
    setView("target");
  }
  function openEntry(action: View, entry: MilestoneEntry) {
    reset();
    setSelection(entry);
    setBase(timeline);
    setView(action);
  }
  function finished(text: string) {
    setView(null);
    reset();
    setMessage(text);
    onChange();
    requestAnimationFrame(() => addButton.current?.focus());
  }
  function preparedChange(request: MilestoneChangeRequest) {
    setPrepared(request);
    finished(
      "Target change prepared. Review and approve the replacement plan before it becomes live.",
    );
  }
  function discard() {
    if (!context?.goal) return;
    try {
      discardMilestoneChange(window.sessionStorage, context.goal.athleteId);
      setPrepared(null);
      setMessage("Prepared request discarded.");
    } catch {
      setMessage(
        "The prepared request could not be discarded. Allow session storage and retry.",
      );
    }
  }
  async function mutate(
    operation: MilestoneMutation["operation"],
    entryId: string,
    source = base,
  ) {
    if (writeGuard.current || conflict || unavailable) return;
    onBusy(true);
    setError("");
    try {
      const resolution =
        operation === "link"
          ? imageLinkResolution?.(selection!, linkId)
          : undefined;
      if (resolution === false) {
        setError("Choose which image to keep before linking these entries.");
        return;
      }
      const next = await changeMilestoneTimeline({
        ...(resolution ? { imageResolution: resolution } : {}),
        operation,
        entryId,
        expectedRevision: source.revision,
        sourceVersion: source.sourceVersion,
        ...(operation === "link"
          ? { achievementId: linkId, confirmedSameRace: true as const }
          : {}),
      });
      onSaved(next);
      if (operation === "remove") {
        const removal = next.removed.find(
          (item) => !source.removed.some((old) => old.id === item.id),
        );
        setUndo(removal ? { id: removal.id, base: next } : null);
      } else setUndo(null);
      finished(
        operation === "remove"
          ? "Removed from milestones. Your plan, activities and race results are kept."
          : operation === "restore"
            ? "Milestone restored."
            : operation === "link"
              ? "Race and achievement linked. Home shows this race once."
              : "Race link removed. Saved race facts are kept.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The milestone change could not be verified.",
      );
      if (
        !(cause instanceof MilestoneTimelineWriteError) ||
        cause.reloadRequired
      ) {
        setConflict(true);
        onChange();
      }
    } finally {
      onBusy(false);
    }
  }
  async function reload() {
    if (writeGuard.current) return;
    onBusy(true);
    try {
      const latest = await loadMilestoneTimeline(true);
      onSaved(latest);
      setBase(latest);
      setConfirmed(false);
      setUndo(null);
      const entry = selection
        ? latest.entries.find((item) => item.id === selection.id)
        : undefined;
      if (selection && !entry) {
        setView(null);
        setMessage(
          "Saved milestones reloaded. Review the current list before deciding again.",
        );
      } else if (entry) setSelection(entry);
      setConflict(false);
      setError("");
    } catch {
      setError(
        "Saved milestones could not be loaded. Retry before deciding again.",
      );
    } finally {
      onBusy(false);
    }
  }
  const title =
    view === "choose"
      ? "Add milestone"
      : view === "remove"
        ? "Remove from milestones?"
        : view === "link"
          ? "Link to existing achievement"
          : view === "unlink"
            ? "Unlink race and achievement?"
            : view === "target"
              ? target
                ? "Propose target change"
                : "Add race target"
              : record
                ? "Edit milestone"
                : "Add achieved milestone";
  const visibleEntries =
    tab === "achievements"
      ? achievements
      : tab === "targets"
        ? ahead
        : timeline.removed;
  const linkRecord = history.find((item) => item.id === linkId);
  const knownFactsDiffer = Boolean(
    selection?.target &&
      linkRecord &&
      ((linkRecord.raceDate && linkRecord.raceDate !== selection.target.date) ||
        (linkRecord.distanceMeters !== undefined &&
          Math.abs(
            linkRecord.distanceMeters - selection.target.distanceMeters,
          ) > 1)),
  );
  return (
    <div className="milestone-manager">
      <div className="milestone-manager-toolbar">
        <p>Settings controls the milestones shown on Home.</p>
        <button
          ref={addButton}
          className="button button-primary"
          type="button"
          disabled={unavailable}
          onClick={() => {
            reset();
            setView("choose");
          }}
        >
          Add milestone
        </button>
      </div>
      <div
        className="milestone-tabs"
        role="group"
        aria-label="Milestone category"
      >
        <button
          className="text-link"
          aria-pressed={tab === "achievements"}
          onClick={() => setTab("achievements")}
        >
          Achievements ({achievements.length})
        </button>
        <button
          className="text-link"
          aria-pressed={tab === "targets"}
          onClick={() => setTab("targets")}
        >
          Race targets ({ahead.length})
        </button>
        <button
          className="text-link"
          aria-pressed={tab === "removed"}
          onClick={() => setTab("removed")}
        >
          Removed milestones ({timeline.removed.length})
        </button>
      </div>
      {tab === "targets" ? (
        <p className="quiet-copy">
          Remove a race from the timeline immediately. Additions and changes to
          target dates or times require plan review and approval.
        </p>
      ) : null}
      {visibleEntries.length ? (
        <ul className="milestone-records">
          {visibleEntries.map((entry) => (
            <li key={entry.id}>
              <div className="milestone-record-heading">
                <h3>{entry.title}</h3>
                <span className="milestone-state">
                  {tab === "removed"
                    ? "Removed from timeline"
                    : milestoneStatus(entry)}
                </span>
              </div>
              <p>
                {entry.date
                  ? formatCoachingDate(entry.date, timezone)
                  : "Date not set"}
                {entry.achievement?.distanceMeters ||
                entry.target?.distanceMeters
                  ? ` · ${formatDistance(entry.achievement?.distanceMeters ?? entry.target!.distanceMeters)}`
                  : ""}
                {entry.achievement?.elapsedTimeSeconds
                  ? ` · ${formatDuration(entry.achievement.elapsedTimeSeconds)}`
                  : entry.target?.targetTimeSeconds
                    ? ` · Target ${formatDuration(entry.target.targetTimeSeconds)}`
                    : ""}
              </p>
              {renderImageControl?.(entry)}
              <div className="milestone-actions">
                {tab === "removed" ? (
                  <button
                    className="text-link"
                    disabled={busy || unavailable || conflict}
                    onClick={() => void mutate("restore", entry.id, timeline)}
                  >
                    Restore<span className="sr-only"> {entry.title}</span>
                  </button>
                ) : (
                  <>
                    {entry.achievement ? (
                      <>
                        <button
                          className="text-link"
                          disabled={unavailable}
                          onClick={() => editAchievement(entry.achievement)}
                          aria-label={`Edit ${entry.title}`}
                        >
                          Edit
                        </button>
                        <button
                          className="text-link"
                          disabled={unavailable}
                          onClick={() =>
                            editAchievement(entry.achievement, true)
                          }
                        >
                          {entry.achievement.activityId
                            ? "Change race"
                            : "Assign race"}
                          <span className="sr-only"> for {entry.title}</span>
                        </button>
                        {entry.sources.some(
                          (source) => source.kind === "target",
                        ) ? (
                          <button
                            className="text-link"
                            disabled={unavailable}
                            onClick={() => openEntry("unlink", entry)}
                          >
                            Unlink approved race
                            <span className="sr-only"> {entry.title}</span>
                          </button>
                        ) : null}
                      </>
                    ) : entry.target ? (
                      <>
                        {entry.target.date <= today ? (
                          <button
                            className="text-link"
                            disabled={unavailable}
                            onClick={() =>
                              editAchievement(undefined, true, entry.target)
                            }
                          >
                            Record result
                            <span className="sr-only"> for {entry.title}</span>
                          </button>
                        ) : null}
                        <button
                          className="text-link"
                          disabled={!canPrepare}
                          onClick={() =>
                            editTarget(
                              context?.milestones?.find(
                                (item) => item.id === entry.target?.id,
                              ),
                            )
                          }
                        >
                          Propose target change
                          <span className="sr-only"> for {entry.title}</span>
                        </button>
                        <button
                          className="text-link"
                          disabled={unavailable || achievements.length === 0}
                          onClick={() => openEntry("link", entry)}
                        >
                          Link to existing achievement
                          <span className="sr-only"> for {entry.title}</span>
                        </button>
                      </>
                    ) : null}
                    <button
                      className="text-link milestone-remove"
                      disabled={unavailable}
                      onClick={() => openEntry("remove", entry)}
                      aria-label={`Remove ${entry.title} from milestones`}
                    >
                      Remove from milestones
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {tab === "removed"
            ? "No removed milestones."
            : tab === "targets"
              ? "No remaining intermediate race targets in your approved plan."
              : "No achievements yet. Add a milestone to record your story so far."}
        </p>
      )}
      {prepared ? (
        <PreparedMilestoneChange request={prepared} onDiscard={discard} />
      ) : null}
      {message ? (
        <p role="status" className="milestone-feedback">
          {message}
        </p>
      ) : null}
      {undo ? (
        <button
          className="text-link"
          disabled={busy || conflict || unavailable}
          onClick={() => void mutate("restore", undo.id, undo.base)}
        >
          Undo removal
        </button>
      ) : null}
      {!view && error ? <p role="alert">{error}</p> : null}
      {!view && conflict ? (
        <button
          className="text-link"
          disabled={busy}
          onClick={() => void reload()}
        >
          Reload saved milestones
        </button>
      ) : null}
      <NativeModal
        open={view !== null}
        titleId="milestone-dialog-heading"
        onClose={close}
        busy={busy}
        className="road-history-dialog milestone-dialog"
      >
        <header className="road-dialog-heading">
          <h2 id="milestone-dialog-heading">{title}</h2>
          <button
            className="road-close"
            aria-label="Close milestone dialog"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </header>
        {view === "choose" ? (
          <div className="milestone-type-choice">
            <p>Choose what this milestone represents.</p>
            <button
              className="button button-secondary"
              onClick={() => editAchievement()}
            >
              Achieved milestone
            </button>
            <button
              className="button button-secondary"
              disabled={!canPrepare}
              onClick={() => editTarget()}
            >
              Planned race target
            </button>
            <p className="quiet-copy">
              New planned targets require plan review and approval.
            </p>
          </div>
        ) : null}
        {view === "achievement" ? (
          <MilestoneAchievementEditor
            record={record}
            initialTarget={initialTarget}
            assignRace={assign}
            targets={targets}
            history={history}
            timezone={timezone}
            onSaved={finished}
            onCancel={close}
            onBusy={onBusy}
            onRefresh={onChange}
          />
        ) : null}
        {view === "target" && targetContext ? (
          <MilestoneTargetForm
            context={targetContext}
            latestContext={context}
            target={target}
            onPrepared={preparedChange}
            onCancel={close}
          />
        ) : null}
        {view === "remove" && selection ? (
          <>
            <p>
              Remove “{selection.title}” from your milestones? Its approved
              plan, recorded activity and saved result will stay intact. You can
              restore it in Settings.
            </p>
            <div className="road-form-actions">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={close}
              >
                Keep milestone
              </button>
              <button
                className="button button-primary"
                disabled={busy || conflict || unavailable}
                onClick={() => void mutate("remove", selection.id)}
              >
                Remove from milestones
              </button>
            </div>
          </>
        ) : null}
        {view === "link" && selection ? (
          <>
            <p>
              Connect “{selection.title}” to the saved achievement for this same
              race. This does not change its official result or award a time
              goal.
            </p>
            <label>
              Existing achievement
              <select
                value={linkId}
                onChange={(event) => {
                  setLinkId(event.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">Choose an achievement</option>
                {achievements.map((entry) => (
                  <option key={entry.id} value={entry.achievement!.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="road-confirmation">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I confirm these entries represent the same race.
            </label>
            <div className="road-form-actions">
              <button
                className="button button-primary"
                disabled={
                  busy || conflict || !confirmed || !linkId || unavailable
                }
                onClick={() => void mutate("link", selection.id)}
              >
                Link race and achievement
              </button>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
            </div>
          </>
        ) : null}
        {view === "link" && selection && linkId
          ? renderLinkImageResolution?.(selection, linkId)
          : null}
        {view === "link" && knownFactsDiffer ? (
          <p className="milestone-notice">
            The saved date or distance differs from the approved target. Linking
            confirms race identity only; the time target remains unassessed
            until the result facts are verified.
          </p>
        ) : null}
        {view === "unlink" && selection ? (
          <>
            <p>
              Separate this achievement from its approved race target? Saved
              results remain intact; the target can return to Ahead.
            </p>
            <div className="road-form-actions">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={close}
              >
                Keep link
              </button>
              <button
                className="button button-primary"
                disabled={busy || conflict || unavailable}
                onClick={() => void mutate("unlink", selection.id)}
              >
                Unlink race and achievement
              </button>
            </div>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="milestone-error">
            {error}
          </p>
        ) : null}
        {conflict ? (
          <button
            className="text-link"
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload saved milestones
          </button>
        ) : null}
      </NativeModal>
    </div>
  );
}
