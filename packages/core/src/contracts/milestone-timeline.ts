import { z } from "zod";
import { goalContextRouteDataSchema } from "./coaching.ts";
import { raceHistoryRecordSchema } from "./race-history.ts";
const id = z.string().trim().min(1).max(128);
export const milestoneSourceSchema = z
  .object({ kind: z.enum(["target", "achievement"]), id })
  .strict();
export type MilestoneSource = z.infer<typeof milestoneSourceSchema>;
export const journeyTargetSchema = z
  .object({
    id,
    title: z.string(),
    eventName: z.string().optional(),
    date: z.string(),
    distanceMeters: z.number().positive(),
    targetTimeSeconds: z.number().positive().optional(),
    mainGoal: z.boolean(),
    aliases: z.array(z.string()).optional(),
  })
  .strict();
export const milestoneEntrySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    date: z.string().optional(),
    sources: z.array(milestoneSourceSchema),
    target: journeyTargetSchema.optional(),
    achievement: raceHistoryRecordSchema.optional(),
    completion: z.enum(["completed", "upcoming", "result_pending"]),
    performance: z.enum(["achieved", "missed", "unassessed", "not_set"]),
    removalId: z.string().optional(),
  })
  .strict();
export type MilestoneEntry = z.infer<typeof milestoneEntrySchema>;
export const milestoneStateSchema = z
  .object({
    schema: z.literal("milestone-timeline.v1"),
    unlinkedTargetIds: z.array(id),
    links: z.array(
      z.object({ target: journeyTargetSchema, achievementId: id }).strict(),
    ),
    removals: z.array(
      z
        .object({
          id,
          sources: z.array(milestoneSourceSchema).min(1),
          title: z.string(),
          removedAt: z.string().datetime({ offset: true }),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (
      new Set(state.links.map((link) => link.target.id)).size !==
        state.links.length ||
      new Set(state.removals.map((item) => item.id)).size !==
        state.removals.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Milestone management identities must be unique",
      });
    }
  });
export type MilestoneState = z.infer<typeof milestoneStateSchema>;
export const emptyMilestoneState = (): MilestoneState => ({
  schema: "milestone-timeline.v1",
  links: [],
  removals: [],
  unlinkedTargetIds: [],
});
export const milestoneTimelineSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    sourceVersion: z.string().min(1),
    context: goalContextRouteDataSchema.nullable(),
    history: z.array(raceHistoryRecordSchema),
    availability: z
      .object({ goal: z.boolean(), history: z.boolean() })
      .strict(),
    entries: z.array(milestoneEntrySchema),
    removed: z.array(milestoneEntrySchema),
    today: z.string(),
  })
  .strict();
export type MilestoneTimeline = z.infer<typeof milestoneTimelineSchema>;
export const milestoneTimelineResponseSchema = z
  .object({ data: milestoneTimelineSchema })
  .strict();
export const milestoneMutationSchema = z
  .object({
    operation: z.enum(["remove", "restore", "link", "unlink"]),
    expectedRevision: z.number().int().nonnegative(),
    sourceVersion: z.string().min(1).max(128),
    entryId: z.string().min(1).max(300),
    achievementId: id.optional(),
    confirmedSameRace: z.literal(true).optional(),
    imageResolution: z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        choice: z
          .discriminatedUnion("kind", [
            z
              .object({
                kind: z.literal("catalogue"),
                id: z.enum(["oldies", "best-of-the-best", "comrades"]),
              })
              .strict(),
            z
              .object({
                kind: z.literal("upload"),
                id: z.string().regex(/^[a-f0-9]{64}$/),
              })
              .strict(),
          ])
          .nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((change, ctx) => {
    if (
      change.operation === "link" &&
      (!change.achievementId || !change.confirmedSameRace)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirm the achievement represents this same race",
      });
    }
  });
export type MilestoneMutation = z.infer<typeof milestoneMutationSchema>;
