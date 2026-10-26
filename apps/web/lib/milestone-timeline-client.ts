import { milestoneTimelineResponseSchema, type MilestoneMutation, type MilestoneTimeline } from "../../../packages/core/src/contracts/milestone-timeline.ts";

export class MilestoneTimelineWriteError extends Error {
  readonly reloadRequired: boolean;
  constructor(message: string, reloadRequired: boolean) { super(message); this.reloadRequired = reloadRequired; }
}
export async function loadMilestoneTimeline(includeRemoved = false, signal?: AbortSignal): Promise<MilestoneTimeline> {
  const response = await fetch(`/api/v1/coaching/milestones${includeRemoved ? "?includeRemoved=true" : ""}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Milestone access is unavailable." : "Milestones could not be refreshed.");
  const view = milestoneTimelineResponseSchema.parse(await response.json()).data;
  if (!view.availability.goal || !view.availability.history) throw new Error("Milestone sources are temporarily unavailable.");
  return view;
}
export async function changeMilestoneTimeline(change: MilestoneMutation): Promise<MilestoneTimeline> {
  let response: Response;
  try {
    response = await fetch("/api/v1/coaching/milestones/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
  } catch { throw new MilestoneTimelineWriteError("The save response could not be verified. Reload milestones before trying again.", true); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new MilestoneTimelineWriteError(body?.error?.message ?? "The milestone change could not be saved.", response.status === 409 || response.status >= 500);
  const parsed = milestoneTimelineResponseSchema.safeParse(body);
  if (!parsed.success) throw new MilestoneTimelineWriteError("The save response could not be verified. Reload milestones before trying again.", true);
  window.dispatchEvent(new Event("milestones-changed"));
  return parsed.data.data;
}
