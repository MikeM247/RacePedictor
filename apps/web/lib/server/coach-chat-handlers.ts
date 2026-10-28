import { createHash } from "node:crypto";
import { z } from "zod";
import { athleteScopeFor } from "../../../../packages/core/src/contracts/auth.ts";
import {
  coachClearRequestSchema,
  coachArchiveRequestSchema,
  coachArchiveResultSchema,
  coachHistoryListSchema,
  coachHistoryMessagesSchema,
  coachArchiveSummarySchema,
  coachContextSchema,
  coachConversationStateSchema,
  coachRunReviewFeedbackReceiptSchema,
  coachRunReviewFollowupRequestSchema,
  coachRecordReferenceSchema,
  coachRetryRequestSchema,
  coachTopicSchema,
  coachTurnRequestSchema,
  type CoachContext,
  type CoachRecordReference,
  type CoachTopic,
} from "../../../../packages/core/src/contracts/coach-chat.ts";
import {
  CoachChatConflictError,
  CoachChatNotFoundError,
  CoachChatRateLimitError,
} from "../../../../packages/db/src/cloud/index.js";
import { ApiHttpError, success } from "./api-response.ts";
import { readCloudEnvironment } from "./cloud-environment.ts";
import { getCloudReadComposition } from "./cloud-read-composition.ts";
import { resolveCoachContext } from "./coach-context.ts";
import { CoachContextRecordNotFoundError } from "./coach-context.ts";
import { CoachProviderError, coachModelFromEnvironment, createOpenAIChatProvider } from "./coach-openai-provider.ts";
import type { SensitiveRouteContext } from "./route-security.ts";
import { withSensitiveRoute } from "./route-security.ts";

const MAX_BODY_BYTES = 32 * 1024;
const publicFailureMessages: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED: "Coach chat is not configured yet. Your message was saved; retry when the service is available.",
  PROVIDER_TIMEOUT: "The reply took too long. Your message was saved and can be retried.",
  PROVIDER_UNAVAILABLE: "The coach is temporarily unavailable. Your message was saved and can be retried.",
  PROVIDER_RATE_LIMITED: "The coach service is busy. Your message was saved and can be retried shortly.",
  PROVIDER_REJECTED: "The coach could not accept this request. Your message was saved and can be retried.",
  PROVIDER_INCOMPLETE: "The reply was incomplete. Your message was saved and can be retried.",
  PROVIDER_REFUSAL: "The coach could not answer that request safely. Your message was saved; try a different question.",
  PROVIDER_EMPTY_RESPONSE: "The coach returned an empty reply. Your message was saved and can be retried.",
  PROVIDER_INVALID_RESPONSE: "The coach returned an unsupported reply. Your message was saved and can be retried.",
  PROVIDER_REPLY_TOO_LONG: "The reply exceeded the supported length. Your message was saved and can be retried.",
  CONTEXT_TOO_LARGE: "The current coaching context is too large to send safely. Your message was saved.",
  CONTEXT_CHANGED: "Training context changed while the reply was being prepared. Your message was saved; refresh and retry it.",
};

type ChatComposition = ReturnType<typeof getCloudReadComposition> & {
  generateReply?: ReturnType<typeof createOpenAIChatProvider>;
};

let defaultChatComposition: ChatComposition | undefined;
function getChatComposition(): ChatComposition {
  defaultChatComposition ??= {
    ...getCloudReadComposition(),
    generateReply: createOpenAIChatProvider({ model: coachModelFromEnvironment() }),
  };
  return defaultChatComposition;
}

export function withCoachRoute<TRest extends unknown[]>(handler: (
  security: SensitiveRouteContext,
  request: Request,
  ...rest: TRest
) => Promise<Response> | Response) {
  const secured = withSensitiveRoute(async (security, request, ...rest: TRest) => {
    const response = await handler(security, request, ...rest);
    return privateNoStore(response);
  }, { cloudHandling: "actor-scoped" });
  return async (request: Request, ...rest: TRest) => privateNoStore(await secured(request, ...rest));
}

