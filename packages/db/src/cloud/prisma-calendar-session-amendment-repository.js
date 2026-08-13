import { createHash } from "node:crypto";
import { plannedWorkoutSchema } from "../../../core/src/contracts/coaching.ts";
import { buildCoachingReviewContext } from "../../../core/src/services/coaching-review-context.ts";
import { assertAthleteScope } from "./athlete-scope.js";
import { appendCalendarSessionSyncChange, parsePlanProjection } from "./training-plan-projection-lifecycle.js";

const EDITABLE_FIELDS = new Set([
  "title",
  "purpose",
  "prescription",
  "durationMinutes",
  "distanceMeters",
  "intensityRpe",
  "startTime",
  "cautions",
]);

export class CalendarSessionAmendmentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CalendarSessionAmendmentError";
    this.code = code;
  }
}

export class PrismaCalendarSessionAmendmentRepository {
  #prisma;
  #now;

  constructor({ prisma, now = () => new Date() }) {
    if (!prisma?.calendarSessionProjection
      || !prisma?.calendarSessionAmendment
      || !prisma?.trainingPlanProjection
      || typeof prisma.$transaction !== "function") {
      throw new Error("A Prisma calendar-session amendment client is required");
    }
    this.#prisma = prisma;
    this.#now = now;
  }

