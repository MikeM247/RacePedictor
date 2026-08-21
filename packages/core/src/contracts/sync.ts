import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const cursorSchema = z.string().regex(/^[1-9]\d*$/, "Expected a positive decimal cursor");

export const pairedDeviceLifecycleSchema = z.enum(["active", "revoked"]);
export const pairedDeviceSchema = z.object({
  id: idSchema,
  athleteId: idSchema,
  displayName: z.string().trim().min(1).max(100),
  status: pairedDeviceLifecycleSchema,
  lastAcknowledgedCursor: cursorSchema.nullable(),
  lastSeenAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const registerPairedDeviceRequestSchema = z.object({
  athleteId: idSchema,
  displayName: z.string().trim().min(1).max(100),
  enrollmentId: idSchema,
}).strict();

export const registerPairedDeviceResponseSchema = z.object({
  data: z.object({
    device: pairedDeviceSchema,
    deviceToken: z.string().min(32),
  }).strict(),
}).strict();

export const revokePairedDeviceRequestSchema = z.object({
  expectedStatus: z.literal("active"),
}).strict();

export const pairedDeviceListApiResponseSchema = z.object({
  data: z.object({ devices: z.array(pairedDeviceSchema).max(10) }).strict(),
}).strict();

export const syncAcknowledgeApiResponseSchema = z.object({
  data: z.object({ device: pairedDeviceSchema }).strict(),
}).strict();

export const syncEntityTypeSchema = z.enum([
  "activity",
  "activity_revision",
  "plan",
  "calendar_session",
]);
export const syncChangeOperationSchema = z.enum(["upsert", "delete"]);

export const syncChangeSchema = z.object({
  cursor: cursorSchema,
  athleteId: idSchema,
  entityType: syncEntityTypeSchema,
  entityId: idSchema,
  entityRevision: z.number().int().positive(),
  operation: syncChangeOperationSchema,
  changedAt: z.string().datetime({ offset: true }),
  payload: z.record(z.unknown()).nullable(),
}).strict().superRefine((change, ctx) => {
  if (change.operation === "delete" && change.payload !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload"], message: "Delete changes must be tombstones" });
  }
  if (change.operation === "upsert" && change.payload === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload"], message: "Upsert changes require a payload" });
  }
});

export const syncChangesQuerySchema = z.object({
  after: cursorSchema.nullable().optional(),
  limit: z.number().int().min(1).max(500).default(100),
}).strict();

export const syncChangesResponseSchema = z.object({
  data: z.object({
    changes: z.array(syncChangeSchema).max(500),
    nextCursor: cursorSchema.nullable(),
    hasMore: z.boolean(),
  }).strict(),
}).strict();

export const syncAcknowledgeRequestSchema = z.object({
  cursor: cursorSchema,
}).strict();

export const syncFailureRequestSchema = z.object({
  diagnosticCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/, "Expected a stable diagnostic code"),
}).strict();

export const freshnessStateSchema = z.enum(["current", "stale", "never", "attention"]);
export const freshnessStatusSchema = z.object({
  state: freshnessStateSchema,
  lastSuccessfulAt: z.string().datetime({ offset: true }).nullable(),
  staleAfter: z.string().datetime({ offset: true }).nullable(),
  diagnosticCode: z.string().trim().min(1).max(80).nullable(),
}).strict();

export const syncStatusSchema = z.object({
  athleteId: idSchema,
  workoutIngestion: freshnessStatusSchema,
  secondBrainContext: freshnessStatusSchema,
  localProjection: freshnessStatusSchema,
  pendingJobs: z.number().int().nonnegative(),
  failedJobs: z.number().int().nonnegative(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export const syncStatusApiResponseSchema = z.object({ data: syncStatusSchema }).strict();

export const onlineSignalStateSchema = z.enum([
  "never",
  "current",
  "stale",
  "retrying",
  "action_required",
  "unavailable",
]);

export const onlineSignalSchema = z.object({
  state: onlineSignalStateSchema,
  lastSuccessfulAt: z.string().datetime({ offset: true }).nullable(),
  staleAfter: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const onlineStatusSchema = z.object({
  athleteId: idSchema,
  providerConnection: onlineSignalSchema.extend({
    provider: z.literal("strava"),
    displayStatus: z.enum(["connected", "action_required", "disconnected", "error"]),
    lastProviderContactAt: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  ingestion: onlineSignalSchema.extend({
    lastEventAt: z.string().datetime({ offset: true }).nullable(),
    lastCanonicalUpdateAt: z.string().datetime({ offset: true }).nullable(),
    pendingJobs: z.number().int().nonnegative(),
    failedJobs: z.number().int().nonnegative(),
  }).strict(),
  activityData: onlineSignalSchema.extend({
    latestActivityAt: z.string().datetime({ offset: true }).nullable(),
    lastCanonicalUpdateAt: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  localDevice: onlineSignalSchema.extend({
    deviceName: z.string().trim().min(1).max(100).nullable(),
    deviceStatus: pairedDeviceLifecycleSchema.nullable(),
    pairedAt: z.string().datetime({ offset: true }).nullable(),
    lastSeenAt: z.string().datetime({ offset: true }).nullable(),
    lastErrorCode: z.string().trim().min(1).max(80).nullable(),
  }).strict(),
  secondBrain: onlineSignalSchema.extend({
    latestRevision: z.number().int().positive().nullable(),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export const onlineStatusApiResponseSchema = z.object({ data: onlineStatusSchema }).strict();

export type PairedDevice = z.infer<typeof pairedDeviceSchema>;
export type SyncChange = z.infer<typeof syncChangeSchema>;
export type SyncChangesQuery = z.infer<typeof syncChangesQuerySchema>;
export type SyncStatus = z.infer<typeof syncStatusSchema>;
export type OnlineSignalState = z.infer<typeof onlineSignalStateSchema>;
export type OnlineStatus = z.infer<typeof onlineStatusSchema>;
