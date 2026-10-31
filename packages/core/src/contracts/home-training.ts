import { z } from "zod";
export const homeTrainingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string().nullable(),
  detail: z.string(),
});
export const trainingSectionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), item: homeTrainingItemSchema }),
  z.object({ status: z.enum(["empty", "unavailable"]) }),
]);
export const homeTrainingSchema = z.object({
  timezone: z.string().nullable(),
  lastRun: trainingSectionSchema,
  nextSession: trainingSectionSchema,
});
export type HomeTraining = z.infer<typeof homeTrainingSchema>;
export type TrainingSection = z.infer<typeof trainingSectionSchema>;
