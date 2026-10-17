import { z } from "zod";

const raceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Expected a real race date");

// Explicitly selected, user-confirmed race history. Ordinary activity imports
// do not supply race identity, official results, or an exhaustive PB history.
export const raceHistoryRecordSchema = z.object({
  id: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(200),
  confirmedBy: z.literal("user"),
  achievement: z.enum(["personal_best", "goal_achieved"]).optional(),
  raceDate: raceDate.optional(),
  distanceMeters: z.number().positive().max(500_000).optional(),
  elapsedTimeSeconds: z.number().int().positive().max(604_800).optional(),
  activityId: z.string().trim().min(1).max(128).optional(),
  targetId: z.string().trim().min(1).max(128).optional(),
  targetSnapshot: z.object({
    id: z.string().trim().min(1).max(128), title: z.string().trim().min(1).max(200),
    date: raceDate, distanceMeters: z.number().positive().max(500_000),
    targetTimeSeconds: z.number().int().positive().max(604_800).optional(),
  }).strict().optional(),
  revision: z.number().int().positive().optional(),
}).strict().superRefine((value, ctx) => {
  if ((!value.achievement && !value.targetId) || (value.targetId && (!value.raceDate || !value.distanceMeters || !value.elapsedTimeSeconds))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A race result needs a linked target, race date, official distance and elapsed time, or an explicitly confirmed historical achievement" });
  }
});

export const raceHistorySchema = z.array(raceHistoryRecordSchema).refine(
  (items) => new Set(items.map((item) => item.id)).size === items.length,
  "Race history IDs must be unique",
);

export const raceHistoryResponseSchema = z.object({ data: z.object({
  items: raceHistorySchema,
  publishedAt: z.string().datetime({ offset: true }).nullable(),
}).strict() }).strict();

export type RaceHistoryRecord = z.infer<typeof raceHistoryRecordSchema>;

export const saveRaceHistorySchema = z.object({
  record: raceHistoryRecordSchema,
  expectedRevision: z.number().int().nonnegative(),
}).strict();
