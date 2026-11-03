import { randomUUID } from "node:crypto";
import { assertAthleteScope } from "./athlete-scope.js";

const MONTHLY_ALLOWANCE = 5_000_000n;
const SESSION_RESERVATION = 350_000n;
const SESSION_LIFETIME_MS = 30 * 60_000;
const SESSION_LEASE_MS = 90_000;
const ATTEMPT_LEASE_MS = 100_000;
const MAX_SESSIONS_PER_MINUTE = 6;
const MAX_SESSIONS_PER_DAY = 60;
const MAX_CHUNKS_PER_MINUTE = 12;
const MAX_CHUNKS = 90;
const MAX_DURATION_SECONDS = 900;
const MICRO_USD_PER_AUDIO_MINUTE = 10_000;

export class CoachProgressiveLimitError extends Error {
  constructor(code = "VOICE_RATE_LIMITED", retryAfterSeconds = 60) { super("The dictation session limit has been reached. Try again later."); this.name = "CoachProgressiveLimitError"; this.code = code; this.retryAfterSeconds = retryAfterSeconds; }
}
export class CoachProgressiveConflictError extends Error {
  constructor(code = "VOICE_CONTEXT_CHANGED") { super("The dictation session is no longer active for this conversation."); this.name = "CoachProgressiveConflictError"; this.code = code; }
}
export class CoachProgressiveBudgetError extends Error {
  constructor() { super("The monthly voice allowance has been reached. Text coaching remains available."); this.name = "CoachProgressiveBudgetError"; this.code = "VOICE_BUDGET_EXHAUSTED"; }
}

/** Content-free session and attempt admission. Audio and transcript data never enter this repository. */
export class PrismaCoachProgressiveDictationRepository {
  #prisma; #now; #newId;
  constructor({ prisma, now = () => new Date(), newId = randomUUID }) {
    if (!prisma?.coachProgressiveDictationSession || !prisma?.coachVoiceAttempt || !prisma?.coachVoiceUsageBucket || typeof prisma.$transaction !== "function") throw new Error("A Prisma progressive dictation client is required");
    this.#prisma = prisma; this.#now = now; this.#newId = newId;
  }