export async function handleCoachContext(security: SensitiveRouteContext, request: Request) {
  const scope = requireOwnerScope(security);
  const environment = readCloudEnvironment();
  if (!environment.features.coachUi) throw new ApiHttpError(503, "UNAVAILABLE", "Coach is not enabled for this online site");
  const params = new URL(request.url).searchParams;
  const topicResult = params.has("topic") ? coachTopicSchema.safeParse(params.get("topic")) : null;
  if (topicResult && !topicResult.success) throw validationError(topicResult.error);
  const recordType = params.get("recordType");
  const recordId = params.get("recordId");
  if ((recordType && !recordId) || (!recordType && recordId)) throw new ApiHttpError(400, "VALIDATION_ERROR", "A complete selected record reference is required");
  let selectedRecord: CoachRecordReference | null = null;
  if (recordType && recordId) {
    const parsedRecord = coachRecordReferenceSchema.safeParse({ type: recordType, id: recordId });
    if (!parsedRecord.success) throw validationError(parsedRecord.error);
    selectedRecord = parsedRecord.data;
  }
  try {
    const context = await resolveCoachContext(getChatComposition(), scope, {
      ...(topicResult?.success ? { topic: topicResult.data } : {}),
      selectedRecord,
      canSend: environment.features.coachChat && Boolean(process.env.OPENAI_API_KEY),
    });
    return success(coachContextSchema.parse(context));
  } catch (error) { throw mapChatError(error); }
}

export async function handleCoachConversation(security: SensitiveRouteContext, request: Request) {
  const scope = requireOwnerScope(security);
  const beforeText = new URL(request.url).searchParams.get("before");
  const beforeSequence = beforeText === null ? null : Number(beforeText);
  if (beforeSequence !== null && (!Number.isSafeInteger(beforeSequence) || beforeSequence < 1)) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "The message cursor is invalid");
  }
  const conversation = await getChatComposition().coachChat.getConversation(scope, { beforeSequence });
  return success(coachConversationStateSchema.parse(conversation));
}

export async function handleCoachNewTurn(security: SensitiveRouteContext, request: Request, compositionOverride?: ChatComposition) {
  const scope = requireOwnerScope(security);
  assertSameOrigin(request);
  const parsed = coachTurnRequestSchema.safeParse(await readBoundedJson(request));
  if (!parsed.success) throw validationError(parsed.error);
  const environment = readCloudEnvironment();
  if (!environment.features.coachChat) throw new ApiHttpError(503, "UNAVAILABLE", "Coach replies are paused; your coaching history remains available");
  const composition = compositionOverride ?? getChatComposition();
  try {
    const replay = await composition.coachChat.getTurnReplay(scope, parsed.data);
    if (replay) {
      const savedRecord = replay.userMessage?.selectedRecordType && replay.userMessage?.selectedRecordId
        ? { type: replay.userMessage.selectedRecordType, id: replay.userMessage.selectedRecordId } : null;
      const requestHash = hashJson({ text: parsed.data.text, topic: parsed.data.topic,
        selectedRecord: parsed.data.selectedRecord ?? savedRecord,
        contextFingerprint: parsed.data.contextFingerprint });
      if (replay.turn.requestHash !== requestHash) throw new CoachChatConflictError("This turn identity was already used with different content.");
      return existingTurnResponse(replay, "duplicate");
    }
  } catch (error) { throw mapChatError(error); }
  const selectedRecord = parsed.data.selectedRecord;
  let context: CoachContext;
  try {
    context = await resolveCoachContext(composition, scope, {
      topic: parsed.data.topic,
      selectedRecord,
      canSend: true,
    });
  } catch (error) { throw mapChatError(error); }
  if (context.fingerprint !== parsed.data.contextFingerprint) throw new ApiHttpError(409, "CONFLICT", "Training context changed. Refresh before sending your message.");
  const effectiveSelectedRecord = context.selectedRecord;
  const requestHash = hashJson({
    text: parsed.data.text,
    topic: parsed.data.topic,
    selectedRecord: effectiveSelectedRecord,
    contextFingerprint: context.fingerprint,
  });
  let result: any;
  try {
    result = await composition.coachChat.beginTurn(scope, {
      ...parsed.data,
      selectedRecord: effectiveSelectedRecord,
      requestHash,
      contextFingerprint: context.fingerprint,
      contextSnapshot: context,
      reflectedActivityAt: parsed.data.topic === "reflect" ? context.latestActivity?.occurredAt : null,
      model: coachModelFromEnvironment(),
    });
  } catch (error) { throw mapChatError(error); }
  if (result.kind === "replay") return existingTurnResponse(result, "duplicate");
  return generateAndPersist({
    composition,
    scope,
    context,
    turn: result.turn,
    userMessage: result.userMessage,
    leaseToken: result.leaseToken,
  });
}

