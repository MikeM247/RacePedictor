import { randomUUID } from "node:crypto";
import {
  activityReflectionSchema,
  dailyWellbeingCheckInSchema,
} from "../../../core/src/contracts/athlete-journal.ts";
import { assertAthleteScope } from "./athlete-scope.js";

export class AthleteJournalConflictError extends Error {
  constructor(message = "Athlete journal entry is stale") {
    super(message);
    this.name = "AthleteJournalConflictError";
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
    const activity = await this.#prisma.activity.findFirst({
      where: { athleteId, id: activityId, deletedAt: null },
      select: { id: true },
    });
    if (!activity) return null;
    const currentRevision = await this.#prisma.activityRevision.findFirst({
      where: { athleteId, activityId }, orderBy: { revisionNumber: "desc" }, select: { revisionNumber: true },
    });
    const activityRevision = currentRevision?.revisionNumber ?? 1;
    const existing = await this.#prisma.activityReflection.findFirst({ where: { athleteId, activityId } });
    if ((existing?.revision ?? 0) !== input.expectedRevision) throw new AthleteJournalConflictError();
    const revision = (existing?.revision ?? 0) + 1;
    const row = await this.#prisma.activityReflection.upsert({
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

function wellbeingDto(row) {
  return dailyWellbeingCheckInSchema.parse({
    id: row.id, athleteId: row.athleteId, localDate: row.localDate, timezone: row.timezone,
    answers: row.answers, status: row.status, recordedAt: row.recordedAt?.toISOString() ?? null,
    skippedAt: row.skippedAt?.toISOString() ?? null, revision: row.revision,
    questionnaireVersion: row.questionnaireVersion, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