  async createSession(scope, binding) {
    const athleteId = assertAthleteScope(scope), now = binding.now ?? this.#now();
    return this.#prisma.$transaction(async (tx) => {
      await lock(tx, athleteId);
      await this.#expireAndSettle(tx, athleteId, now);
      const active = await tx.coachProgressiveDictationSession.findFirst({ where: { athleteId, state: "active", leaseExpiresAt: { gt: now }, expiresAt: { gt: now } }, select: { id: true } });
      if (active) throw new CoachProgressiveConflictError("VOICE_OPERATION_BUSY");
      const minuteStart = floorMinute(now), minuteEnd = new Date(minuteStart.valueOf() + 60_000);
      const dayStart = floorDay(now), dayEnd = new Date(dayStart.valueOf() + 86_400_000);
      const monthStart = floorMonth(now), monthEnd = nextMonth(monthStart);
      const minute = await ensureBucket(tx, athleteId, "minute", minuteStart, minuteEnd, now);
      const day = await ensureBucket(tx, athleteId, "day", dayStart, dayEnd, now);
      const month = await ensureBucket(tx, athleteId, "month", monthStart, monthEnd, now);
      if (minute.attemptCount >= MAX_SESSIONS_PER_MINUTE) throw new CoachProgressiveLimitError("VOICE_RATE_LIMITED", ceilSeconds(minuteEnd, now));
      if (day.attemptCount >= MAX_SESSIONS_PER_DAY) throw new CoachProgressiveLimitError("VOICE_RATE_LIMITED", ceilSeconds(dayEnd, now));
      if (BigInt(month.reservedMicroUsd) + SESSION_RESERVATION > MONTHLY_ALLOWANCE) throw new CoachProgressiveBudgetError();
      const session = await tx.coachProgressiveDictationSession.create({ data: {
        id: this.#newId(), athleteId, conversationId: binding.conversationId ?? null, generation: binding.generation, sequence: binding.sequence,
        topic: binding.topic, selectedRecordType: binding.selectedRecord?.type ?? null, selectedRecordId: binding.selectedRecord?.id ?? null,
        contextFingerprint: binding.contextFingerprint, state: "active", expiresAt: new Date(now.valueOf() + SESSION_LIFETIME_MS),
        leaseExpiresAt: new Date(now.valueOf() + SESSION_LEASE_MS), admissionMonthStart: monthStart,
        reservedMicroUsd: SESSION_RESERVATION, chargedMicroUsd: 0n, capturedSeconds: 0, admittedChunks: 0, createdAt: now, updatedAt: now,
      } });
      await incrementBucket(tx, athleteId, "minute", minuteStart, SESSION_RESERVATION, now);
      await incrementBucket(tx, athleteId, "day", dayStart, SESSION_RESERVATION, now);
      await incrementBucket(tx, athleteId, "month", monthStart, SESSION_RESERVATION, now);
      return session;
    });
  }

  async heartbeat(scope, sessionId, now = this.#now()) {
    const athleteId = assertAthleteScope(scope);
    const session = await this.#prisma.$transaction(async (tx) => {
      await lock(tx, athleteId);
      await this.#expireAndSettle(tx, athleteId, now);
      const current = await tx.coachProgressiveDictationSession.findFirst({ where: { id: sessionId, athleteId, state: "active", expiresAt: { gt: now }, leaseExpiresAt: { gt: now } } });
      if (!current) return null;
      return tx.coachProgressiveDictationSession.update({ where: { id: current.id }, data: { leaseExpiresAt: new Date(Math.min(current.expiresAt.valueOf(), now.valueOf() + SESSION_LEASE_MS)), updatedAt: now } });
    });
    if (!session) throw new CoachProgressiveConflictError("VOICE_SESSION_EXPIRED");
    return session;
  }

  async getActiveSession(scope, sessionId, now = this.#now()) {
    const athleteId = assertAthleteScope(scope);
    const session = await this.#prisma.$transaction(async (tx) => {
      await lock(tx, athleteId);
      await this.#expireAndSettle(tx, athleteId, now);
      return tx.coachProgressiveDictationSession.findFirst({ where: { id: sessionId, athleteId, state: "active", expiresAt: { gt: now }, leaseExpiresAt: { gt: now } } });
    });
    if (!session) throw new CoachProgressiveConflictError("VOICE_SESSION_EXPIRED");
    return session;
  }

  async admitChunk(scope, sessionId, input) {
    const athleteId = assertAthleteScope(scope), now = input.now ?? this.#now();
    if (!input.attemptId || !Number.isInteger(input.chunkIndex) || ![0, 1].includes(input.retryOrdinal)) throw new TypeError("Invalid progressive chunk admission");
    const duration = Number(input.audioDurationSeconds), capturedSeconds = Number(input.capturedEndSeconds);
    const amount = BigInt(Math.max(1, Math.ceil(duration * MICRO_USD_PER_AUDIO_MINUTE / 60)));
    if (!Number.isFinite(duration) || duration <= 0 || duration > 31 || !Number.isFinite(capturedSeconds) || capturedSeconds <= 0 || capturedSeconds > MAX_DURATION_SECONDS) throw new TypeError("Invalid progressive chunk duration");
    return this.#prisma.$transaction(async (tx) => {
      await lock(tx, athleteId);
      await this.#expireAndSettle(tx, athleteId, now);
      const session = await tx.coachProgressiveDictationSession.findFirst({ where: { id: sessionId, athleteId, state: "active", expiresAt: { gt: now }, leaseExpiresAt: { gt: now } } });
      if (!session) throw new CoachProgressiveConflictError("VOICE_SESSION_EXPIRED");
      const duplicateId = await tx.coachVoiceAttempt.findUnique({ where: { athleteId_operationId: { athleteId, operationId: input.attemptId } } });
      if (duplicateId) throw new CoachProgressiveConflictError("VOICE_OPERATION_CONFLICT");
      const prior = await tx.coachVoiceAttempt.findFirst({ where: { athleteId, sessionId, chunkIndex: input.chunkIndex, retryOrdinal: input.retryOrdinal }, select: { id: true } });
      if (prior) throw new CoachProgressiveConflictError("VOICE_OPERATION_CONFLICT");
      if (input.retryOrdinal === 0) {
        if (input.chunkIndex !== session.admittedChunks || session.admittedChunks >= MAX_CHUNKS) throw new CoachProgressiveLimitError("VOICE_CHUNK_LIMIT", 60);
        const intervalStart = Number(input.capturedStartSeconds);
        const expectedStart = session.capturedSeconds;
        if (!Number.isFinite(intervalStart) || intervalStart < 0 || intervalStart > MAX_DURATION_SECONDS
          || intervalStart < expectedStart - 0.1 || capturedSeconds <= intervalStart
          || capturedSeconds - intervalStart > 30.1 || capturedSeconds > MAX_DURATION_SECONDS) throw new CoachProgressiveConflictError("VOICE_CAPTURE_INTERVAL_INVALID");
      } else {
        const original = await tx.coachVoiceAttempt.findFirst({ where: { athleteId, sessionId, chunkIndex: input.chunkIndex, retryOrdinal: 0 } });
        if (!original || !["completed", "failed", "expired"].includes(original.state)) throw new CoachProgressiveConflictError("VOICE_RETRY_NOT_ALLOWED");
      }
      const active = await tx.coachVoiceAttempt.findFirst({ where: { athleteId, state: "processing", leaseExpiresAt: { gt: now } }, select: { id: true } });
      if (active) throw new CoachProgressiveConflictError("VOICE_OPERATION_BUSY");
      const chunkMinuteStart = floorMinute(now), chunkMinuteEnd = new Date(chunkMinuteStart.valueOf() + 60_000);
      const chunkMinute = await ensureBucket(tx, athleteId, "chunk_minute", chunkMinuteStart, chunkMinuteEnd, now);
      if (chunkMinute.attemptCount >= MAX_CHUNKS_PER_MINUTE) throw new CoachProgressiveLimitError("VOICE_CHUNK_RATE_LIMITED", ceilSeconds(chunkMinuteEnd, now));
      const charged = BigInt(session.chargedMicroUsd) + amount;
      if (charged > BigInt(session.reservedMicroUsd)) throw new CoachProgressiveBudgetError();
      const attempt = await tx.coachVoiceAttempt.create({ data: {
        id: this.#newId(), athleteId, operationId: input.attemptId, kind: "transcription", model: "whisper-1", state: "processing",
        inputUnits: Math.max(1, Math.ceil(duration)), reservedMicroUsd: amount, leaseExpiresAt: new Date(now.valueOf() + ATTEMPT_LEASE_MS),
        sessionId, chunkIndex: input.chunkIndex, retryOrdinal: input.retryOrdinal, createdAt: now, updatedAt: now,
      } });
      await tx.coachProgressiveDictationSession.update({ where: { id: session.id }, data: {
        chargedMicroUsd: charged, capturedSeconds: input.retryOrdinal === 0 ? Math.max(session.capturedSeconds, capturedSeconds) : session.capturedSeconds,
        admittedChunks: input.retryOrdinal === 0 ? session.admittedChunks + 1 : session.admittedChunks, updatedAt: now,
      } });
      await incrementBucket(tx, athleteId, "chunk_minute", chunkMinuteStart, 0n, now);
      return attempt;
    });
  }

  async completeChunk(scope, attemptId, { state, latencyMs = null, safeErrorCode = null, now = this.#now() }) {
    const athleteId = assertAthleteScope(scope);
    if (!["completed", "failed"].includes(state)) throw new TypeError("Invalid progressive attempt state");
    return this.#prisma.$transaction(async (tx) => {
      await lock(tx, athleteId);
      await this.#expireAndSettle(tx, athleteId, now);
      const attempt = await tx.coachVoiceAttempt.findUnique({ where: { athleteId_operationId: { athleteId, operationId: attemptId } } });
      if (!attempt?.sessionId || attempt.state !== "processing") return false;
      const session = await tx.coachProgressiveDictationSession.findFirst({ where: { id: attempt.sessionId, athleteId, state: "active", expiresAt: { gt: now }, leaseExpiresAt: { gt: now } } });
      if (!session || !attempt.leaseExpiresAt || attempt.leaseExpiresAt <= now) {
        await tx.coachVoiceAttempt.updateMany({ where: { athleteId, operationId: attemptId, state: "processing" }, data: { state: "expired", safeErrorCode: "VOICE_ATTEMPT_EXPIRED", leaseExpiresAt: null, completedAt: now, updatedAt: now } });
        return false;
      }
      const result = await tx.coachVoiceAttempt.updateMany({ where: { athleteId, operationId: attemptId, sessionId: session.id, state: "processing", leaseExpiresAt: { gt: now } }, data: { state, latencyMs: Number.isSafeInteger(latencyMs) ? Math.max(0, latencyMs) : null, safeErrorCode, leaseExpiresAt: null, completedAt: now, updatedAt: now } });
      return result.count > 0;
    });
  }

  async closeSession(scope, sessionId, { cancel = false, now = this.#now() } = {}) {
    const athleteId = assertAthleteScope(scope);
    return this.#prisma.$transaction(async (tx) => {
      await lock(tx, athleteId);
      const session = await tx.coachProgressiveDictationSession.findFirst({ where: { id: sessionId, athleteId } });
      if (!session) return { closed: true, remainingAllowanceMicroUsd: await remaining(tx, athleteId, session?.admissionMonthStart ?? floorMonth(now)) };
      if (session.state !== "active") return { closed: true, remainingAllowanceMicroUsd: await remaining(tx, athleteId, session.admissionMonthStart) };
      const unused = BigInt(session.reservedMicroUsd) - BigInt(session.chargedMicroUsd);
      if (unused > 0n) await releaseSessionReserve(tx, athleteId, session, unused, now);
      await tx.coachProgressiveDictationSession.update({ where: { id: session.id }, data: { state: cancel ? "cancelled" : "closed", leaseExpiresAt: now, completedAt: now, updatedAt: now } });
      return { closed: true, remainingAllowanceMicroUsd: await remaining(tx, athleteId, session.admissionMonthStart) };
    });
  }

  async remainingAllowance(scope, now = this.#now()) {
    const athleteId = assertAthleteScope(scope);
    return this.#prisma.$transaction(async (tx) => {
      await lock(tx, athleteId);
      await this.#expireAndSettle(tx, athleteId, now);
      return remaining(tx, athleteId, floorMonth(now));
    });
  }

  async #expireAndSettle(tx, athleteId, now) {
    await tx.coachVoiceAttempt.updateMany({ where: { athleteId, state: "processing", leaseExpiresAt: { lte: now } }, data: { state: "expired", safeErrorCode: "VOICE_ATTEMPT_EXPIRED", leaseExpiresAt: null, completedAt: now, updatedAt: now } });
    const expired = await tx.coachProgressiveDictationSession.findMany({ where: { athleteId, state: "active", OR: [{ expiresAt: { lte: now } }, { leaseExpiresAt: { lte: now } }] } });
    for (const session of expired) {
      const unused = BigInt(session.reservedMicroUsd) - BigInt(session.chargedMicroUsd);
      if (unused > 0n) await releaseSessionReserve(tx, athleteId, session, unused, now);
      await tx.coachProgressiveDictationSession.update({ where: { id: session.id }, data: { state: "expired", leaseExpiresAt: now, completedAt: now, updatedAt: now } });
    }
  }
}