  async listActiveCalendar(scope, { from, to }) {
    try {
      const athleteId = assertAthleteScope(scope);
      const active = await activeProjection(this.#prisma, athleteId);
      if (!active) return [];
      const plan = safePlan(active, athleteId);
      const rows = await this.#prisma.calendarSessionProjection.findMany({
        where: { athleteId, planId: plan.id },
        orderBy: [{ sessionId: "asc" }],
        include: { amendments: { orderBy: [{ revision: "asc" }] } },
      });
      const projected = rows.length === plan.workouts.length
        ? rows.map(projectSession)
        : fallbackSessions(plan, rows);
      return projected.filter((session) => session.effectiveDate >= from && session.effectiveDate <= to);
    } catch (error) {
      if (!(error instanceof CalendarSessionAmendmentError)) reportProjectionReadFailure("calendar", error);
      throw error;
    }
  }

  async getActiveSession(scope, sessionId) {
    const athleteId = assertAthleteScope(scope);
    const normalizedSessionId = requiredString(sessionId, "sessionId");
    const active = await activeProjection(this.#prisma, athleteId);
    if (!active) return null;
    const plan = safePlan(active, athleteId);
    const row = await this.#prisma.calendarSessionProjection.findUnique({
      where: { athleteId_planId_sessionId: { athleteId, planId: plan.id, sessionId: normalizedSessionId } },
      include: { amendments: { orderBy: [{ revision: "asc" }] } },
    });
    if (row) return projectSession(row);
    const prescribed = plan.workouts.find((workout) => workout.id === normalizedSessionId);
    return prescribed ? fallbackSession(plan, prescribed) : null;
  }

  async listHistory(scope, sessionId) {
    const athleteId = assertAthleteScope(scope);
    const normalizedSessionId = requiredString(sessionId, "sessionId");
    const active = await activeProjection(this.#prisma, athleteId);
    if (!active) throw new CalendarSessionAmendmentError("SESSION_NOT_FOUND", "Active plan session was not found");
    const plan = safePlan(active, athleteId);
    const session = await this.#prisma.calendarSessionProjection.findUnique({
      where: { athleteId_planId_sessionId: { athleteId, planId: plan.id, sessionId: normalizedSessionId } },
    });
    if (!session) throw new CalendarSessionAmendmentError("SESSION_NOT_FOUND", "Active plan session was not found");
    const rows = await this.#prisma.calendarSessionAmendment.findMany({
      where: { athleteId, planId: plan.id, sessionId: normalizedSessionId },
      orderBy: [{ revision: "asc" }],
      take: 100,
    });
    return rows.map(projectAmendment);
  }

  async getReviewContext(scope) {
    try {
      const athleteId = assertAthleteScope(scope);
      if (scope.actor.credentialKind !== "session") {
        throw new CalendarSessionAmendmentError("SESSION_REQUIRED", "A signed-in owner session is required");
      }
      const active = await activeProjection(this.#prisma, athleteId);
      if (!active) return null;
      const plan = safePlan(active, athleteId);
      const rows = await this.#prisma.calendarSessionProjection.findMany({
        where: { athleteId, planId: plan.id },
        orderBy: [{ sessionId: "asc" }],
        include: { amendments: { orderBy: [{ revision: "asc" }] } },
      });
      const rowBySessionId = new Map(rows.map((row) => [row.sessionId, row]));
      const generatedAt = this.#now();
      return buildCoachingReviewContext({
      athleteId,
      generatedAt: generatedAt.toISOString(),
      currentLocalDate: localDateInTimezone(generatedAt, plan.timezone),
      activePlan: {
        id: plan.id,
        version: plan.version,
        revision: plan.revision,
        contentHash: plan.approval.contentHash,
      },
        sessions: plan.workouts.map((prescribed) => {
          const row = rowBySessionId.get(prescribed.id);
          return {
            id: prescribed.id,
            prescribed: row ? plannedWorkoutSchema.parse(row.prescribedSession) : prescribed,
            effective: row ? plannedWorkoutSchema.parse(row.effectiveSession) : prescribed,
            status: row?.status ?? "upcoming",
            revision: row?.revision ?? plan.revision,
            amendments: (row?.amendments ?? []).map(projectReviewAmendment),
          };
        }),
      });
    } catch (error) {
      if (!(error instanceof CalendarSessionAmendmentError)) reportProjectionReadFailure("review-context", error);
      throw error;
    }
  }

  async amend(scope, sessionId, input) {
    const athleteId = assertAthleteScope(scope);
    if (scope.actor.credentialKind !== "session") {
      throw new CalendarSessionAmendmentError("SESSION_REQUIRED", "A signed-in owner session is required");
    }
    const normalizedSessionId = requiredString(sessionId, "sessionId");
    const request = normalizeRequest(input);
    const requestHash = hashRequest({ sessionId: normalizedSessionId, ...request });
    try {
      return await this.#prisma.$transaction(async (transaction) => {
        const replay = await transaction.calendarSessionAmendment.findUnique({
          where: { athleteId_idempotencyKey: { athleteId, idempotencyKey: request.idempotencyKey } },
        });
        if (replay) {
          if (replay.requestHash !== requestHash) {
            throw new CalendarSessionAmendmentError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different amendment");
          }
          const replayProjection = await transaction.calendarSessionProjection.findUnique({
            where: { athleteId_planId_sessionId: { athleteId, planId: replay.planId, sessionId: replay.sessionId } },
            include: { amendments: { orderBy: [{ revision: "asc" }] } },
          });
          return {
            session: replayProjection ? projectSession(replayProjection) : null,
            amendment: projectAmendment(replay),
            reused: true,
          };
        }

        const active = await activeProjection(transaction, athleteId);
        if (!active) throw new CalendarSessionAmendmentError("SESSION_NOT_FOUND", "Active plan session was not found");
        const plan = safePlan(active, athleteId);
        let row = await transaction.calendarSessionProjection.findUnique({
          where: { athleteId_planId_sessionId: { athleteId, planId: plan.id, sessionId: normalizedSessionId } },
        });
        if (!row) {
          const prescribed = plan.workouts.find((workout) => workout.id === normalizedSessionId);
          if (!prescribed) throw new CalendarSessionAmendmentError("SESSION_NOT_FOUND", "Active plan session was not found");
          row = await transaction.calendarSessionProjection.create({ data: {
            athleteId,
            planId: plan.id,
            sessionId: prescribed.id,
            prescribedSession: prescribed,
            effectiveSession: prescribed,
            status: "upcoming",
            revision: plan.revision,
          } });
        }
        if (row.revision !== request.expectedRevision) {
          throw new CalendarSessionAmendmentError("REVISION_CONFLICT", "The session changed; reload before editing again");
        }
        const localToday = localDateInTimezone(this.#now(), plan.timezone);
        const current = plannedWorkoutSchema.parse(row.effectiveSession);
        if (current.scheduledDate <= localToday) {
          throw new CalendarSessionAmendmentError("FUTURE_ONLY", "Only a future active-plan session can be amended");
        }
        const changed = applyOperation({ plan, current, status: row.status, request, localToday });
        const revision = row.revision + 1;
        const requestedAt = this.#now();
        const beforeValues = { session: current, status: row.status };
        const afterValues = { session: changed.session, status: changed.status };
        const amendment = await transaction.calendarSessionAmendment.create({ data: {
          athleteId,
          planId: plan.id,
          sessionId: normalizedSessionId,
          revision,
          operation: request.operation,
          reason: request.reason,
          changedFields: changed.changedFields,
          beforeValues,
          afterValues,
          actorUserId: scope.actor.userId,
          actorKind: "user",
          requestedAt,
          idempotencyKey: request.idempotencyKey,
          requestHash,
        } });
        const updated = await transaction.calendarSessionProjection.update({
          where: { athleteId_planId_sessionId: { athleteId, planId: plan.id, sessionId: normalizedSessionId } },
          data: { effectiveSession: changed.session, status: changed.status, revision },
        });
        const history = [projectAmendment(amendment)];
        const session = projectSession({ ...updated, amendments: history });
        await appendCalendarSessionSyncChange(transaction, athleteId, session, requestedAt);
        return { session, amendment: history[0], reused: false };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isPrismaWriteConflict(error)) {
        throw new CalendarSessionAmendmentError("REVISION_CONFLICT", "The session changed; reload before editing again");
      }
      throw error;
    }
  }
}