/** Start one Coach response for a committed run-feedback revision. The receipt
 * and provider prompt are built from the saved reflection, never request text. */
export async function handleCoachRunReviewFollowup(security: SensitiveRouteContext, request: Request, compositionOverride?: ChatComposition) {
  const scope = requireOwnerScope(security);
  assertSameOrigin(request);
  const parsed = coachRunReviewFollowupRequestSchema.safeParse(await readBoundedJson(request));
  if (!parsed.success) throw validationError(parsed.error);
  const input = parsed.data;
  const composition = compositionOverride ?? getChatComposition();
  const environment = readCloudEnvironment();
  if (!environment.features.coachChat) throw new ApiHttpError(503, "UNAVAILABLE", "Coach replies are paused; your feedback is saved");

  const requestReplay = await composition.coachChat.getTurnReplay(scope, { expectedGeneration: input.expectedGeneration, clientTurnId: input.requestId });
  if (requestReplay) {
    if (requestReplay.userMessage?.eventType !== "activity_reflection"
      || requestReplay.userMessage?.selectedRecordId !== input.activityId
      || requestReplay.userMessage?.activityReflectionRevision !== input.reflectionRevision) {
      throw new CoachChatConflictError("This request identity was already used for different content.");
    }
    return existingTurnResponse(requestReplay, "feedback-replay");
  }

  const revisionReplay = await composition.coachChat.getTurnReplay(scope, {
    expectedGeneration: input.expectedGeneration,
    activityReflectionRef: { activityId: input.activityId, revision: input.reflectionRevision },
  });
  if (revisionReplay) return existingTurnResponse(revisionReplay, "feedback-revision-replay");

  const saved = await composition.journal.getRunReviewState(scope, input.activityId);
  if (!saved.reflection || saved.reflection.questionnaireVersion !== "activity-reflection.v2"
    || saved.reflection.revision !== input.reflectionRevision
    || saved.state?.completedReflectionRevision !== input.reflectionRevision) {
    throw new ApiHttpError(409, "REFLECTION_CHANGED", "The saved run feedback changed. Refresh the review before asking ORBIT to respond.");
  }

  const conversation = coachConversationStateSchema.parse(await composition.coachChat.getConversation(scope));
  if (conversation.generation !== input.expectedGeneration) throw new ApiHttpError(409, "CONVERSATION_CHANGED", "The discussion changed. Reload before asking ORBIT to respond.");
  if (conversation.currentTurn?.state === "processing") return success({ status: "waiting", message: "Feedback is saved. ORBIT can respond after the current reply finishes." }, 202);
  if (conversation.sequence !== input.expectedSequence) throw new ApiHttpError(409, "CONVERSATION_CHANGED", "The discussion changed. Reload before asking ORBIT to respond.");

  let context: CoachContext;
  try {
    context = await resolveCoachContext(composition, scope, {
      topic: "reflect",
      selectedRecord: { type: "activity", id: input.activityId },
      canSend: true,
    });
  } catch (error) { throw mapChatError(error); }
  const selected = context.selectedActivity;
  if (!selected || selected.id !== input.activityId || selected.reflection?.revision !== input.reflectionRevision) {
    throw new ApiHttpError(409, "REFLECTION_CHANGED", "The saved run feedback changed. Refresh the review before asking ORBIT to respond.");
  }
  const receipt = coachRunReviewFeedbackReceiptSchema.parse({
    activityId: selected.id,
    activityTitle: selected.title,
    occurredAt: selected.occurredAt,
    reflectionRevision: selected.reflection.revision,
    rpeAnswer: selected.reflection.rpeAnswer,
    overallRpe: selected.reflection.overallRpe,
    expectation: selected.reflection.expectation,
    discomfort: selected.reflection.discomfort,
    symptoms: selected.reflection.symptoms,
    energy: selected.reflection.energy,
    fuel: selected.reflection.fuel,
    fuelNote: selected.reflection.fuelNote,
    note: selected.reflection.note,
    raceNotes: selected.reflection.raceNotes,
  });
  const requestHash = hashJson({ eventType: "activity_reflection", receipt, contextFingerprint: context.fingerprint });
  let result: any;
  try {
    result = await composition.coachChat.beginTurn(scope, {
      clientTurnId: input.requestId,
      expectedGeneration: input.expectedGeneration,
      expectedSequence: input.expectedSequence,
      topic: "reflect",
      selectedRecord: { type: "activity", id: input.activityId },
      text: "Run feedback saved",
      eventType: "activity_reflection",
      eventPayload: receipt,
      activityReflectionRef: { activityId: input.activityId, revision: input.reflectionRevision },
      requestHash,
      contextFingerprint: context.fingerprint,
      contextSnapshot: context,
      reflectedActivityAt: selected.occurredAt,
      model: coachModelFromEnvironment(),
    });
  } catch (error) { throw mapChatError(error); }
  if (result.kind === "replay") return existingTurnResponse(result, "feedback-replay");
  return generateAndPersist({ composition, scope, context, turn: result.turn, userMessage: result.userMessage, leaseToken: result.leaseToken });
}

