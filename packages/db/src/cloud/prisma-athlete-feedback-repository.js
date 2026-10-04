import { randomUUID } from "node:crypto";
import {
  activityAthleteFeedbackSchema,
} from "../../../core/src/contracts/activity-review.ts";
import { validateAthleteFeedbackArtifact } from "../../../core/src/services/activity-athlete-feedback.ts";
import { assertAthleteScope } from "./athlete-scope.js";

export class AthleteFeedbackConflictError extends Error {}

export class PrismaAthleteFeedbackRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.activityAthleteFeedback || !prisma?.activity || !prisma?.activityRevision) {
      throw new Error("A Prisma athlete feedback client is required");
    }
    this.#prisma = prisma;
  }

  async get(scope, activityId) {
    const athleteId = assertAthleteScope(scope);
    const row = await this.#prisma.activityAthleteFeedback.findFirst({
      where: { athleteId, activityId },
      orderBy: { revision: "desc" },
    });
    return row ? toDto(row) : null;
  }

  async publish(scope, artifact) {
    const athleteId = assertAthleteScope(scope);
    const parsed = validateAthleteFeedbackArtifact(artifact);
    if (parsed.athleteId !== athleteId) throw new AthleteFeedbackConflictError("Athlete feedback crosses athlete scope");
    const activity = await this.#prisma.activity.findFirst({
      where: { id: parsed.activityId, athleteId, deletedAt: null },
      select: { id: true },
    });
    if (!activity) return null;
    const latestActivityRevision = await this.#prisma.activityRevision.findFirst({
      where: { athleteId, activityId: parsed.activityId }, orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true },
    });
    if ((latestActivityRevision?.revisionNumber ?? 0) !== parsed.expectedActivityRevision) {
      throw new AthleteFeedbackConflictError("Activity revision is stale");
    }
    if (parsed.activityRevision !== parsed.expectedActivityRevision) {
      throw new AthleteFeedbackConflictError("Published feedback revision does not match the activity revision");
    }
    const existingArtifact = await this.#prisma.activityAthleteFeedback.findUnique({
      where: { athleteId_activityId_artifactId: { athleteId, activityId: parsed.activityId, artifactId: parsed.artifactId } },
    });
    if (existingArtifact) return toDto(existingArtifact);
    const current = await this.#prisma.activityAthleteFeedback.findFirst({
      where: { athleteId, activityId: parsed.activityId }, orderBy: { revision: "desc" }, select: { revision: true },
    });
    const nextRevision = (current?.revision ?? 0) + 1;
    if (parsed.expectedFeedbackRevision !== (current?.revision ?? 0)) {
      throw new AthleteFeedbackConflictError("Athlete feedback revision is stale");
    }
    const row = await this.#prisma.activityAthleteFeedback.create({
      data: {
        id: parsed.id || `athlete_feedback_${randomUUID().replaceAll("-", "")}`,
        athleteId,
        activityId: parsed.activityId,
        revision: nextRevision,
        activityRevision: parsed.activityRevision,
        headline: parsed.headline,
        summary: parsed.summary,
        model: parsed.model,
        artifactId: parsed.artifactId,
        artifactHash: parsed.artifactHash,
        approvedAt: new Date(parsed.approvedAt),
        publishedAt: new Date(parsed.publishedAt),
      },
    });
    return toDto(row);
  }
}

function toDto(row) {
  return activityAthleteFeedbackSchema.parse({
    id: row.id,
    athleteId: row.athleteId,
    activityId: row.activityId,
    revision: row.revision,
    activityRevision: row.activityRevision,
    headline: row.headline,
    summary: row.summary,
    model: row.model,
    artifactId: row.artifactId,
    artifactHash: row.artifactHash,
    approvedAt: row.approvedAt.toISOString(),
    publishedAt: row.publishedAt.toISOString(),
  });
}
