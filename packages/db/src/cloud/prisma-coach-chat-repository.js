import { randomUUID } from "node:crypto";
import { assertAthleteScope } from "./athlete-scope.js";

const LEASE_MS = 90_000;
const MAX_PER_MINUTE = 6;
const MAX_PER_DAY = 60;

export class CoachChatConflictError extends Error {
  constructor(message = "The conversation changed. Reload it and try again.") {
    super(message);
    this.name = "CoachChatConflictError";
    this.code = "CONFLICT";
  }
}

export class CoachChatRateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super("The coaching message limit has been reached. Try again later.");
    this.name = "CoachChatRateLimitError";
    this.code = "RATE_LIMITED";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class CoachChatNotFoundError extends Error {
  constructor(message = "The coaching turn was not found.") {
    super(message);
    this.name = "CoachChatNotFoundError";
    this.code = "NOT_FOUND";
  }
}

export class PrismaCoachChatRepository {
  #prisma;
  #now;
  #newLeaseToken;

  constructor({ prisma, now = () => new Date(), newLeaseToken = randomUUID }) {
    if (!prisma?.coachConversation || !prisma?.coachMessage || !prisma?.coachTurn || !prisma?.coachUsageBucket || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma coach conversation client is required");
    }
    this.#prisma = prisma;
    this.#now = now;
    this.#newLeaseToken = newLeaseToken;
  }