export async function handleCoachRetry(security: SensitiveRouteContext, request: Request, turnId: string, compositionOverride?: ChatComposition) {
  const scope = requireOwnerScope(security);
  assertSameOrigin(request);
  const parsed = coachRetryRequestSchema.safeParse(await readBoundedJson(request));
  if (!parsed.success) throw validationError(parsed.error);
  const environment = readCloudEnvironment();
  if (!environment.features.coachChat) throw new ApiHttpError(503, "UNAVAILABLE", "Coach replies are paused; your coaching history remains available");
  const composition = compositionOverride ?? getChatComposition();
  try {
    const replay = await composition.coachChat.getTurnReplay(scope, { ...parsed.data, turnId });
    if (replay) {
      const requestHash = hashJson({ expectedAttempt: parsed.data.expectedAttempt, contextFingerprint: parsed.data.contextFingerprint });
      if (replay.turn.retryRequestHash !== requestHash) throw new CoachChatConflictError("This retry identity was already used with different context.");
      return existingTurnResponse(replay, "retry-replay");
    }
  } catch (error) { throw mapChatError(error); }
  const savedTurn = await composition.coachChat.getTurn(scope, turnId);
  if (!savedTurn?.userMessage) throw new ApiHttpError(404, "NOT_FOUND", "The coaching turn was not found");
  if (savedTurn.generation !== parsed.data.expectedGeneration) throw new ApiHttpError(409, "CONFLICT", "The conversation has changed; reload it before retrying.");
  const selectedRecord = savedTurn.userMessage.selectedRecord;
  let context: CoachContext;
  try {
    context = await resolveCoachContext(composition, scope, {
      topic: savedTurn.topic as CoachTopic,
      selectedRecord,
      canSend: true,
    });
  } catch (error) { throw mapChatError(error); }
  if (context.fingerprint !== parsed.data.contextFingerprint) throw new ApiHttpError(409, "CONFLICT", "Training context changed. Refresh it before retrying.");
  const retryRequestHash = hashJson({ expectedAttempt: parsed.data.expectedAttempt, contextFingerprint: context.fingerprint });
  let result: any;
  try {
    result = await composition.coachChat.retryTurn(scope, {
      turnId,
      expectedGeneration: parsed.data.expectedGeneration,
      expectedAttempt: parsed.data.expectedAttempt,
      retryId: parsed.data.retryId,
      retryRequestHash,
      contextFingerprint: context.fingerprint,
      contextSnapshot: context,
      model: coachModelFromEnvironment(),
    });
  } catch (error) { throw mapChatError(error); }
  if (result.kind === "replay") return existingTurnResponse(result, "retry-replay");
  return generateAndPersist({
    composition,
    scope,
    context,
    turn: result.turn,
    userMessage: result.userMessage,
    leaseToken: result.leaseToken,
  });
}

export async function handleCoachArchive(security: SensitiveRouteContext, request: Request, compositionOverride?: ChatComposition) {
  const scope = requireOwnerScope(security);
  assertSameOrigin(request);
  const parsed = coachArchiveRequestSchema.safeParse(await readBoundedJson(request));
  if (!parsed.success) throw validationError(parsed.error);
  const composition = compositionOverride ?? getChatComposition();
  try {
    const result = await composition.coachChat.archiveConversation(scope, parsed.data);
    const conversation = await composition.coachChat.getConversation(scope);
    console.info("coach.archive.saved", { requestId: parsed.data.requestId, generation: parsed.data.expectedGeneration, archived: Boolean(result.archive) });
    return success(coachArchiveResultSchema.parse({ ...result, conversation }));
  } catch (error) {
    console.warn("coach.archive.failed", { requestId: parsed.data.requestId, generation: parsed.data.expectedGeneration });
    throw mapChatError(error);
  }
}

