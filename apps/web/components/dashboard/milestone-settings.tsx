"use client";
import Link from "next/link";
import { useState } from "react";
import { useMilestoneTimeline } from "../../lib/use-milestone-timeline.ts";
import { useMilestoneImages } from "../../lib/use-milestone-images.ts";
import { formatCoachingDate } from "../../lib/coaching-ui-state";
import { formatDistance, formatDuration } from "../../lib/activity-formatters";
import { MilestoneManager } from "./milestone-manager";
import { MilestoneImageEditor } from "./milestone-image-editor";
import { useDashboardFeatures } from "./dashboard-feature-context";
import {
  entryImage,
  sameImageChoice,
} from "../../../../packages/core/src/services/milestone-images.ts";
import {
  imageViewSchema,
  type ImageChoice,
} from "../../../../packages/core/src/contracts/milestone-images.ts";
import { milestoneTimelineSchema } from "../../../../packages/core/src/contracts/milestone-timeline.ts";
import type { MilestoneEntry } from "../../../../packages/core/src/contracts/milestone-timeline.ts";
import "./road-to-comrades.css";
import "./milestone-management.css";
import "./milestone-images.css";
export function MilestoneSettings() {
  const { data, error, refresh, accept } = useMilestoneTimeline(true),
    enabled = !!useDashboardFeatures().milestoneHomeEnabled,
    images = useMilestoneImages(enabled);
  const [selection, setSelection] = useState<MilestoneEntry | null>(null),
    [message, setMessage] = useState(""),
    [imageResolution, setImageResolution] = useState<{
      key: string;
      choice: ImageChoice | null;
    } | null>(null),
    [resolving, setResolving] = useState(false);
  const context = data?.context,
    timezone = context?.plan?.timezone ?? "Africa/Johannesburg";
  const current =
    selection && data
      ? [...data.entries, ...data.removed].find((e) => e.id === selection.id)
      : null;
  const primary = data?.entries.find((e) => e.target?.mainGoal);
  function imageControl(entry: MilestoneEntry) {
    if (!enabled) return null;
    const mark = entryImage(images.data?.state, entry);
    return (
      <div className="milestone-image-controls">
        {mark.url ? (
          <img src={mark.url} alt={mark.label ?? ""} width={50} height={50} />
        ) : (
          <span className="milestone-image-placeholder">
            {entry.achievement?.achievement === "personal_best" ? "PB" : "Race"}
          </span>
        )}
        <button
          className="text-link"
          disabled={
            !!error ||
            !!images.error ||
            !images.data ||
            !!images.data.remoteState
          }
          onClick={() => setSelection(entry)}
        >
          Manage image<span className="sr-only"> for {entry.title}</span>
        </button>
      </div>
    );
  }
  function linkChoices(entry: MilestoneEntry, achievementId: string) {
    const other = data?.entries.find(
      (e) => e.achievement?.id === achievementId,
    );
    if (!images.data || !other) return null;
    const first = entryImage(images.data.state, entry),
      second = entryImage(images.data.state, other);
    if (first.conflict || second.conflict)
      return (
        <p role="alert">
          Resolve conflicting image choices using Manage image before linking
          this race.
        </p>
      );
    if (
      !first.choice ||
      !second.choice ||
      sameImageChoice(first.choice, second.choice)
    )
      return null;
    const key = `${entry.id}:${achievementId}`;
    return (
      <fieldset>
        <legend>
          These entries have different images. Choose the image to keep.
        </legend>
        {[
          { label: entry.title, image: first },
          { label: other.title, image: second },
        ].map((x, index) => (
          <label key={index}>
            <input
              type="radio"
              name="link-image"
              checked={
                imageResolution?.key === key &&
                sameImageChoice(imageResolution.choice, x.image.choice)
              }
              onChange={() =>
                setImageResolution({ key, choice: x.image.choice })
              }
            />
            {x.image.url ? (
              <img src={x.image.url} width={44} height={44} alt="" />
            ) : null}
            {x.label}
          </label>
        ))}
      </fieldset>
    );
  }
  async function resolveSync(use: "local" | "remote") {
    if (!images.data || resolving) return;
    setResolving(true);
    try {
      const response = await fetch(
        "/api/v1/coaching/milestone-images/resolve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedRevision: images.data.revision, use }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "Image conflict could not be resolved",
        );
      images.accept(imageViewSchema.parse(body.data));
      setMessage(
        use === "local"
          ? "Local images kept. They will publish on the next sync."
          : "Online images restored.",
      );
      window.dispatchEvent(new Event("milestone-images-changed"));
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Reload images before deciding again.",
      );
    } finally {
      setResolving(false);
    }
  }
  return (
    <section
      id="milestones"
      className="coach-panel settings-panel settings-panel--milestones"
      aria-labelledby="milestone-settings-heading"
    >
      <div className="coach-panel-heading">
        <h2 id="milestone-settings-heading">Milestones</h2>
      </div>
      {error ? (
        <div role="status">
          <p>
            {error}{" "}
            {data
              ? "Showing your last saved milestone view. Reload before making changes."
              : "Your milestone view is unavailable."}
          </p>
          <button className="button button-secondary" onClick={refresh}>
            Reload milestones
          </button>
        </div>
      ) : null}
      {!data && !error ? <p role="status">Loading milestones…</p> : null}
      {context?.goal ? (
        <aside className="milestone-primary-goal">
          <span className="eyebrow">Primary goal · approved plan</span>
          <h3>{context.goal.title}</h3>
          {context.goal.target.kind === "performance" ? (
            <p>
              {formatCoachingDate(context.goal.target.targetDate, timezone)} ·{" "}
              {formatDistance(context.goal.target.distanceMeters)}
              {context.goal.target.targetTimeSeconds
                ? ` · Target ${formatDuration(context.goal.target.targetTimeSeconds)}`
                : ""}
            </p>
          ) : null}
          {primary ? imageControl(primary) : null}
          <Link className="text-link" href="/dashboard/plan">
            View plan →
          </Link>
        </aside>
      ) : null}
      {enabled && images.error ? (
        <p role="status">
          {images.error}
          <button onClick={images.refresh}>Reload images</button>
        </p>
      ) : null}
      {enabled && images.data?.sync === "pending" ? (
        <p role="status">Saved locally · awaiting sync</p>
      ) : null}
      {enabled && images.data?.remoteState ? (
        <div className="milestone-image-sync">
          <h3>Images changed on another device</h3>
          <p>
            Review the local and online choices below, then choose which set to
            keep. This changes milestone images only.
          </p>
          {[...(data?.entries ?? []), ...(data?.removed ?? [])].map((entry) => {
            const local = entryImage(images.data!.state, entry),
              remote = entryImage(images.data!.remoteState!, entry);
            return sameImageChoice(local.choice, remote.choice) ? null : (
              <div key={entry.id}>
                <p>{entry.title}</p>
                <div className="milestone-image-conflict-row">
                  <span>
                    Local{" "}
                    {local.url ? (
                      <img src={local.url} alt="Local image" />
                    ) : (
                      "Default badge"
                    )}
                  </span>
                  <span>
                    Online{" "}
                    {remote.url ? (
                      <img src={remote.url} alt="Online image" />
                    ) : (
                      "Default badge"
                    )}
                  </span>
                </div>
              </div>
            );
          })}
          <button
            disabled={resolving}
            onClick={() => void resolveSync("local")}
          >
            Keep local images and publish
          </button>
          <button
            disabled={resolving}
            onClick={() => void resolveSync("remote")}
          >
            Use online images
          </button>
        </div>
      ) : null}
      {data ? (
        <MilestoneManager
          timeline={data}
          unavailable={!!error}
          onChange={() => {
            refresh();
            images.refresh();
          }}
          onSaved={accept}
          renderImageControl={imageControl}
          renderLinkImageResolution={enabled ? linkChoices : undefined}
          imageLinkResolution={
            enabled
              ? (entry, id) => {
                  if (!images.data || images.error || images.data.remoteState)
                    return false;
                  const other = data.entries.find(
                    (e) => e.achievement?.id === id,
                  );
                  const first = entryImage(images.data.state, entry),
                    second = other
                      ? entryImage(images.data.state, other)
                      : null;
                  if (first.conflict || second?.conflict) return false;
                  const conflict =
                    first.choice &&
                    second?.choice &&
                    !sameImageChoice(first.choice, second.choice);
                  if (conflict && imageResolution?.key !== `${entry.id}:${id}`)
                    return false;
                  return {
                    expectedRevision: images.data.revision,
                    choice: conflict
                      ? imageResolution!.choice
                      : (first.choice ?? second?.choice ?? null),
                  };
                }
              : undefined
          }
        />
      ) : null}
      {selection && current && images.data && !images.error ? (
        <MilestoneImageEditor
          key={selection.id}
          entry={current}
          view={images.data}
          onClose={() => setSelection(null)}
          onSaved={(view) => {
            images.accept(view);
            setSelection(null);
            setMessage(
              view.sync === "pending"
                ? "Saved locally · awaiting sync"
                : "Milestone image saved.",
            );
          }}
          onReload={async () => {
            const [timelineResponse, imageResponse] = await Promise.all([
              fetch("/api/v1/coaching/milestones?includeRemoved=true", {
                cache: "no-store",
              }),
              fetch("/api/v1/coaching/milestone-images", { cache: "no-store" }),
            ]);
            if (!timelineResponse.ok || !imageResponse.ok)
              throw new Error("Reload failed");
            const timelineBody = await timelineResponse.json();
            if (
              ![
                ...timelineBody.data.entries,
                ...timelineBody.data.removed,
              ].some((e: MilestoneEntry) => e.id === selection.id)
            ) {
              setSelection(null);
              setMessage(
                "This milestone changed. Review the saved list before choosing an image.",
              );
            }
            accept(milestoneTimelineSchema.parse(timelineBody.data));
            images.accept(
              imageViewSchema.parse((await imageResponse.json()).data),
            );
          }}
        />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