function reportProjectionReadFailure(operation, error) {
  const issues = Array.isArray(error?.issues)
    ? error.issues.map((issue) => ({ path: issue.path?.map(String) ?? [], message: issue.message }))
    : [];
  console.error("Calendar session projection read failed", {
    operation,
    name: error?.name ?? "Error",
    code: error?.code ?? null,
    message: error?.message ?? "Unknown projection error",
    issues,
  });
}

function isPrismaWriteConflict(error) {
  return Boolean(error)
    && typeof error === "object"
    && "code" in error
    && (error.code === "P2002" || error.code === "P2034");
}

async function activeProjection(prisma, athleteId) {
  const rows = await prisma.trainingPlanProjection.findMany({
    where: { athleteId, active: true },
    orderBy: [{ planVersion: "desc" }, { planId: "desc" }],
    take: 2,
  });
  if (rows.length > 1) throw new CalendarSessionAmendmentError("INCONSISTENT_PROJECTION", "Active plan projection is inconsistent");
  return rows[0] ?? null;
}

function safePlan(row, athleteId) {
  try { return parsePlanProjection(row, athleteId); }
  catch { throw new CalendarSessionAmendmentError("INCONSISTENT_PROJECTION", "Active plan projection is inconsistent"); }
}

function normalizeRequest(input) {
  const operation = requiredString(input?.operation, "operation");
  if (!new Set(["amend", "reschedule", "skip", "restore"]).has(operation)) {
    throw new CalendarSessionAmendmentError("VALIDATION_ERROR", "Amendment operation is invalid");
  }
  const reason = requiredString(input?.reason, "reason");
  if (reason.length > 500) throw new CalendarSessionAmendmentError("VALIDATION_ERROR", "reason must not exceed 500 characters");
  if (!Number.isInteger(input?.expectedRevision) || input.expectedRevision < 1) {
    throw new CalendarSessionAmendmentError("VALIDATION_ERROR", "expectedRevision must be positive");
  }
  const idempotencyKey = requiredString(input?.idempotencyKey, "idempotencyKey");
  if (idempotencyKey.length > 128) throw new CalendarSessionAmendmentError("VALIDATION_ERROR", "idempotencyKey is too long");
  const changes = input?.changes && typeof input.changes === "object" && !Array.isArray(input.changes)
    ? { ...input.changes }
    : {};
  return { operation, reason, expectedRevision: input.expectedRevision, idempotencyKey, changes };
}

