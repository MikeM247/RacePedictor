import { z } from "zod";

const stravaIdSchema = z.number().int().positive().safe();
const eventTimeSchema = z.number().int().positive().safe();

const baseEventShape = {
  event_time: eventTimeSchema,
  object_id: stravaIdSchema,
  owner_id: stravaIdSchema,
  subscription_id: stravaIdSchema,
};

const activityUpdatesSchema = z.object({
  title: z.string().max(500).optional(),
  type: z.string().max(100).optional(),
  private: z.enum(["true", "false"]).optional(),
}).strict();

const activityEventSchema = z.object({
  ...baseEventShape,
  aspect_type: z.enum(["create", "update", "delete"]),
  object_type: z.literal("activity"),
  updates: activityUpdatesSchema.default({}),
}).strict().superRefine((event, context) => {
  if (event.aspect_type === "update" && Object.keys(event.updates).length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["updates"],
      message: "Activity update events must identify a changed field",
    });
  }
});

const deauthorizationEventSchema = z.object({
  ...baseEventShape,
  aspect_type: z.literal("update"),
  object_type: z.literal("athlete"),
  updates: z.object({ authorized: z.literal("false") }).strict(),
}).strict().superRefine((event, context) => {
  if (event.object_id !== event.owner_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["object_id"],
      message: "Athlete deauthorization object and owner must match",
    });
  }
});

/**
 * Strava documents activity create/update/delete events and athlete update
 * events whose sole update is `authorized: "false"`. Other provider events
 * are rejected at the edge so they cannot silently become ingestion work.
 */
export const stravaWebhookEventSchema = z.union([
  activityEventSchema,
  deauthorizationEventSchema,
]);

export const stravaWebhookValidationQuerySchema = z.object({
  mode: z.literal("subscribe"),
  challenge: z.string().min(1).max(512),
  verifyToken: z.string().min(1).max(512),
}).strict();

export type StravaWebhookEvent = z.infer<typeof stravaWebhookEventSchema>;
export type StravaWebhookValidationQuery = z.infer<typeof stravaWebhookValidationQuerySchema>;
