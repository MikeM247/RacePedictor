import { goalContextRouteDataSchema } from "../../../packages/core/src/contracts/coaching.ts";
import { composeMilestoneTimeline } from "../../../packages/core/src/services/milestone-timeline.ts";
import { emptyMilestoneState } from "../../../packages/core/src/contracts/milestone-timeline.ts";
import { homeTrainingSchema } from "../../../packages/core/src/contracts/home-training.ts";
import { imageViewSchema } from "../../../packages/core/src/contracts/milestone-images.ts";
export const milestoneHomeContext = goalContextRouteDataSchema.parse({
  state: "ready",
  plan: {
    id: "plan",
    version: 1,
    revision: 1,
    startsOn: "2026-10-01",
    endsOn: "2027-06-13",
    timezone: "Africa/Johannesburg",
    approvalContentHash: "a".repeat(64),
  },
  goal: {
    id: "comrades",
    athleteId: "milestone_qa",
    revision: 1,
    title: "Comrades Sub-11",
    why: "Synthetic visual comparison",
    target: {
      kind: "performance",
      distanceMeters: 89000,
      targetTimeSeconds: 39600,
      targetDate: "2027-06-13",
      eventName: "Comrades Sub-11",
    },
  },
  milestones: [
    {
      id: "oldies",
      title: "Oldies Sub-60",
      eventName: "Oldies 10 km",
      distanceMeters: 10000,
      targetTimeSeconds: 3600,
      targetDate: "2026-11-01",
    },
    {
      id: "marathon",
      title: "Best of the Best Sub-4:20",
      eventName: "Best of the Best Marathon",
      distanceMeters: 42195,
      targetTimeSeconds: 15600,
      targetDate: "2027-03-07",
    },
  ],
  projection: null,
});
export const milestoneHomeHistory = [
  {
    id: "pb",
    title: "21 km PB",
    confirmedBy: "user" as const,
    achievement: "personal_best" as const,
  },
];
export const milestoneHomeTimeline = {
  revision: 0,
  sourceVersion: "fixture",
  today: "2026-10-30",
  context: milestoneHomeContext,
  history: milestoneHomeHistory,
  availability: { goal: true, history: true },
  ...composeMilestoneTimeline(
    milestoneHomeContext,
    milestoneHomeHistory,
    emptyMilestoneState(),
    "2026-10-30",
  ),
};
export const milestoneHomeImages = imageViewSchema.parse({
  revision: 1,
  state: {
    schema: "milestone-images.v1",
    bindings: [
      {
        source: { kind: "target", id: "oldies" },
        choice: { kind: "catalogue", id: "oldies" },
        defaultCatalogueId: "oldies",
      },
      {
        source: { kind: "target", id: "marathon" },
        choice: { kind: "catalogue", id: "best-of-the-best" },
        defaultCatalogueId: "best-of-the-best",
      },
      {
        source: { kind: "target", id: "comrades" },
        choice: { kind: "catalogue", id: "comrades" },
        defaultCatalogueId: "comrades",
      },
    ],
  },
  sourceVersion: "fixture",
  sync: "online",
  cloudRevision: 1,
  remoteState: null,
});
export const milestoneHomeTraining = homeTrainingSchema.parse({
  timezone: "Africa/Johannesburg",
  lastRun: {
    status: "ready",
    item: {
      id: "last",
      title: "Morning run",
      date: "2026-10-29",
      detail: "5.1 km · 39:18",
    },
  },
  nextSession: {
    status: "ready",
    item: {
      id: "next",
      title: "Easy run · Keep it comfortable",
      date: "2026-10-31",
      detail: "40 min · Easy effort",
    },
  },
});
