import { randomUUID } from "node:crypto";
import {
  activityCoachReviewSchema,
  activityCoachReviewSummarySchema,
  activityReviewRequestStatusSchema,
} from "../../../core/src/contracts/activity-review.ts";
import { assertAthleteScope } from "./athlete-scope.js";

export class PrismaActivityReviewRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.activityReviewRequest || !prisma?.activityCoachReview) throw new Error("A Prisma activity review client is required");
    this.#prisma = prisma;
  }

  async get(scope, activityId) {
    const athleteId = assertAthleteScope(scope);
    const [request, review] = await Promise.all([
      this.#prisma.activityReviewRequest.findFirst({ where: { athleteId, activityId } }),
      this.#prisma.activityCoachReview.findFirst({ where: { athleteId, activityId }, orderBy: { revision: "desc" } }),
    ]);
    return toResponse({ athleteId, activityId, request, review });
  }

  async listLatest(scope, limit = 10) {
    const athleteId = assertAthleteScope(scope);
    const rows = await this.#prisma.activityCoachReview.findMany({
      where: { athleteId }, orderBy: { publishedAt: "desc" }, take: Math.min(Math.max(Number(limit) || 10, 1), 40),
    });
    return rows.map(toSummary);
  }

  async reconcileRecent(scope, { windowHours = 48, now = new Date() } = {}) {
    const athleteId = assertAthleteScope(scope);
    const hours = Math.min(Math.max(Number(windowHours) || 48, 1), 168);
    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const activities = await this.#prisma.activity.findMany({
      where: {
        athleteId,
        deletedAt: null,
        createdAt: { gte: cutoff },
        sport: { in: ["run", "trail_run", "treadmill_run"] },
      },
      select: { id: true },
      take: 200,
    });
    for (const activity of activities) {
      await this.#prisma.activityReviewRequest.upsert({
        where: { athleteId_activityId: { athleteId, activityId: activity.id } },
        update: {},
        create: {
          id: `activity_review_request_${randomUUID().replaceAll("-", "")}`,
          athleteId,
          activityId: activity.id,
          status: "queued",
          availableAt: now,
        },
      });
    }
    return activities.length;
  }

  async queue(scope, activityId) {
    const athleteId = assertAthleteScope(scope);
    const activity = await this.#prisma.activity.findFirst({ where: { id: activityId, athleteId, deletedAt: null }, select: { id: true } });
    if (!activity) return null;
    const now = new Date();
    const existing = await this.#prisma.activityReviewRequest.findUnique({ where: { athleteId_activityId: { athleteId, activityId } } });
    const request = existing
      ? await this.#prisma.activityReviewRequest.update({ where: { id_athleteId: { id: existing.id, athleteId } }, data: { status: "queued", availableAt: now, lastErrorCode: null } })
      : await this.#prisma.activityReviewRequest.create({ data: { id: `activity_review_request_${randomUUID().replaceAll("-", "")}`, athleteId, activityId, status: "queued", availableAt: now } });
    return { activityId, requestId: request.id, status: activityReviewRequestStatusSchema.parse(request.status), reused: Boolean(existing), updatedAt: request.updatedAt.toISOString() };
  }

  async publish(scope, artifact, deviceId) {
    const athleteId = assertAthleteScope(scope);
    const parsed = activityCoachReviewSchema.parse(artifact);
    if (parsed.athleteId !== athleteId) throw new Error("Review crosses athlete scope");
    const request = await this.#prisma.activityReviewRequest.findUnique({ where: { id_athleteId: { id: artifact.requestId, athleteId } } });
    if (!request) throw new Error("Activity review request was not found");
    if (request.status !== "processing" || request.lockedBy !== deviceId || request.leaseToken !== artifact.leaseToken) throw new Error("Activity review lease is invalid");
    const row = await this.#prisma.activityCoachReview.upsert({
      where: { athleteId_activityId_revision: { athleteId, activityId: parsed.activityId, revision: parsed.revision } },
      update: {},
      create: {
        ...toPrisma(parsed), requestId: request.id,
      },
    });
    await this.#prisma.activityReviewRequest.update({ where: { id_athleteId: { id: request.id, athleteId } }, data: { status: "ready", lastErrorCode: null, leaseToken: null, lockedBy: null, lockedAt: null } });
    return activityCoachReviewSchema.parse(toReview(row));
  }

  async claim(scope, deviceId, limit = 5) {
    const athleteId = assertAthleteScope(scope);
    const now = new Date();
    const candidates = await this.#prisma.activityReviewRequest.findMany({
      where: { athleteId, status: { in: ["queued", "retry_wait"] }, availableAt: { lte: now } },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }], take: Math.min(Math.max(Number(limit) || 5, 1), 20),
    });
    const items = [];
    for (const candidate of candidates) {
      const leaseToken = randomUUID();
      const claimed = await this.#prisma.activityReviewRequest.updateMany({
        where: { id: candidate.id, athleteId, status: { in: ["queued", "retry_wait"] } },
        data: { status: "processing", attemptCount: { increment: 1 }, lockedAt: now, lockedBy: deviceId, leaseToken },
      });
      if (claimed.count === 1) items.push({ requestId: candidate.id, activityId: candidate.activityId, status: "processing", leaseToken });
    }
    return { items };
  }
}

function toResponse({ activityId, request, review }) {
  return {
    activityId,
    status: request?.status ? activityReviewRequestStatusSchema.parse(request.status) : review ? "ready" : "not_requested",
    review: review ? toReview(review) : null,
    requestId: request?.id ?? null,
    updatedAt: request?.updatedAt?.toISOString() ?? review?.publishedAt?.toISOString() ?? null,
    readRevision: null,
  };
}

function toSummary(row) {
  return activityCoachReviewSummarySchema.parse({
    id: row.id, athleteId: row.athleteId, activityId: row.activityId, revision: row.revision,
    headline: row.headline, nextStep: row.nextStep, comparison: row.comparison,
    generatedAt: row.generatedAt.toISOString(), publishedAt: row.publishedAt.toISOString(), model: row.model,
  });
}

function toReview(row) {
  return activityCoachReviewSchema.parse({
    id: row.id, athleteId: row.athleteId, activityId: row.activityId, revision: row.revision,
    inputFingerprint: row.inputFingerprint, headline: row.headline, assessment: row.assessment,
    nextStep: row.nextStep, comparison: row.comparison, evidence: row.evidence, limitations: row.limitations,
    generatedAt: row.generatedAt.toISOString(), publishedAt: row.publishedAt.toISOString(), model: row.model, promptVersion: row.promptVersion,
  });
}

function toPrisma(review) {
  return {
    id: review.id, athleteId: review.athleteId, activityId: review.activityId,
    revision: review.revision, inputFingerprint: review.inputFingerprint,
    headline: review.headline, assessment: review.assessment, nextStep: review.nextStep,
    comparison: review.comparison, evidence: review.evidence, limitations: review.limitations,
    generatedAt: new Date(review.generatedAt), publishedAt: new Date(review.publishedAt),
    model: review.model, promptVersion: review.promptVersion,
  };
}