  async getConversation(scope, { beforeSequence = null, limit = 40 } = {}) {
    const athleteId = assertAthleteScope(scope);
    const boundedLimit = Math.min(Math.max(Number(limit) || 40, 1), 40);
    const conversation = await this.#prisma.coachConversation.findUnique({ where: { athleteId } });
    if (!conversation) return emptyConversation();
    const rows = await this.#prisma.coachMessage.findMany({
      where: {
        athleteId,
        conversationId: conversation.id,
        generation: conversation.generation,
        ...(beforeSequence ? { sequence: { lt: beforeSequence } } : {}),
      },
      include: { turn: { select: { state: true } } },
      orderBy: { sequence: "desc" },
      take: boundedLimit + 1,
    });
    const hasOlder = rows.length > boundedLimit;
    const page = rows.slice(0, boundedLimit).reverse();
    const latestTurn = await this.#prisma.coachTurn.findFirst({
      where: { athleteId, conversationId: conversation.id, generation: conversation.generation },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const messageSaved = latestTurn ? await this.#prisma.coachMessage.findFirst({
      where: { athleteId, turnId: latestTurn.id, role: "user" }, select: { id: true },
    }) !== null : false;
    return {
      generation: conversation.generation,
      sequence: conversation.sequence,
      messages: page.map(messageDto),
      hasOlder,
      oldestSequence: page[0]?.sequence ?? null,
      currentTurn: latestTurn ? turnStateDto(latestTurn, messageSaved) : null,
    };
  }

  async getConversationMarker(scope) {
    const athleteId = assertAthleteScope(scope);
    const conversation = await this.#prisma.coachConversation.findUnique({
      where: { athleteId },
      select: { id: true, generation: true, sequence: true, lastReflectedActivityId: true, lastReflectedActivityAt: true },
    });
    return conversation ? {
      id: conversation.id,
      generation: conversation.generation,
      sequence: conversation.sequence,
      lastReflectedActivityId: conversation.lastReflectedActivityId,
      lastReflectedActivityAt: conversation.lastReflectedActivityAt?.toISOString() ?? null,
    } : { id: null, generation: 1, sequence: 0, lastReflectedActivityId: null, lastReflectedActivityAt: null };
  }

  async getCompletedHistory(scope, limit = 20) {
    const athleteId = assertAthleteScope(scope);
    const conversation = await this.#prisma.coachConversation.findUnique({ where: { athleteId }, select: { id: true, generation: true } });
    if (!conversation) return [];
    const rows = await this.#prisma.coachMessage.findMany({
      where: {
        athleteId,
        conversationId: conversation.id,
        generation: conversation.generation,
        turn: { is: { state: "completed" } },
      },
      orderBy: { sequence: "desc" },
      take: Math.min(Math.max(Number(limit) || 20, 1), 20),
    });
    return rows.reverse().map((row) => ({ role: row.role, text: row.text, topic: row.topic }));
  }

  async getTurn(scope, turnId) {
    const athleteId = assertAthleteScope(scope);
    const turn = await this.#prisma.coachTurn.findFirst({
      where: { athleteId, id: turnId },
      include: { messages: { where: { role: "user" }, take: 1, orderBy: { sequence: "asc" } } },
    });
    if (!turn) return null;
    const message = turn.messages[0] ?? null;
    return {
      id: turn.id,
      conversationId: turn.conversationId,
      generation: turn.generation,
      state: turn.state,
      attemptCount: turn.attemptCount,
      topic: turn.topic,
      contextFingerprint: turn.contextFingerprint,
      contextSnapshot: turn.contextSnapshot,
      safeErrorCode: turn.safeErrorCode,
      userMessage: message ? messageDto({ ...message, turn: { state: turn.state } }) : null,
      lastRetryId: turn.lastRetryId,
    };
  }

  async getTurnReplay(scope, input) {
    const athleteId = assertAthleteScope(scope);
    return this.#prisma.$transaction(async (tx) => {
      const conversation = await lockConversation(tx, athleteId);
      if (!conversation || conversation.generation !== input.expectedGeneration) return null;
      const turn = await tx.coachTurn.findFirst({ where: {
        athleteId, conversationId: conversation.id, generation: input.expectedGeneration,
        ...(input.clientTurnId ? { clientTurnId: input.clientTurnId } : { id: input.turnId, lastRetryId: input.retryId }),
      } });
      if (!turn) return null;
      const userMessage = await tx.coachMessage.findFirst({ where: { athleteId, turnId: turn.id, role: "user" } });
      const assistantMessage = await tx.coachMessage.findFirst({ where: { athleteId, turnId: turn.id, role: "assistant" } });
      return { kind: "replay", turn, userMessage, assistantMessage };
    });
  }

  async beginTurn(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const now = input.now ?? this.#now();
    const leaseToken = this.#newLeaseToken();
    return this.#prisma.$transaction(async (tx) => {
      await tx.coachConversation.upsert({ where: { athleteId }, update: { athleteId }, create: { athleteId } });
      const conversation = await lockConversation(tx, athleteId);
      const existing = await tx.coachTurn.findUnique({
        where: { conversationId_generation_clientTurnId: {
          conversationId: conversation.id,
          generation: input.expectedGeneration,
          clientTurnId: input.clientTurnId,
        } },
      });
      if (existing) {
        if (conversation.generation !== input.expectedGeneration) throw new CoachChatConflictError("This discussion has been archived. Reload before sending.");
        if (existing.requestHash !== input.requestHash) throw new CoachChatConflictError("This turn identity was already used with different content.");
        const userMessage = await tx.coachMessage.findFirst({ where: { athleteId, turnId: existing.id, role: "user" } });
        const assistantMessage = await tx.coachMessage.findFirst({ where: { athleteId, turnId: existing.id, role: "assistant" } });
        return { kind: "replay", turn: existing, userMessage, assistantMessage };
      }
      assertExpectedState(conversation, input.expectedGeneration, input.expectedSequence);
      await expireOrRejectProcessingTurn(tx, athleteId, conversation, now);
      const latestFailed = await tx.coachTurn.findFirst({
        where: { athleteId, conversationId: conversation.id, generation: conversation.generation, state: "failed" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (latestFailed) await tx.coachTurn.update({ where: { id: latestFailed.id }, data: { state: "abandoned", safeErrorCode: "ABANDONED_BY_NEW_MESSAGE", leaseToken: null, leaseExpiresAt: null } });
      await reserveUsage(tx, athleteId, now);
      const sequence = conversation.sequence + 1;
      const turn = await tx.coachTurn.create({ data: {
        athleteId,
        conversationId: conversation.id,
        generation: conversation.generation,
        clientTurnId: input.clientTurnId,
        requestHash: input.requestHash,
        topic: input.topic,
        contextFingerprint: input.contextFingerprint,
        contextSnapshot: input.contextSnapshot,
        state: "processing",
        attemptCount: 1,
        leaseToken,
        leaseExpiresAt: new Date(now.valueOf() + LEASE_MS),
        model: input.model ?? null,
      } });
      const userMessage = await tx.coachMessage.create({ data: {
        athleteId,
        conversationId: conversation.id,
        turnId: turn.id,
        generation: conversation.generation,
        sequence,
        role: "user",
        text: input.text,
        topic: input.topic,
        selectedRecordType: input.selectedRecord?.type ?? null,
        selectedRecordId: input.selectedRecord?.id ?? null,
      } });
      await tx.coachConversation.update({
        where: { id: conversation.id },
        data: {
          sequence,
          ...(input.topic === "reflect" && input.selectedRecord?.type === "activity" ? {
            lastReflectedActivityId: input.selectedRecord.id,
            lastReflectedActivityAt: input.reflectedActivityAt ? new Date(input.reflectedActivityAt) : null,
          } : {}),
        },
      });
      return { kind: "started", turn, userMessage, leaseToken };
    });
  }

  async retryTurn(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const now = input.now ?? this.#now();
    const retryHash = input.retryRequestHash;
    const leaseToken = this.#newLeaseToken();
    return this.#prisma.$transaction(async (tx) => {
      let turn = await tx.coachTurn.findFirst({ where: { id: input.turnId, athleteId } });
      if (!turn) throw new CoachChatNotFoundError();
      const conversation = await lockConversation(tx, athleteId, turn.conversationId);
      if (!conversation || turn.generation !== input.expectedGeneration || conversation.generation !== input.expectedGeneration) {
        throw new CoachChatConflictError("This conversation has been cleared. Reload it before retrying.");
      }
      turn = await tx.coachTurn.findFirst({ where: { id: input.turnId, athleteId } });
      if (!turn) throw new CoachChatNotFoundError();
      if (turn.lastRetryId === input.retryId) {
        if (turn.retryRequestHash !== retryHash) throw new CoachChatConflictError("This retry identity was already used with different context.");
        const userMessage = await tx.coachMessage.findFirst({ where: { athleteId, turnId: turn.id, role: "user" } });
        const assistantMessage = await tx.coachMessage.findFirst({ where: { athleteId, turnId: turn.id, role: "assistant" } });
        return { kind: "replay", turn, userMessage, assistantMessage };
      }
      if (turn.state === "processing" && turn.leaseExpiresAt && turn.leaseExpiresAt <= now) {
        await tx.coachTurn.update({ where: { id: turn.id }, data: { state: "failed", safeErrorCode: "LEASE_EXPIRED", leaseToken: null, leaseExpiresAt: null } });
        turn.state = "failed";
      }
      const latestTurn = await tx.coachTurn.findFirst({
        where: { athleteId, conversationId: conversation.id, generation: conversation.generation },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (latestTurn?.id !== turn.id || !["failed", "expired"].includes(turn.state) || turn.attemptCount !== input.expectedAttempt) {
        throw new CoachChatConflictError("Only the latest failed coaching turn can be retried.");
      }
      await reserveUsage(tx, athleteId, now);
      const updated = await tx.coachTurn.update({
        where: { id: turn.id },
        data: {
          state: "processing",
          attemptCount: { increment: 1 },
          leaseToken,
          leaseExpiresAt: new Date(now.valueOf() + LEASE_MS),
          contextFingerprint: input.contextFingerprint,
          contextSnapshot: input.contextSnapshot,
          safeErrorCode: null,
          lastRetryId: input.retryId,
          retryRequestHash: retryHash,
          model: input.model ?? turn.model,
        },
      });
      const userMessage = await tx.coachMessage.findFirst({ where: { athleteId, turnId: turn.id, role: "user" } });
      return { kind: "started", turn: updated, userMessage, leaseToken };
    });
  }

  async completeTurn(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const now = input.now ?? this.#now();
    return this.#prisma.$transaction(async (tx) => {
      let turn = await tx.coachTurn.findFirst({ where: { id: input.turnId, athleteId } });
      if (!turn) return { kind: "stale" };
      const conversation = await lockConversation(tx, athleteId, turn.conversationId);
      turn = await tx.coachTurn.findFirst({ where: { id: input.turnId, athleteId } });
      if (!turn) return { kind: "stale" };
      if (!conversation || conversation.generation !== turn.generation || turn.state !== "processing"
        || turn.attemptCount !== input.attempt || turn.leaseToken !== input.leaseToken) return { kind: "stale" };
      if (turn.contextFingerprint !== input.currentFingerprint) {
        const failed = await tx.coachTurn.update({ where: { id: turn.id }, data: {
          state: "failed", safeErrorCode: "CONTEXT_CHANGED", leaseToken: null, leaseExpiresAt: null,
          providerRequestId: input.metadata?.requestId ?? null,
          providerInputTokens: input.metadata?.inputTokens ?? null,
          providerOutputTokens: input.metadata?.outputTokens ?? null,
          providerLatencyMs: input.metadata?.latencyMs ?? null,
        } });
        await recordTokens(tx, athleteId, turn.createdAt, input.metadata);
        return { kind: "context-changed", turn: failed };
      }
      const assistantMessage = await tx.coachMessage.create({ data: {
        athleteId,
        conversationId: conversation.id,
        turnId: turn.id,
        generation: conversation.generation,
        sequence: conversation.sequence + 1,
        role: "assistant",
        text: input.text,
        topic: turn.topic,
        selectedRecordType: input.selectedRecordType ?? null,
        selectedRecordId: input.selectedRecordId ?? null,
      } });
      await tx.coachConversation.update({ where: { id: conversation.id }, data: { sequence: conversation.sequence + 1 } });
      const completedTurn = await tx.coachTurn.update({ where: { id: turn.id }, data: {
        state: "completed", leaseToken: null, leaseExpiresAt: null, safeErrorCode: null, completedAt: now,
        providerRequestId: input.metadata?.requestId ?? null,
        providerInputTokens: input.metadata?.inputTokens ?? null,
        providerOutputTokens: input.metadata?.outputTokens ?? null,
        providerLatencyMs: input.metadata?.latencyMs ?? null,
      } });
      await recordTokens(tx, athleteId, turn.createdAt, input.metadata);
      return { kind: "completed", turn: completedTurn, assistantMessage };
    });
  }

  async failTurn(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const now = input.now ?? this.#now();
    return this.#prisma.$transaction(async (tx) => {
      let turn = await tx.coachTurn.findFirst({ where: { id: input.turnId, athleteId } });
      if (!turn) return { kind: "stale" };
      const conversation = await lockConversation(tx, athleteId, turn.conversationId);
      turn = await tx.coachTurn.findFirst({ where: { id: input.turnId, athleteId } });
      if (!turn) return { kind: "stale" };
      if (!conversation || conversation.generation !== turn.generation || turn.state !== "processing"
        || turn.attemptCount !== input.attempt || turn.leaseToken !== input.leaseToken) return { kind: "stale" };
      const failed = await tx.coachTurn.update({ where: { id: turn.id }, data: {
        state: "failed", safeErrorCode: input.safeErrorCode, leaseToken: null, leaseExpiresAt: null,
        providerRequestId: input.metadata?.requestId ?? null,
        providerInputTokens: input.metadata?.inputTokens ?? null,
        providerOutputTokens: input.metadata?.outputTokens ?? null,
        providerLatencyMs: input.metadata?.latencyMs ?? null,
      } });
      await recordTokens(tx, athleteId, turn.createdAt, input.metadata);
      return { kind: "failed", turn: failed };
    });
  }

  async archiveConversation(scope, input) {
    const athleteId = assertAthleteScope(scope);
    return this.#prisma.$transaction(async (tx) => {
      await tx.coachConversation.upsert({ where: { athleteId }, update: {}, create: { athleteId } });
      const conversation = await lockConversation(tx, athleteId);
      const replay = await tx.coachConversationArchive.findFirst({ where: { athleteId, requestId: input.requestId } });
      if (replay) {
        if (replay.generation !== input.expectedGeneration || replay.finalSequence !== input.expectedSequence) throw new CoachChatConflictError("This archive request was already used for another discussion.");
        return { archive: archiveDto(replay) };
      }
      assertExpectedState(conversation, input.expectedGeneration, input.expectedSequence);
      if (conversation.sequence === 0) return { archive: null };
      const first = await tx.coachMessage.findFirst({ where: { athleteId, conversationId: conversation.id, generation: conversation.generation, role: "user" }, orderBy: { sequence: "asc" } });
      if (!first) throw new CoachChatConflictError("The discussion could not be saved safely. Reload and try again.");
      const archive = await tx.coachConversationArchive.create({ data: {
        athleteId, conversationId: conversation.id, generation: conversation.generation,
        requestId: input.requestId, title: first.text.trim().replace(/\s+/gu, " ").slice(0, 80) || "Saved discussion",
        startedAt: first.createdAt, archivedAt: this.#now(), finalSequence: conversation.sequence,
      } });
      await tx.coachTurn.updateMany({ where: { athleteId, conversationId: conversation.id, generation: conversation.generation, state: "processing" },
        data: { state: "abandoned", safeErrorCode: "DISCUSSION_ARCHIVED", leaseToken: null, leaseExpiresAt: null } });
      await tx.coachConversation.update({ where: { id: conversation.id }, data: {
        generation: { increment: 1 }, sequence: 0, lastReflectedActivityId: null, lastReflectedActivityAt: null,
      } });
      return { archive: archiveDto(archive) };
    });
  }

  async listArchives(scope, { beforeGeneration = null } = {}) {
    const athleteId = assertAthleteScope(scope);
    const rows = await this.#prisma.coachConversationArchive.findMany({ where: { athleteId,
      ...(beforeGeneration ? { generation: { lt: beforeGeneration } } : {}) }, orderBy: { generation: "desc" }, take: 21 });
    const items = rows.slice(0, 20).map(archiveDto);
    return { items, nextBefore: rows.length > 20 ? items.at(-1).generation : null };
  }

  async getArchive(scope, archiveId, { beforeSequence = null } = {}) {
    const athleteId = assertAthleteScope(scope);
    const archive = await this.#prisma.coachConversationArchive.findFirst({ where: { id: archiveId, athleteId } });
    if (!archive) throw new CoachChatNotFoundError("The saved discussion was not found.");
    const rows = await this.#prisma.coachMessage.findMany({ where: {
      athleteId, conversationId: archive.conversationId, generation: archive.generation,
      ...(beforeSequence ? { sequence: { lt: beforeSequence } } : {}),
    }, include: { turn: { select: { state: true } } }, orderBy: { sequence: "desc" }, take: 41 });
    const page = rows.slice(0, 40).reverse();
    return { archive: archiveDto(archive), messages: page.map(messageDto), hasOlder: rows.length > 40, oldestSequence: page[0]?.sequence ?? null };
  }

  async clearHistory(scope, input) {
    const athleteId = assertAthleteScope(scope);
    return this.#prisma.$transaction(async (tx) => {
      await tx.coachConversation.upsert({ where: { athleteId }, update: {}, create: { athleteId } });
      const conversation = await lockConversation(tx, athleteId);
      assertExpectedState(conversation, input.expectedGeneration, input.expectedSequence);
      await tx.coachTurn.deleteMany({ where: { athleteId, conversationId: conversation.id } });
      await tx.coachConversationArchive.deleteMany({ where: { athleteId, conversationId: conversation.id } });
      const cleared = await tx.coachConversation.update({
        where: { id: conversation.id },
        data: {
          generation: { increment: 1 },
          sequence: 0,
          lastReflectedActivityId: null,
          lastReflectedActivityAt: null,
        },
      });
      return { generation: cleared.generation, sequence: cleared.sequence };
    });
  }
}