async function lock(tx, athleteId) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${athleteId}), hashtext('coach-voice'))`; }
async function ensureBucket(tx, athleteId, windowKind, windowStart, windowEnd, now) {
  return tx.coachVoiceUsageBucket.upsert({ where: { athleteId_windowKind_windowStart: { athleteId, windowKind, windowStart } }, create: { id: randomUUID(), athleteId, windowKind, windowStart, windowEnd, attemptCount: 0, reservedMicroUsd: 0n, createdAt: now, updatedAt: now }, update: { updatedAt: now } });
}
async function incrementBucket(tx, athleteId, kind, start, amount, now) {
  await tx.coachVoiceUsageBucket.update({ where: { athleteId_windowKind_windowStart: { athleteId, windowKind: kind, windowStart: start } }, data: { attemptCount: { increment: 1 }, ...(amount ? { reservedMicroUsd: { increment: amount } } : {}), updatedAt: now } });
}
async function adjustMonthBucket(tx, athleteId, monthStart, amount, now) {
  await tx.coachVoiceUsageBucket.update({ where: { athleteId_windowKind_windowStart: { athleteId, windowKind: "month", windowStart: monthStart } }, data: { reservedMicroUsd: { decrement: amount }, updatedAt: now } });
}
async function releaseSessionReserve(tx, athleteId, session, amount, now) {
  await tx.coachVoiceUsageBucket.update({ where: { athleteId_windowKind_windowStart: { athleteId, windowKind: "minute", windowStart: floorMinute(session.createdAt) } }, data: { reservedMicroUsd: { decrement: amount }, updatedAt: now } });
  await tx.coachVoiceUsageBucket.update({ where: { athleteId_windowKind_windowStart: { athleteId, windowKind: "day", windowStart: floorDay(session.createdAt) } }, data: { reservedMicroUsd: { decrement: amount }, updatedAt: now } });
  await adjustMonthBucket(tx, athleteId, session.admissionMonthStart, amount, now);
}
async function remaining(tx, athleteId, monthStart) {
  const bucket = await tx.coachVoiceUsageBucket.findUnique({ where: { athleteId_windowKind_windowStart: { athleteId, windowKind: "month", windowStart: monthStart } }, select: { reservedMicroUsd: true } });
  const reserved = BigInt(bucket?.reservedMicroUsd ?? 0n);
  return Number(reserved >= MONTHLY_ALLOWANCE ? 0n : MONTHLY_ALLOWANCE - reserved);
}
function floorMinute(now) { return new Date(Math.floor(now.valueOf() / 60_000) * 60_000); }
function floorDay(now) { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); }
function floorMonth(now) { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); }
function nextMonth(monthStart) { return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)); }
function ceilSeconds(end, now) { return Math.max(1, Math.ceil((end.valueOf() - now.valueOf()) / 1_000)); }
