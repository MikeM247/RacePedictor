import { randomUUID } from "node:crypto";
import { paceArtifactSchema, paceComparisonSchema } from "../../../core/src/contracts/activity-pace-comparison.ts";
import { comparisonRead, PaceComparisonError, prescriptionSource, publishedComparison, validatePaceArtifact } from "../../../core/src/services/activity-pace-comparison.ts";
import { assertAthleteScope } from "./athlete-scope.js";
import { PrismaCloudActivityRepository } from "./prisma-cloud-activity-repository.js";

export class PrismaActivityPaceComparisonRepository {
  #prisma;
  constructor({ prisma }) { this.#prisma = prisma; }
  async #latest(db, athleteId, activityId) {
    const row = await db.activityPaceComparison.findFirst({ where: { athleteId, activityId }, orderBy: { revision: "desc" } });
    const comparison = row ? paceComparisonSchema.parse(row.payload) : null;
    if (comparison && (comparison.athleteId !== athleteId || comparison.activityId !== activityId)) throw new PaceComparisonError("CONFLICT", "Stored comparison identity is inconsistent");
    return comparison;
  }
  async #source(db, athleteId, planId, sessionId, sessionRevision) {
    const row = await db.trainingPlanProjection.findUnique({ where: { athleteId_planId: { athleteId, planId } } });
    if (!row || row.plan.athleteId !== athleteId || row.plan.id !== planId) throw new PaceComparisonError("NOT_FOUND", "Approved plan was not found");
    const amendments = sessionRevision === null ? [] : await db.calendarSessionAmendment.findMany({ where: { athleteId, planId, sessionId, revision: { lte: sessionRevision } }, orderBy: { revision: "asc" } });
    return prescriptionSource(row.plan, sessionId, sessionRevision, amendments);
  }
  async context(scope, activityId, planId, sessionId, sessionRevision = null) {
    const athleteId = assertAthleteScope(scope), activities = new PrismaCloudActivityRepository({ prisma: this.#prisma });
    const activity = await activities.findById(scope, activityId);
    if (!activity) throw new PaceComparisonError("NOT_FOUND", "Activity was not found");
    const [activityRevision, comparison, source] = await Promise.all([
      activities.currentRevision(scope, activityId), this.#latest(this.#prisma, athleteId, activityId),
      this.#source(this.#prisma, athleteId, planId, sessionId, sessionRevision),
    ]);
    return { activity, activityRevision, comparisonRevision: comparison?.revision ?? 0, source };
  }
  async read(scope, activityId) {
    const athleteId = assertAthleteScope(scope);
    const activity = await new PrismaCloudActivityRepository({ prisma: this.#prisma }).findById(scope, activityId);
    if (!activity) throw new PaceComparisonError("NOT_FOUND", "Activity was not found");
    return comparisonRead(activity, await this.#latest(this.#prisma, athleteId, activityId));
  }
  async publish(scope, input, deviceId) {
    const athleteId = assertAthleteScope(scope), artifact = paceArtifactSchema.parse(input);
    if (artifact.athleteId !== athleteId) throw new PaceComparisonError("CONFLICT", "Artifact crosses athlete scope");
    try {
      return await this.#prisma.$transaction(async db => {
        const device = await db.pairedDevice.findUnique({ where: { id_athleteId: { id: deviceId, athleteId } } });
        if (!device || device.status !== "active") throw new PaceComparisonError("CONFLICT", "Paired device is unavailable");
        const activities = new PrismaCloudActivityRepository({ prisma: db });
        const activity = await activities.findById(scope, artifact.activityId);
        if (!activity) throw new PaceComparisonError("NOT_FOUND", "Activity was not found");
        const existing = await db.activityPaceComparison.findUnique({ where: { athleteId_activityId_artifactId: { athleteId, activityId: artifact.activityId, artifactId: artifact.artifactId } } });
        if (existing) {
          // A retry of identical reviewed bytes is safe even if activity data has since changed.
          const { artifactHash, ...content } = artifact;
          const { paceHash } = await import("../../../core/src/services/activity-pace-comparison.ts");
          if (existing.artifactHash !== artifactHash || paceHash(content) !== artifactHash) throw new PaceComparisonError("CONFLICT", "Artifact identity was reused with different content");
          return paceComparisonSchema.parse(existing.payload);
        }
        const source = await this.#source(db, athleteId, artifact.source.planId, artifact.source.sessionId, artifact.source.sessionRevision);
        validatePaceArtifact(artifact, activity, source);
        const revision = await activities.currentRevision(scope, activity.id);
        const latest = await this.#latest(db, athleteId, activity.id);
        if (revision !== artifact.expectedActivityRevision || (latest?.revision ?? 0) !== artifact.expectedComparisonRevision) throw new PaceComparisonError("CONFLICT", "Comparison context changed; reload and review");
        const comparison = publishedComparison(artifact, new Date().toISOString());
        await db.activityPaceComparison.create({ data: { id: `pace_${randomUUID()}`, athleteId, activityId: activity.id, revision: comparison.revision, artifactId: artifact.artifactId, artifactHash: artifact.artifactHash, payload: comparison, publishedAt: new Date(comparison.publishedAt) } });
        return comparison;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (["P2002", "P2034"].includes(error?.code)) throw new PaceComparisonError("CONFLICT", "Concurrent publication; reload and review");
      throw error;
    }
  }
}