function applyOperation({ plan, current, status, request, localToday }) {
  if (request.operation === "skip") {
    if (status === "skipped") throw new CalendarSessionAmendmentError("INVALID_STATE", "Session is already skipped");
    return { session: current, status: "skipped", changedFields: ["status"] };
  }
  if (request.operation === "restore") {
    if (status !== "skipped") throw new CalendarSessionAmendmentError("INVALID_STATE", "Only a skipped session can be restored");
    return { session: current, status: "upcoming", changedFields: ["status"] };
  }
  if (status === "skipped") throw new CalendarSessionAmendmentError("INVALID_STATE", "Restore a skipped session before changing it");
  if (request.operation === "reschedule") {
    const effectiveDate = requiredString(request.changes.effectiveDate ?? request.changes.scheduledDate, "effectiveDate");
    if (effectiveDate <= localToday || effectiveDate < plan.startsOn || effectiveDate > plan.endsOn) {
      throw new CalendarSessionAmendmentError("FUTURE_ONLY", "Rescheduled date must be future and within the active plan");
    }
    if (effectiveDate === current.scheduledDate) throw new CalendarSessionAmendmentError("VALIDATION_ERROR", "Amendment must change the session");
    return { session: plannedWorkoutSchema.parse({ ...current, scheduledDate: effectiveDate }), status, changedFields: ["effectiveDate"] };
  }
  const keys = Object.keys(request.changes);
  if (keys.length === 0 || keys.some((field) => !EDITABLE_FIELDS.has(field))) {
    throw new CalendarSessionAmendmentError("VALIDATION_ERROR", "Amendment fields are empty or unsupported");
  }
  const candidate = { ...current };
  for (const field of keys) {
    const value = request.changes[field];
    if (value === null && new Set(["distanceMeters", "intensityRpe", "startTime"]).has(field)) delete candidate[field];
    else candidate[field] = value;
  }
  const session = plannedWorkoutSchema.parse(candidate);
  const changedFields = keys.filter((field) => stableJson(current[field] ?? null) !== stableJson(session[field] ?? null));
  if (changedFields.length === 0) throw new CalendarSessionAmendmentError("VALIDATION_ERROR", "Amendment must change the session");
  return { session, status, changedFields };
}

function projectSession(row) {
  const prescribed = plannedWorkoutSchema.parse(row.prescribedSession);
  const effective = plannedWorkoutSchema.parse(row.effectiveSession);
  const history = (row.amendments ?? []).map((item) => item.beforeValues ? projectAmendment(item) : item);
  return sessionFromSnapshots(row.planId, row.sessionId, effective, row.status, row.revision, prescribed, history);
}

function sessionFromSnapshots(planId, sessionId, effective, status, revision, prescribed, history) {
  const source = plannedWorkoutSchema.parse(effective);
  const original = prescribed ? plannedWorkoutSchema.parse(prescribed) : source;
  return {
    ...source,
    prescribedDate: original.scheduledDate,
    effectiveDate: source.scheduledDate,
    originalDate: original.scheduledDate,
    status,
    revision,
    warnings: [],
    original,
    amendments: history,
  };
}

function projectAmendment(row) {
  const beforeSnapshot = row.beforeValues;
  const afterSnapshot = row.afterValues;
  const beforeSession = beforeSnapshot.session ?? beforeSnapshot;
  const afterSession = afterSnapshot.session ?? afterSnapshot;
  const before = {};
  const after = {};
  for (const field of row.changedFields) {
    if (field === "effectiveDate") {
      before[field] = beforeSession.scheduledDate;
      after[field] = afterSession.scheduledDate;
    } else if (field === "status") {
      before[field] = beforeSnapshot.status;
      after[field] = afterSnapshot.status;
    } else {
      before[field] = beforeSession[field] ?? null;
      after[field] = afterSession[field] ?? null;
    }
  }
  return {
    id: row.id,
    planId: row.planId,
    sessionId: row.sessionId,
    revision: row.revision,
    operation: row.operation,
    reason: row.reason,
    changedFields: row.changedFields,
    actor: row.actorUserId,
    changedAt: asIso(row.requestedAt),
    before,
    after,
    expectedRevision: row.revision - 1,
    resultingRevision: row.revision,
  };
}

function projectReviewAmendment(row) {
  const { revision: _revision, ...amendment } = projectAmendment(row);
  return { ...amendment, actorKind: row.actorKind };
}

function fallbackSessions(plan, rows) {
  const byId = new Map(rows.map((row) => [row.sessionId, row]));
  return plan.workouts.map((workout) => byId.has(workout.id) ? projectSession(byId.get(workout.id)) : fallbackSession(plan, workout));
}

function fallbackSession(plan, workout) {
  return sessionFromSnapshots(plan.id, workout.id, workout, "upcoming", plan.revision, workout, []);
}

function localDateInTimezone(at, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function requiredString(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new CalendarSessionAmendmentError("VALIDATION_ERROR", `${name} is required`);
  return normalized;
}

function hashRequest(request) {
  return createHash("sha256").update(stableJson(request)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function asIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
