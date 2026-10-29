import { randomUUID } from "node:crypto";
import { assertAthleteScope } from "./athlete-scope.js";

const MONTHLY_ALLOWANCE_MICRO_USD = 5_000_000n;
const MAX_PER_MINUTE = 6;
const MAX_PER_DAY = 60;
const ACTIVE_LEASE_MS = 30_000;

export class CoachVoiceConflictError extends Error {
  constructor(message = "The voice operation was already used. Start a new operation to retry.") {
    super(message); this.name = "CoachVoiceConflictError"; this.code = "VOICE_OPERATION_CONFLICT";
  }
}
export class CoachVoiceBusyError extends Error {
  constructor() { super("A voice operation is already in progress for this athlete."); this.name = "CoachVoiceBusyError"; this.code = "VOICE_OPERATION_BUSY"; }
}
export class CoachVoiceRateLimitError extends Error {
  constructor(retryAfterSeconds) { super("The voice request limit has been reached. Try again later."); this.name = "CoachVoiceRateLimitError"; this.code = "VOICE_RATE_LIMITED"; this.retryAfterSeconds = retryAfterSeconds; }
}
export class CoachVoiceBudgetError extends Error {
  constructor() { super("The monthly voice allowance has been reached. Text coaching remains available."); this.name = "CoachVoiceBudgetError"; this.code = "VOICE_BUDGET_EXHAUSTED"; }
}

export class PrismaCoachVoiceRepository {
  #prisma;
  #now;
  #newId;

  constructor({ prisma, now = () => new Date(), newId = randomUUID }) {
    if (!prisma?.coachVoiceAttempt || !prisma?.coachVoiceUsageBucket || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma coach voice client is required");
    }
    this.#prisma = prisma; this.#now = now; this.#newId = newId;
  }

  async reserve(scope, input) {
    const athleteId = assertAthleteScope(scope);
    const now = input.now ?? this.#now();
    const units = Math.trunc(input.inputUnits);
    const amount = BigInt(input.reservedMicroUsd);
    if (!input.operationId || !["transcription", "speech"].includes(input.kind)
      || !input.model || !Number.isSafeInteger(units) || units < 1 || amount < 1n) {
      throw new TypeError("Invalid content-free coach voice reservation");
    }
    const minuteStart = new Date(Math.floor(now.valueOf() / 60_000) * 60_000);
    const minuteEnd = new Date(minuteStart.valueOf() + 60_000);
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEnd = new Date(dayStart.valueOf() + 86_400_000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    return this.#prisma.$transaction(async (tx) => {
      // A database transaction lock serializes admissions across workers, tabs and UTC month rollovers.
      // The lock returns PostgreSQL void; execute it without decoding a result column.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${athleteId}), hashtext('coach-voice'))`;
      const existing = await tx.coachVoiceAttempt.findUnique({ where: { athleteId_operationId: { athleteId, operationId: input.operationId } } });
      if (existing) throw new CoachVoiceConflictError();

      await tx.coachVoiceAttempt.updateMany({
        where: { athleteId, state: "processing", leaseExpiresAt: { lte: now } },
        data: { state: "expired", safeErrorCode: "VOICE_LEASE_EXPIRED", leaseExpiresAt: null, completedAt: now, updatedAt: now },
      });
      const active = await tx.coachVoiceAttempt.findFirst({ where: { athleteId, state: "processing", leaseExpiresAt: { gt: now } }, select: { id: true } });
      if (active) throw new CoachVoiceBusyError();

      const minute = await ensureBucket(tx, athleteId, "minute", minuteStart, minuteEnd, now);
      if (minute.attemptCount >= MAX_PER_MINUTE) throw new CoachVoiceRateLimitError(ceilSeconds(minuteEnd, now));
      const day = await ensureBucket(tx, athleteId, "day", dayStart, dayEnd, now);
      if (day.attemptCount >= MAX_PER_DAY) throw new CoachVoiceRateLimitError(ceilSeconds(dayEnd, now));
      const month = await ensureBucket(tx, athleteId, "month", monthStart, monthEnd, now);
      if (BigInt(month.reservedMicroUsd) + amount > MONTHLY_ALLOWANCE_MICRO_USD) {
        throw new CoachVoiceBudgetError(Number(MONTHLY_ALLOWANCE_MICRO_USD - BigInt(month.reservedMicroUsd)));
      }

      const attempt = await tx.coachVoiceAttempt.create({ data: {
        id: this.#newId(), athleteId, operationId: input.operationId,
        kind: input.kind, model: input.model, state: "processing", inputUnits: units,
        reservedMicroUsd: amount, leaseExpiresAt: new Date(now.valueOf() + ACTIVE_LEASE_MS),
        createdAt: now, updatedAt: now,
      } });
      for (const [kind, start, end] of [["minute", minuteStart, minuteEnd], ["day", dayStart, dayEnd], ["month", monthStart, monthEnd]]) {
        await tx.coachVoiceUsageBucket.update({
          where: { athleteId_windowKind_windowStart: { athleteId, windowKind: kind, windowStart: start } },
          data: { attemptCount: { increment: 1 }, reservedMicroUsd: { increment: amount }, updatedAt: now },
        });
      }
      return attempt;
    });
  }

  async complete(scope, operationId, { state, latencyMs = null, safeErrorCode = null, now = this.#now() }) {
    const athleteId = assertAthleteScope(scope);
    if (!["completed", "failed"].includes(state)) throw new TypeError("Invalid coach voice completion state");
    const result = await this.#prisma.coachVoiceAttempt.updateMany({
      where: { athleteId, operationId, state: "processing", leaseExpiresAt: { gt: now } },
      data: { state, latencyMs: Number.isSafeInteger(latencyMs) ? Math.max(0, latencyMs) : null,
        safeErrorCode, leaseExpiresAt: null, completedAt: now, updatedAt: now },
    });
    if (result.count > 0) return true;
    await this.#prisma.coachVoiceAttempt.updateMany({
      where: { athleteId, operationId, state: "processing", leaseExpiresAt: { lte: now } },
      data: { state: "expired", safeErrorCode: "VOICE_LEASE_EXPIRED", leaseExpiresAt: null, completedAt: now, updatedAt: now },
    });
    return false;
  }

  async remainingAllowance(scope, now = this.#now()) {
    const athleteId = assertAthleteScope(scope);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const bucket = await this.#prisma.coachVoiceUsageBucket.findUnique({
      where: { athleteId_windowKind_windowStart: { athleteId, windowKind: "month", windowStart: monthStart } },
      select: { reservedMicroUsd: true },
    });
    const reserved = BigInt(bucket?.reservedMicroUsd ?? 0n);
    return Number(reserved >= MONTHLY_ALLOWANCE_MICRO_USD ? 0n : MONTHLY_ALLOWANCE_MICRO_USD - reserved);
  }
}

async function ensureBucket(tx, athleteId, windowKind, windowStart, windowEnd, now) {
  return tx.coachVoiceUsageBucket.upsert({
    where: { athleteId_windowKind_windowStart: { athleteId, windowKind, windowStart } },
    create: { id: randomUUID(), athleteId, windowKind, windowStart, windowEnd, attemptCount: 0, reservedMicroUsd: 0n, createdAt: now, updatedAt: now },
    update: { updatedAt: now },
  });
}

function ceilSeconds(end, now) { return Math.max(1, Math.ceil((end.valueOf() - now.valueOf()) / 1_000)); }