async function lockConversation(tx, athleteId, conversationId = null) {
  const rows = conversationId
    ? await tx.$queryRaw`SELECT "id" FROM "coach_conversations" WHERE "athleteId" = ${athleteId} AND "id" = ${conversationId} FOR UPDATE`
    : await tx.$queryRaw`SELECT "id" FROM "coach_conversations" WHERE "athleteId" = ${athleteId} FOR UPDATE`;
  if (!rows.length) return null;
  return tx.coachConversation.findUnique({ where: { athleteId } });
}

function assertExpectedState(conversation, generation, sequence) {
  if (conversation.generation !== generation || conversation.sequence !== sequence) {
    throw new CoachChatConflictError("The conversation changed in another tab. Reload before continuing.");
  }
}

async function expireOrRejectProcessingTurn(tx, athleteId, conversation, now) {
  const pending = await tx.coachTurn.findFirst({
    where: { athleteId, conversationId: conversation.id, generation: conversation.generation, state: "processing" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!pending) return;
  if (pending.leaseExpiresAt && pending.leaseExpiresAt <= now) {
    await tx.coachTurn.update({ where: { id: pending.id }, data: { state: "failed", safeErrorCode: "LEASE_EXPIRED", leaseToken: null, leaseExpiresAt: null } });
    return;
  }
  throw new CoachChatConflictError("A coaching reply is already being generated.");
}

async function reserveUsage(tx, athleteId, now) {
  const minuteStart = new Date(Math.floor(now.valueOf() / 60_000) * 60_000);
  const minuteEnd = new Date(minuteStart.valueOf() + 60_000);
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.valueOf() + 24 * 60 * 60_000);
  const minute = await reserveBucket(tx, athleteId, "minute", minuteStart, minuteEnd);
  const day = await reserveBucket(tx, athleteId, "day", dayStart, dayEnd);
  if (minute.attemptCount > MAX_PER_MINUTE) throw new CoachChatRateLimitError(Math.ceil((minuteEnd.valueOf() - now.valueOf()) / 1_000));
  if (day.attemptCount > MAX_PER_DAY) throw new CoachChatRateLimitError(Math.ceil((dayEnd.valueOf() - now.valueOf()) / 1_000));
}

async function reserveBucket(tx, athleteId, windowKind, windowStart, windowEnd) {
  return tx.coachUsageBucket.upsert({
    where: { athleteId_windowKind_windowStart: { athleteId, windowKind, windowStart } },
    create: { athleteId, windowKind, windowStart, windowEnd, attemptCount: 1 },
    update: { attemptCount: { increment: 1 } },
  });
}

async function recordTokens(tx, athleteId, createdAt, metadata) {
  if (!metadata) return;
  const minuteStart = new Date(Math.floor(createdAt.valueOf() / 60_000) * 60_000);
  const dayStart = new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate()));
  const inputTokens = BigInt(Number.isInteger(metadata.inputTokens) && metadata.inputTokens > 0 ? metadata.inputTokens : 0);
  const outputTokens = BigInt(Number.isInteger(metadata.outputTokens) && metadata.outputTokens > 0 ? metadata.outputTokens : 0);
  for (const [windowKind, windowStart] of [["minute", minuteStart], ["day", dayStart]]) {
    await tx.coachUsageBucket.updateMany({
      where: { athleteId, windowKind, windowStart },
      data: { inputTokens: { increment: inputTokens }, outputTokens: { increment: outputTokens } },
    });
  }
}

function messageDto(row) {
  return {
    id: row.id,
    sequence: row.sequence,
    generation: row.generation,
    role: row.role,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    topic: row.topic ?? null,
    selectedRecord: row.selectedRecordType && row.selectedRecordId
      ? { type: row.selectedRecordType, id: row.selectedRecordId }
      : null,
    turnState: row.turn?.state ?? null,
  };
}

function turnStateDto(turn, messageSaved) {
  return {
    id: turn.id,
    state: turn.state,
    attempt: turn.attemptCount,
    safeErrorCode: turn.safeErrorCode ?? null,
    messageSaved,
    retryable: ["failed", "expired"].includes(turn.state),
  };
}

function archiveDto(row) {
  return { id: row.id, generation: row.generation, title: row.title, startedAt: row.startedAt.toISOString(), archivedAt: row.archivedAt.toISOString(), finalSequence: row.finalSequence };
}

function emptyConversation() {
  return { generation: 1, sequence: 0, messages: [], hasOlder: false, oldestSequence: null, currentTurn: null };
}
