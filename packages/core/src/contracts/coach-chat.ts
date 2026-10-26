import { z } from "zod";

const stableId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/u);
const boundedText = z.string().trim().min(1).max(4_000);

export const coachTopicSchema = z.enum(["reflect", "prepare", "general"]);
export const coachRecordReferenceSchema = z.object({
  type: z.enum(["activity", "session"]),
  id: stableId,
}).strict();

export const coachTurnRequestSchema = z.object({
  clientTurnId: z.string().uuid(),
  expectedGeneration: z.number().int().positive(),
  expectedSequence: z.number().int().nonnegative(),
  text: boundedText,
  topic: coachTopicSchema,
  selectedRecord: coachRecordReferenceSchema.nullable(),
  contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export const coachRetryRequestSchema = z.object({
  expectedGeneration: z.number().int().positive(),
  expectedAttempt: z.number().int().positive(),
  retryId: z.string().uuid(),
  contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export const coachClearRequestSchema = z.object({
  expectedGeneration: z.number().int().positive(),
  expectedSequence: z.number().int().nonnegative(),
}).strict();

export const coachConversationMessageSchema = z.object({
  id: stableId,
  sequence: z.number().int().positive(),
  generation: z.number().int().positive(),
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(8_000),
  createdAt: z.string().datetime(),
  topic: coachTopicSchema.nullable(),
  selectedRecord: coachRecordReferenceSchema.nullable(),
  turnState: z.enum(["processing", "completed", "failed", "abandoned", "expired"]).nullable(),
}).strict();

export const coachConversationStateSchema = z.object({
  generation: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
  messages: z.array(coachConversationMessageSchema).max(40),
  hasOlder: z.boolean(),
  oldestSequence: z.number().int().positive().nullable(),
  currentTurn: z.object({
    id: stableId,
    state: z.enum(["processing", "completed", "failed", "abandoned", "expired"]),
    attempt: z.number().int().positive(),
    safeErrorCode: z.string().max(80).nullable(),
    messageSaved: z.boolean(),
    retryable: z.boolean(),
  }).strict().nullable(),
}).strict();

const sourceStateSchema = z.enum(["available", "missing", "unavailable"]);
const coachActionSchema = z.object({
  label: z.string().min(1).max(80),
  href: z.string().regex(/^\/dashboard(?:\/[^?#]*)?(?:\?[^#]*)?(?:#[A-Za-z0-9_-]+)?$/u),
  kind: z.enum(["activity", "session", "plan", "calendar", "wellbeing"]),
}).strict();

export const coachActivityContextSchema = z.object({
  id: stableId,
  title: z.string().min(1).max(160),
  sport: z.string().min(1).max(40),
  occurredAt: z.string().datetime(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  distanceM: z.number().nonnegative(),
  elapsedTimeS: z.number().int().nonnegative(),
  avgPaceSecPerKm: z.number().nonnegative().nullable(),
  elevationGainM: z.number().nonnegative(),
  revision: z.number().int().nonnegative(),
  review: z.object({
    headline: z.string().max(600),
    assessment: z.string().max(4_000),
    nextStep: z.string().max(2_000),
    provenance: z.string().max(80),
    limitations: z.array(z.string().max(500)).max(20),
  }).strict().nullable(),
}).strict();

export const coachSessionContextSchema = z.object({
  id: stableId,
  planId: stableId,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  title: z.string().min(1).max(160),
  kind: z.string().min(1).max(40),
  status: z.string().min(1).max(40),
  revision: z.number().int().nonnegative(),
  purpose: z.string().max(2_000).nullable(),
  prescription: z.string().max(4_000).nullable(),
  durationMinutes: z.number().nonnegative().nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
  startTime: z.string().max(20).nullable(),
  cautions: z.array(z.string().max(500)).max(20),
  warnings: z.array(z.string().max(500)).max(20),
}).strict();

export const coachContextSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  timezone: z.string().min(1).max(80),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  suggestedTopic: coachTopicSchema,
  selectedTopic: coachTopicSchema,
  opening: z.object({ kind: z.enum(["reflect", "prepare", "recovery", "choose", "general"]), text: z.string().min(1).max(1_000) }).strict(),
  sources: z.object({
    goal: sourceStateSchema,
    plan: sourceStateSchema,
    activity: sourceStateSchema,
    schedule: sourceStateSchema,
    wellbeing: sourceStateSchema,
  }).strict(),
  goal: z.object({ title: z.string().max(200), target: z.string().max(200).nullable() }).strict().nullable(),
  plan: z.object({ id: stableId, version: z.number().int().positive(), approvalHash: z.string().max(160) }).strict().nullable(),
  todaySchedule: z.object({ kind: z.enum(["session", "rest", "skipped", "unscheduled", "unavailable"]), message: z.string().max(400) }).strict(),
  latestActivity: coachActivityContextSchema.nullable(),
  nextSession: coachSessionContextSchema.nullable(),
  recentActivities: z.array(z.object({
    id: stableId,
    title: z.string().min(1).max(160),
    sport: z.string().min(1).max(40),
    occurredAt: z.string().datetime(),
    distanceM: z.number().nonnegative(),
    elapsedTimeS: z.number().int().nonnegative(),
    avgPaceSecPerKm: z.number().nonnegative().nullable(),
  }).strict()).max(10),
  wellbeing: z.object({ status: z.enum(["saved", "skipped"]), answers: z.record(z.unknown()) }).strict().nullable(),
  actions: z.array(coachActionSchema).max(6),
  selectedRecord: coachRecordReferenceSchema.nullable(),
  ambiguousSessionIds: z.array(stableId).max(10),
  ambiguousSessions: z.array(coachSessionContextSchema).max(10),
  canSend: z.boolean(),
}).strict();

export type CoachTopic = z.infer<typeof coachTopicSchema>;
export type CoachRecordReference = z.infer<typeof coachRecordReferenceSchema>;
export type CoachTurnRequest = z.infer<typeof coachTurnRequestSchema>;
export type CoachRetryRequest = z.infer<typeof coachRetryRequestSchema>;
export type CoachClearRequest = z.infer<typeof coachClearRequestSchema>;
export type CoachConversationMessage = z.infer<typeof coachConversationMessageSchema>;
export type CoachConversationState = z.infer<typeof coachConversationStateSchema>;
export type CoachContext = z.infer<typeof coachContextSchema>;

export const coachArchiveRequestSchema = coachClearRequestSchema.extend({ requestId: z.string().uuid() });
export const coachArchiveSummarySchema = z.object({
  id: stableId,
  generation: z.number().int().positive(),
  title: z.string().min(1).max(80),
  archivedAt: z.string().datetime(),
  startedAt: z.string().datetime(),
  finalSequence: z.number().int().positive(),
}).strict();
export const coachArchiveResultSchema = z.object({
  archive: coachArchiveSummarySchema.nullable(),
  conversation: coachConversationStateSchema,
}).strict();
export const coachHistoryListSchema = z.object({
  items: z.array(coachArchiveSummarySchema).max(20),
  nextBefore: z.number().int().positive().nullable(),
}).strict();
export const coachHistoryMessagesSchema = z.object({
  archive: coachArchiveSummarySchema,
  messages: z.array(coachConversationMessageSchema).max(40),
  hasOlder: z.boolean(),
  oldestSequence: z.number().int().positive().nullable(),
}).strict();
export type CoachArchiveSummary = z.infer<typeof coachArchiveSummarySchema>;
