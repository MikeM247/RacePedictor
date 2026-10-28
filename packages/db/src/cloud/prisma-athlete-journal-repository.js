import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  activityReflectionSchema,
  dailyWellbeingCheckInSchema,
} from "../../../core/src/contracts/athlete-journal.ts";
import { assertAthleteScope } from "./athlete-scope.js";

export class AthleteJournalConflictError extends Error {
  constructor(message = "Athlete journal entry is stale", code = "REFLECTION_CHANGED") {
    super(message);
    this.name = "AthleteJournalConflictError";
    this.code = code;
  }
}

export class AthleteJournalDateError extends Error {
  constructor() { super("Daily wellbeing check-ins may only be saved for the current local date"); this.name = "AthleteJournalDateError"; }
}

export class PrismaAthleteJournalRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.activityReflection || !prisma?.dailyWellbeingCheckIn || !prisma?.activity) {
      throw new Error("A Prisma athlete journal client is required");
    }
    this.#prisma = prisma;
  }

  async getReflection(scope, activityId) {
    const athleteId = assertAthleteScope(scope);
    const row = await this.#prisma.activityReflection.findFirst({ where: { athleteId, activityId } });
    return row ? reflectionDto(row) : null;
  }

  async saveReflection(scope, activityId, input) {
    const athleteId = assertAthleteScope(scope);
    return this.#prisma.$transaction(async (tx) => {
      const activityRows = await tx.$queryRaw`SELECT "id" FROM "Activity" WHERE "athleteId" = ${athleteId} AND "id" = ${activityId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!activityRows.length) return null;
      const activityRevision = await latestActivityRevision(tx, athleteId, activityId) || 1;
      const existing = await tx.activityReflection.findUnique({ where: { athleteId_activityId: { athleteId, activityId } } });
      if (existing?.questionnaireVersion === "activity-reflection.v2") {
        throw new AthleteJournalConflictError("This reflection was updated to a newer version", "REFLECTION_VERSION_CHANGED");
      }
      if ((existing?.revision ?? 0) !== input.expectedRevision) throw new AthleteJournalConflictError();
      const revision = (existing?.revision ?? 0) + 1;
      const row = await tx.activityReflection.upsert({
        where: { athleteId_activityId: { athleteId, activityId } },
        create: {
          id: `reflection_${randomUUID().replaceAll("-", "")}`,
          athleteId, activityId, revision, activityRevision,
          type: input.type, answers: input.answers, sections: input.sections,
          questionnaireVersion: "activity-reflection.v1",
        },
        update: {
          revision, activityRevision, type: input.type, answers: input.answers, sections: input.sections,
        },
      });
      return reflectionDto(row);
    });
  }

  async savePostRunReflection(scope, activityId, input) {
    const athleteId = assertAthleteScope(scope);
    const requestHash = createHash("sha256").update(JSON.stringify({ activityId, ...input })).digest("hex");
    return this.#prisma.$transaction(async (tx) => {
      const activityRows = await tx.$queryRaw`SELECT "id" FROM "Activity" WHERE "athleteId" = ${athleteId} AND "id" = ${activityId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!activityRows.length) return null;
      const replay = await tx.activityReflectionMutation.findUnique({ where: { athleteId_requestId: { athleteId, requestId: input.requestId } } });
      if (replay) {
        if (replay.requestHash !== requestHash || replay.activityId !== activityId || replay.operation !== "saved") throw new AthleteJournalConflictError("This request identity was used for different feedback", "IDEMPOTENCY_CONFLICT");
        return this.#currentMutationResult(tx, athleteId, activityId, replay, true);
      }
      const activity = await tx.activity.findFirst({ where: { athleteId, id: activityId, deletedAt: null }, select: { sport: true, endedAt: true } });
      if (!activity || !["run", "trail_run", "treadmill_run"].includes(activity.sport) || activity.endedAt > new Date()) return null;
      const currentActivityRevision = await latestActivityRevision(tx, athleteId, activityId);
      if (currentActivityRevision !== input.expectedActivityRevision) throw new AthleteJournalConflictError("The run changed; review its latest details", "ACTIVITY_CHANGED");
      const existing = await tx.activityReflection.findUnique({ where: { athleteId_activityId: { athleteId, activityId } } });
      if ((existing?.revision ?? 0) !== input.expectedRevision) throw new AthleteJournalConflictError();
      const now = new Date();
      const revision = (existing?.revision ?? 0) + 1;
      const row = await tx.activityReflection.upsert({
        where: { athleteId_activityId: { athleteId, activityId } },
        create: { id: `reflection_${randomUUID().replaceAll("-", "")}`, athleteId, activityId, revision, activityRevision: currentActivityRevision || 1, type: input.type, answers: input.answers, sections: input.sections, questionnaireVersion: "activity-reflection.v2" },
        update: { revision, activityRevision: currentActivityRevision || 1, type: input.type, answers: input.answers, sections: input.sections, questionnaireVersion: "activity-reflection.v2" },
      });
      const state = await tx.activityRunReviewState.upsert({
        where: { athleteId_activityId: { athleteId, activityId } },
        create: { athleteId, activityId, completedAt: now, completedReflectionRevision: revision, suppressedAt: now, revision: 1 },
        update: { completedAt: now, completedReflectionRevision: revision, suppressedAt: now, revision: { increment: 1 } },
      });
      const receipt = await tx.activityReflectionMutation.create({ data: {
        athleteId, requestId: input.requestId, activityId, requestHash, operation: "saved", appliedRevision: revision, appliedStateRevision: state.revision,
      } });
      return { reflection: reflectionDto(row), state: runReviewStateDto(state), operation: receipt, replayed: false };
    }).catch((error) => {
      if (error?.code === "P2002") throw new AthleteJournalConflictError("This request identity was already used", "IDEMPOTENCY_CONFLICT");
      throw error;
    });
  }

  async getReflectionMutation(scope, activityId, requestId) {
    const athleteId = assertAthleteScope(scope);
    return this.#prisma.$transaction(async (tx) => {
      const receipt = await tx.activityReflectionMutation.findUnique({ where: { athleteId_requestId: { athleteId, requestId } } });
      if (!receipt || receipt.activityId !== activityId) return null;
      return this.#currentMutationResult(tx, athleteId, activityId, receipt, true);
    }, { isolationLevel: "RepeatableRead" });
  }

  async getRunReviewState(scope, activityId) {
    const athleteId = assertAthleteScope(scope);
    const [state, reflection, revision] = await Promise.all([
      this.#prisma.activityRunReviewState.findUnique({ where: { athleteId_activityId: { athleteId, activityId } } }),
      this.#prisma.activityReflection.findUnique({ where: { athleteId_activityId: { athleteId, activityId } } }),
      latestActivityRevision(this.#prisma, athleteId, activityId),
    ]);
    return { state: state ? runReviewStateDto(state) : null, reflection: reflection ? reflectionDto(reflection) : null, activityRevision: revision };
  }

  async deletePostRunReflection(scope, activityId, input) {
    return this.#changePostRunState(scope, activityId, input, "deleted");
  }

  async reopenPostRunReflection(scope, activityId, input) {
    return this.#changePostRunState(scope, activityId, input, "reopened");
  }

  async #changePostRunState(scope, activityId, input, operation) {
    const athleteId = assertAthleteScope(scope);
    const requestHash = createHash("sha256").update(JSON.stringify({ activityId, operation, ...input })).digest("hex");
    return this.#prisma.$transaction(async (tx) => {
      const activityRows = await tx.$queryRaw`SELECT "id" FROM "Activity" WHERE "athleteId" = ${athleteId} AND "id" = ${activityId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!activityRows.length) return null;
      const replay = await tx.activityReflectionMutation.findUnique({ where: { athleteId_requestId: { athleteId, requestId: input.requestId } } });
      if (replay) {
        if (replay.requestHash !== requestHash || replay.activityId !== activityId || replay.operation !== operation) throw new AthleteJournalConflictError("This request identity was used for another operation", "IDEMPOTENCY_CONFLICT");
        return this.#currentMutationResult(tx, athleteId, activityId, replay, true);
      }
      const state = await tx.activityRunReviewState.findUnique({ where: { athleteId_activityId: { athleteId, activityId } } });
      if ((state?.revision ?? 0) !== input.expectedStateRevision) throw new AthleteJournalConflictError();
      const reflection = await tx.activityReflection.findUnique({ where: { athleteId_activityId: { athleteId, activityId } } });
      if (operation === "deleted") {
        let appliedRevision = reflection?.revision ?? 0;
        if (reflection?.questionnaireVersion === "activity-reflection.v2") {
          const answers = { ...(reflection.answers ?? {}) };
          delete answers.postRun;
          const cleared = await tx.activityReflection.update({ where: { athleteId_activityId: { athleteId, activityId } }, data: { revision: { increment: 1 }, answers, questionnaireVersion: "activity-reflection.v1" } });
          appliedRevision = cleared.revision;
        }
        const updated = await tx.activityRunReviewState.upsert({ where: { athleteId_activityId: { athleteId, activityId } }, create: { athleteId, activityId, suppressedAt: new Date(), revision: 1 }, update: { completedAt: null, completedReflectionRevision: null, suppressedAt: new Date(), revision: { increment: 1 } } });
        const receipt = await tx.activityReflectionMutation.create({ data: { athleteId, requestId: input.requestId, activityId, requestHash, operation, appliedRevision, appliedStateRevision: updated.revision } });
        return { reflection: null, state: runReviewStateDto(updated), operation: receipt, replayed: false };
      }
      const now = new Date();
      const updated = await tx.activityRunReviewState.upsert({ where: { athleteId_activityId: { athleteId, activityId } }, create: { athleteId, activityId, reopenedAt: now, revision: 1 }, update: { completedAt: null, completedReflectionRevision: null, suppressedAt: null, reopenedAt: now, revision: { increment: 1 } } });
      const receipt = await tx.activityReflectionMutation.create({ data: { athleteId, requestId: input.requestId, activityId, requestHash, operation, appliedRevision: reflection?.revision ?? 0, appliedStateRevision: updated.revision } });
      return { reflection: reflection ? reflectionDto(reflection) : null, state: runReviewStateDto(updated), operation: receipt, replayed: false };
    }).catch((error) => {
      if (error?.code === "P2002") throw new AthleteJournalConflictError("This request identity was already used", "IDEMPOTENCY_CONFLICT");
      throw error;
    });
  }

  async #currentMutationResult(tx, athleteId, activityId, receipt, replayed) {
    const [row, state] = await Promise.all([
      tx.activityReflection.findUnique({ where: { athleteId_activityId: { athleteId, activityId } } }),
      tx.activityRunReviewState.findUnique({ where: { athleteId_activityId: { athleteId, activityId } } }),
    ]);
    return { reflection: row?.questionnaireVersion === "activity-reflection.v2" ? reflectionDto(row) : null, state: state ? runReviewStateDto(state) : null, operation: { requestId: receipt.requestId, operation: receipt.operation, appliedRevision: receipt.appliedRevision, stateRevision: receipt.appliedStateRevision }, replayed };
  }

  async listWellbeing(scope, from, to) {
    const athleteId = assertAthleteScope(scope);
    const rows = await this.#prisma.dailyWellbeingCheckIn.findMany({
      where: { athleteId, localDate: { gte: from, lte: to } }, orderBy: { localDate: "asc" },
    });
    return rows.map(wellbeingDto);
  }

  async saveWellbeing(scope, localDate, input) {
    const athleteId = assertAthleteScope(scope);
    const existing = await this.#prisma.dailyWellbeingCheckIn.findFirst({ where: { athleteId, localDate } });
    if (!isIanaTimezone(input.timezone) || (!existing && localDate !== localDateInTimezone(new Date(), input.timezone))) throw new AthleteJournalDateError();
    if ((existing?.revision ?? 0) !== input.expectedRevision) throw new AthleteJournalConflictError();
    const now = new Date();
    const revision = (existing?.revision ?? 0) + 1;
    const row = await this.#prisma.dailyWellbeingCheckIn.upsert({
      where: { athleteId_localDate: { athleteId, localDate } },
      create: {
        id: `wellbeing_${randomUUID().replaceAll("-", "")}`,
        athleteId, localDate, timezone: input.timezone, answers: input.answers,
        status: input.status, recordedAt: input.status === "saved" ? now : null,
        skippedAt: input.status === "skipped" ? now : null, revision,
        questionnaireVersion: "daily-wellbeing.v1",
      },
      update: {
        timezone: input.timezone, answers: input.answers, status: input.status,
        recordedAt: input.status === "saved" ? now : null,
        skippedAt: input.status === "skipped" ? now : null, revision,
      },
    });
    return wellbeingDto(row);
  }
}

function isIanaTimezone(timezone) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); return true; }
  catch { return false; }
}

function localDateInTimezone(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const fields = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function reflectionDto(row) {
  return activityReflectionSchema.parse({
    id: row.id, athleteId: row.athleteId, activityId: row.activityId,
    revision: row.revision, activityRevision: row.activityRevision, type: row.type,
    answers: row.answers, sections: row.sections, questionnaireVersion: row.questionnaireVersion,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  });
}

function runReviewStateDto(row) {
  return { activityId: row.activityId, completedAt: row.completedAt?.toISOString() ?? null, completedReflectionRevision: row.completedReflectionRevision, suppressedAt: row.suppressedAt?.toISOString() ?? null, reopenedAt: row.reopenedAt?.toISOString() ?? null, revision: row.revision };
}

async function latestActivityRevision(tx, athleteId, activityId) {
  if (!tx.activityRevision) return 0;
  const row = await tx.activityRevision.findFirst({ where: { athleteId, activityId }, orderBy: { revisionNumber: "desc" }, select: { revisionNumber: true } });
  return row?.revisionNumber ?? 0;
}

function wellbeingDto(row) {
  return dailyWellbeingCheckInSchema.parse({
    id: row.id, athleteId: row.athleteId, localDate: row.localDate, timezone: row.timezone,
    answers: row.answers, status: row.status, recordedAt: row.recordedAt?.toISOString() ?? null,
    skippedAt: row.skippedAt?.toISOString() ?? null, revision: row.revision,
    questionnaireVersion: row.questionnaireVersion, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
