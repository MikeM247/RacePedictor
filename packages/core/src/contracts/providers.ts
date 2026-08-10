import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);

export const providerKeySchema = z.enum(["strava"]);
export const providerConnectionLifecycleSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "attention",
  "revoked",
]);

export const providerConnectionDisplayStatusSchema = z.enum([
  "connected",
  "action_required",
  "disconnected",
  "error",
]);

export const stravaRequiredScopes = ["activity:read_all"] as const;

export const providerConnectionStatusSchema = z.object({
  athleteId: idSchema,
  provider: providerKeySchema,
  status: providerConnectionLifecycleSchema,
  displayStatus: providerConnectionDisplayStatusSchema,
  connectedAt: z.string().datetime({ offset: true }).nullable(),
  lastSuccessfulProviderContactAt: z.string().datetime({ offset: true }).nullable(),
  lastSuccessfulSyncAt: z.string().datetime({ offset: true }).nullable(),
  lastEventReceivedAt: z.string().datetime({ offset: true }).nullable(),
  lastErrorCode: z.string().trim().min(1).max(80).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export const providerStatusApiResponseSchema = z.object({
  data: z.object({
    connection: providerConnectionStatusSchema,
  }).strict(),
}).strict();

export const providerAuthorizationRequestSchema = z.object({
  athleteId: idSchema,
  returnTo: z.string()
    .startsWith("/")
    .max(500)
    .refine((value) => {
      if (value.startsWith("//") || value.includes("\\")) return false;
      const origin = new URL("https://racepredictor.invalid");
      return new URL(value, origin).origin === origin.origin;
    }, "Expected a same-origin relative path")
    .optional(),
}).strict();

export const providerAuthorizationResultSchema = z.object({
  authorizationUrl: z.string().url(),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export const providerAuthorizationCallbackSchema = z.object({
  state: z.string().trim().min(32).max(512),
  code: z.string().trim().min(1).max(2048).optional(),
  scope: z.string().trim().min(1).max(512).optional(),
  error: z.string().trim().min(1).max(128).optional(),
}).strict();

export const providerDisconnectResultSchema = z.object({
  connection: providerConnectionStatusSchema,
  providerRevocationConfirmed: z.boolean(),
}).strict();

export type ProviderKey = z.infer<typeof providerKeySchema>;
export type ProviderConnectionLifecycle = z.infer<typeof providerConnectionLifecycleSchema>;
export type ProviderConnectionDisplayStatus = z.infer<typeof providerConnectionDisplayStatusSchema>;
export type ProviderConnectionStatus = z.infer<typeof providerConnectionStatusSchema>;
export type ProviderAuthorizationRequest = z.infer<typeof providerAuthorizationRequestSchema>;
export type ProviderAuthorizationResult = z.infer<typeof providerAuthorizationResultSchema>;
export type ProviderAuthorizationCallback = z.infer<typeof providerAuthorizationCallbackSchema>;
export type ProviderDisconnectResult = z.infer<typeof providerDisconnectResultSchema>;
