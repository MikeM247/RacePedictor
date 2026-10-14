import { z } from "zod";

const date = z.string().date();
const total = z.number().finite().nonnegative().nullable();
export const weeklyTrainingWeekSchema = z.object({
  weekStart: date,
  weekEndExclusive: date,
  isCurrentWeek: z.boolean(),
  runCount: z.number().int().nonnegative().nullable(),
  distanceM: total,
  elapsedTimeS: total,
  avgPaceSecPerKm: z.number().finite().positive().nullable(),
  elevationGainM: total,
  coverage: z.enum(["recorded", "no_recorded_runs", "unknown"]),
});
export const weeklyTrainingReadSchema = z.object({
  status: z.enum(["ready", "empty", "unavailable"]),
  timezone: z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Invalid timezone"),
  generatedAt: z.string().datetime(),
  windowStart: date,
  windowEnd: date,
  weeks: z.array(weeklyTrainingWeekSchema),
}).superRefine((value, ctx) => {
  const start = Date.parse(value.windowStart);
  const day = 86_400_000;
  if (new Date(start).getUTCDay() !== 1 || Date.parse(value.windowEnd) !== start + 84 * day) {
    ctx.addIssue({ code: "custom", message: "Expected a twelve-week Monday window" });
  }
  if (value.weeks.length !== (value.status === "ready" ? 12 : 0)) {
    ctx.addIssue({ code: "custom", message: "Unexpected weekly observation count" });
  }
  value.weeks.forEach((week, index) => {
    if (Date.parse(week.weekStart) !== start + index * 7 * day
      || Date.parse(week.weekEndExclusive) !== start + (index + 1) * 7 * day
      || week.isCurrentWeek !== (index === 11)) {
      ctx.addIssue({ code: "custom", path: ["weeks", index], message: "Invalid week order or boundary" });
    }
  });
});
export type WeeklyTrainingRead = z.infer<typeof weeklyTrainingReadSchema>;
export type WeeklyTrainingWeek = z.infer<typeof weeklyTrainingWeekSchema>;