function historyBefore(request: Request) {
  const value = new URL(request.url).searchParams.get("before");
  if (value === null) return null;
  const parsed = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export async function handleCoachHistory(security: SensitiveRouteContext, request: Request, compositionOverride?: ChatComposition) {
  const scope = requireOwnerScope(security);
  const beforeGeneration = historyBefore(request);
  try { return success(coachHistoryListSchema.parse(await (compositionOverride ?? getChatComposition()).coachChat.listArchives(scope, { beforeGeneration }))); }
  catch (error) { throw mapChatError(error); }
}

export async function handleCoachHistoryMessages(security: SensitiveRouteContext, request: Request, archiveId: string, compositionOverride?: ChatComposition) {
  const scope = requireOwnerScope(security);
  const parsedId = coachArchiveSummarySchema.shape.id.safeParse(archiveId);
  if (!parsedId.success) throw validationError(parsedId.error);
  const beforeSequence = historyBefore(request);
  try { return success(coachHistoryMessagesSchema.parse(await (compositionOverride ?? getChatComposition()).coachChat.getArchive(scope, parsedId.data, { beforeSequence }))); }
  catch (error) { throw mapChatError(error); }
}

export async function handleClearCoachHistory(security: SensitiveRouteContext, request: Request, compositionOverride?: ChatComposition) {
  const scope = requireOwnerScope(security);
  assertSameOrigin(request);
  const parsed = coachClearRequestSchema.safeParse(await readBoundedJson(request));
  if (!parsed.success) throw validationError(parsed.error);
  try {
    const result = await (compositionOverride ?? getChatComposition()).coachChat.clearHistory(scope, parsed.data);
    return success(result);
  } catch (error) { throw mapChatError(error); }
}

async function generateAndPersist(input: {
  composition: ChatComposition;
  scope: ReturnType<typeof athleteScopeFor>;
  context: CoachContext;
  turn: any;
  userMessage: any;
  leaseToken: string;
}) {
  const { composition, scope, context, turn, userMessage, leaseToken } = input;
  const history = await composition.coachChat.getCompletedHistory(scope, 20);
  try {
    const generated = await (composition.generateReply ?? createOpenAIChatProvider({ model: coachModelFromEnvironment() }))({
      context,
      history,
      userText: providerUserText(userMessage),
    });
    const latestContext = await resolveCoachContext(composition, scope, {
      topic: turn.topic as CoachTopic,
      selectedRecord: context.selectedRecord,
      canSend: true,
    });
    const completed = await composition.coachChat.completeTurn(scope, {
      turnId: turn.id,
      attempt: turn.attemptCount,
      leaseToken,
      text: generated.text,
      currentFingerprint: latestContext.fingerprint,
      selectedRecordType: context.selectedRecord?.type,
      selectedRecordId: context.selectedRecord?.id,
      metadata: generated.metadata,
    });
    if (completed.kind === "stale") throw new ApiHttpError(409, "CONFLICT", "The conversation changed before this reply could be saved.");
    if (completed.kind === "context-changed") {
      return success({
        turn: turnOutput(completed.turn, true),
        userMessage: messageOutput(userMessage, "failed"),
        assistantMessage: null,
        failure: { code: "CONTEXT_CHANGED", message: publicFailureMessages.CONTEXT_CHANGED },
      });
    }
    return success({
      turn: turnOutput(completed.turn, true),
      userMessage: messageOutput(userMessage, "completed"),
      assistantMessage: messageOutput(completed.assistantMessage, "completed"),
      failure: null,
    });
  } catch (error) {
    if (error instanceof ApiHttpError) throw error;
    const safeCode = error instanceof CoachProviderError ? error.safeCode : "PROVIDER_UNAVAILABLE";
    const failed = await composition.coachChat.failTurn(scope, {
      turnId: turn.id,
      attempt: turn.attemptCount,
      leaseToken,
      safeErrorCode: safeCode,
    });
    if (failed.kind === "stale") throw new ApiHttpError(409, "CONFLICT", "The conversation changed before this reply could be saved.");
    return success({
      turn: turnOutput(failed.turn, true),
      userMessage: messageOutput(userMessage, "failed"),
      assistantMessage: null,
      failure: { code: safeCode, message: publicFailureMessages[safeCode] ?? "The coach could not complete this reply. Your message was saved and can be retried." },
    });
  }
}

function existingTurnResponse(result: any, replayKind: string) {
  const messageSaved = Boolean(result.userMessage);
  const payload = {
    turn: turnOutput(result.turn, messageSaved),
    userMessage: result.userMessage ? messageOutput(result.userMessage, result.turn.state) : null,
    assistantMessage: result.assistantMessage ? messageOutput(result.assistantMessage, result.turn.state) : null,
    failure: result.turn.state === "failed"
      ? { code: result.turn.safeErrorCode ?? "PROVIDER_UNAVAILABLE", message: publicFailureMessages[result.turn.safeErrorCode] ?? "The coach could not complete this reply. Your message was saved and can be retried." }
      : null,
    replayKind,
  };
  return success(payload, result.turn.state === "processing" ? 202 : 200);
}

function turnOutput(turn: any, messageSaved: boolean) {
  return {
    id: turn.id,
    state: turn.state,
    attempt: turn.attemptCount,
    safeErrorCode: turn.safeErrorCode ?? null,
    messageSaved,
    retryable: ["failed", "expired"].includes(turn.state),
  };
}

function messageOutput(message: any, turnState: any) {
  return {
    id: message.id,
    sequence: message.sequence,
    generation: message.generation,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
    topic: message.topic ?? null,
    selectedRecord: message.selectedRecordType && message.selectedRecordId
      ? { type: message.selectedRecordType, id: message.selectedRecordId }
      : message.selectedRecord ?? null,
    turnState,
    eventType: message.eventType ?? null,
    activityReflectionRevision: message.activityReflectionRevision ?? null,
    eventPayload: message.eventPayload ?? null,
  };
}

function providerUserText(message: any) {
  if (message?.eventType !== "activity_reflection" || !message.eventPayload) return message.text;
  return `Structured athlete run feedback saved from the post-run review form. This is not text the athlete typed. Use it as read-only evidence and respond to the athlete's reported experience.\n${JSON.stringify(message.eventPayload)}`;
}

function requireOwnerScope(security: SensitiveRouteContext) {
  if (security.mode !== "authenticated") throw new ApiHttpError(503, "CONFIGURATION_ERROR", "Coach is available only on the authenticated online site");
  if (security.actor.credentialKind !== "session") throw new ApiHttpError(403, "FORBIDDEN", "A signed-in owner session is required");
  return athleteScopeFor(security.actor);
}

function assertSameOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let suppliedOrigin: string | null = origin;
  if (!suppliedOrigin && referer) {
    try { suppliedOrigin = new URL(referer).origin; }
    catch { suppliedOrigin = null; }
  }
  if (!suppliedOrigin || suppliedOrigin !== requestOrigin) throw new ApiHttpError(403, "FORBIDDEN", "A same-origin request is required");
}

