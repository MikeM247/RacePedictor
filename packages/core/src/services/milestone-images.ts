import {
  emptyImageState,
  milestoneImageCatalogue,
  type ImageChoice,
  type ImageState,
} from "../contracts/milestone-images.ts";
import type {
  MilestoneEntry,
  MilestoneSource,
} from "../contracts/milestone-timeline.ts";
export const imageSourceKey = (s: MilestoneSource) => `${s.kind}:${s.id}`;
export const sameImageChoice = (a: ImageChoice | null, b: ImageChoice | null) =>
  JSON.stringify(a) === JSON.stringify(b);
export function imageEntrySources(
  entry: Pick<MilestoneEntry, "sources"> &
    Partial<Pick<MilestoneEntry, "target">>,
) {
  return [
    ...entry.sources,
    ...(entry.target?.aliases ?? []).map((id) => ({
      kind: "target" as const,
      id,
    })),
  ].filter(
    (s, i, all) =>
      all.findIndex((x) => imageSourceKey(x) === imageSourceKey(s)) === i,
  );
}
export function entryImage(
  state: ImageState | undefined,
  entry: Pick<MilestoneEntry, "sources"> &
    Partial<Pick<MilestoneEntry, "target">>,
) {
  const bindings = (state ?? emptyImageState()).bindings.filter((b) =>
    imageEntrySources(entry).some(
      (s) => imageSourceKey(s) === imageSourceKey(b.source),
    ),
  );
  const explicit = bindings.filter((b) => b.choice);
  const choices = explicit.map((b) => b.choice!);
  const conflict = choices.some((c) => !sameImageChoice(c, choices[0]));
  const chosen = explicit[0] ?? bindings.find((b) => b.defaultCatalogueId);
  const choice =
    chosen?.choice ??
    (chosen?.defaultCatalogueId
      ? { kind: "catalogue" as const, id: chosen.defaultCatalogueId }
      : null);
  return {
    choice: conflict ? null : choice,
    conflict,
    label: chosen?.label,
    url:
      conflict || !choice
        ? null
        : choice.kind === "catalogue"
          ? milestoneImageCatalogue.find((x) => x.id === choice.id)!.url
          : `/api/v1/coaching/milestone-images/assets/${choice.id}`,
  };
}
export function assignEntryImage(
  state: ImageState,
  sources: MilestoneSource[],
  choice: ImageChoice | null,
  label?: string,
): ImageState {
  const keys = new Set(sources.map(imageSourceKey));
  return {
    ...state,
    bindings: [
      ...state.bindings.filter((b) => !keys.has(imageSourceKey(b.source))),
      ...sources.map((source) => {
        const old = state.bindings.find(
          (b) => imageSourceKey(b.source) === imageSourceKey(source),
        );
        return {
          source,
          choice,
          label,
          defaultCatalogueId:
            old?.defaultCatalogueId ??
            (choice?.kind === "catalogue" ? choice.id : undefined),
        };
      }),
    ],
  };
}
export class MilestoneImageConflict extends Error {}
export function reconcileEntryImages(
  state: ImageState,
  revision: number,
  timeline: Pick<
    import("../contracts/milestone-timeline.ts").MilestoneTimeline,
    "entries"
  >,
  change: import("../contracts/milestone-timeline.ts").MilestoneMutation,
) {
  if (change.operation !== "link" && change.operation !== "unlink")
    return state;
  const entry = timeline.entries.find((e) => e.id === change.entryId);
  if (!entry) return state;
  const other =
    change.operation === "link"
      ? timeline.entries.find((e) => e.achievement?.id === change.achievementId)
      : undefined;
  const sources = [
    ...imageEntrySources(entry),
    ...(other ? imageEntrySources(other) : []),
  ].filter(
    (s, i, all) =>
      all.findIndex((x) => imageSourceKey(x) === imageSourceKey(s)) === i,
  );
  const first = entryImage(state, entry),
    second = other ? entryImage(state, other) : null;
  if (
    change.imageResolution &&
    change.imageResolution.expectedRevision !== revision
  )
    throw new MilestoneImageConflict(
      "Images changed. Reload and review before linking.",
    );
  const conflict =
    first.conflict ||
    second?.conflict ||
    (first.choice &&
      second?.choice &&
      !sameImageChoice(first.choice, second.choice));
  if (conflict && !change.imageResolution)
    throw new MilestoneImageConflict(
      "These entries have different images. Choose which image to keep before linking.",
    );
  const choice = change.imageResolution
    ? change.imageResolution.choice
    : (first.choice ?? second?.choice ?? null);
  if (
    !choice &&
    !state.bindings.some((b) =>
      sources.some((s) => imageSourceKey(s) === imageSourceKey(b.source)),
    )
  )
    return state;
  return assignEntryImage(state, sources, choice, first.label ?? second?.label);
}
/** References retained by a hidden row are editable only while their source still exists. */
export function verifiedImageSourceKeys(
  timeline: import("../contracts/milestone-timeline.ts").MilestoneTimeline,
) {
  const sources = [
    ...timeline.history.map((r) => ({
      kind: "achievement" as const,
      id: r.id,
    })),
    ...timeline.entries.flatMap(imageEntrySources),
    ...(timeline.context?.milestones ?? []).map((t) => ({
      kind: "target" as const,
      id: t.id,
    })),
    ...(timeline.context?.goal
      ? [{ kind: "target" as const, id: timeline.context.goal.id }]
      : []),
  ];
  return new Set(sources.map(imageSourceKey));
}