async function readBoundedJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new ApiHttpError(413, "VALIDATION_ERROR", "Request body is too large");
  if (!request.body) throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiHttpError(413, "VALIDATION_ERROR", "Request body is too large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiHttpError) throw error;
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON");
  }
  try {
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch { throw new ApiHttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON"); }
}

function validationError(error: z.ZodError) {
  return new ApiHttpError(400, "VALIDATION_ERROR", "Request validation failed", error.issues.map((issue) => ({ path: issue.path, message: issue.message })));
}

function mapChatError(error: unknown) {
  if (error instanceof ApiHttpError) return error;
  if (error instanceof CoachChatConflictError) return new ApiHttpError(409, "CONFLICT", safeErrorMessage(error, "The conversation changed. Reload it and try again."));
  if (error instanceof CoachChatNotFoundError || error instanceof CoachContextRecordNotFoundError) return new ApiHttpError(404, "NOT_FOUND", safeErrorMessage(error, "The coaching turn or selected record was not found."));
  if (error instanceof CoachChatRateLimitError) return new ApiHttpError(429, "RATE_LIMITED", safeErrorMessage(error, "The coaching message limit has been reached."), [], { "Retry-After": String(error.retryAfterSeconds) });
  return error;
}

function safeErrorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

function privateNoStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
