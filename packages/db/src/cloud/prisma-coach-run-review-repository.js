import { randomUUID } from "node:crypto";
import { assertAthleteScope } from "./athlete-scope.js";

export class PrismaCoachRunReviewRepository {
  #prisma;
  #now;
  constructor({ prisma, now = () => new Date() }) {
    if (!prisma?.activity || !prisma?.coachRunReviewActivation || !prisma?.coachRunReviewOffer) throw new Error("A Prisma run-review client is required");
    this.#prisma = prisma;
    this.#now = now;
  }

  async getCandidate(scope) {
    const athleteId = assertAthleteScope(scope);
    const activation = await this.#prisma.coachRunReviewActivation.findUnique({ where: { athleteId } });
    if (!activation) return null;
    return this.#findCandidate(this.#prisma, athleteId, activation.activatedAt, this.#now());
  }

  async getOffer(scope, loginId) {
    const athleteId = assertAthleteScope(scope);
    const row = await this.#prisma.coachRunReviewOffer.findUnique({ where: { athleteId_loginId: { athleteId, loginId } } });
    return row ? offerDto(row, false, this.#now()) : null;
  }

  async reserve(scope, { tabId }) {
    const athleteId = assertAthleteScope(scope);
    const loginId = scope.actor.runReviewLoginId;
    if (!loginId) return { status: "legacy_session", offer: null };
    const now = this.#now();
    return this.#prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "athletes" WHERE "id" = ${athleteId} FOR UPDATE`;
      const activation = await tx.coachRunReviewActivation.upsert({ where: { athleteId }, create: { athleteId, activatedAt: now }, update: {} });
      const prior = await tx.coachRunReviewOffer.findUnique({ where: { athleteId_loginId: { athleteId, loginId } } });
      if (prior?.consumedAt) return { status: "consumed", offer: offerDto(prior, false, now) };
      if (prior && prior.expiresAt > now && prior.tabId !== tabId) return { status: "owned_elsewhere", offer: offerDto(prior, false, now) };
      const candidate = await this.#findCandidate(tx, athleteId, activation.activatedAt, now);
      if (!candidate) return { status: "none", offer: null };
      const token = randomUUID();
      const expiresAt = new Date(now.getTime() + 60_000);
      const offer = prior
        ? await tx.coachRunReviewOffer.update({ where: { id: prior.id }, data: { activityId: candidate.id, tabId, token, expiresAt, outcome: null } })
        : await tx.coachRunReviewOffer.create({ data: { athleteId, loginId, activityId: candidate.id, tabId, token, expiresAt } });
      return { status: "reserved", offer: offerDto(offer, true, now), activity: candidate };
    });
  }

  async consume(scope, { offerId, token, tabId }) {
    const athleteId = assertAthleteScope(scope);
    const loginId = scope.actor.runReviewLoginId;
    if (!loginId) return { canPresent: false, reason: "legacy_session" };
    const now = this.#now();
    return this.#prisma.$transaction(async (tx) => {
      const offer = await tx.coachRunReviewOffer.findFirst({ where: { athleteId, loginId, id: offerId } });
      if (!offer || offer.token !== token || offer.tabId !== tabId) return { canPresent: false, reason: "invalid_offer" };
      if (offer.consumedAt) return { canPresent: false, reason: "already_consumed" };
      if (offer.expiresAt <= now) return { canPresent: false, reason: "expired" };
      await tx.$queryRaw`SELECT "id" FROM "Activity" WHERE "athleteId" = ${athleteId} AND "id" = ${offer.activityId} FOR UPDATE`;
      const candidate = await tx.activity.findFirst({
        where: { athleteId, id: offer.activityId, sport: { in: ["run", "trail_run", "treadmill_run"] }, deletedAt: null, endedAt: { lte: now } },
        include: { runReviewState: true, activityReflections: { where: { questionnaireVersion: "activity-reflection.v2" }, take: 1 }, revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
      });
      const reopened = Boolean(candidate?.runReviewState?.reopenedAt && !candidate.runReviewState.completedAt && !candidate.runReviewState.suppressedAt);
      if (!candidate || candidate.runReviewState?.completedAt || candidate.runReviewState?.suppressedAt || (candidate.activityReflections.length && !reopened)) return { canPresent: false, reason: "no_longer_eligible" };
      const updated = await tx.coachRunReviewOffer.updateMany({ where: { id: offer.id, athleteId, loginId, token, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (updated.count !== 1) return { canPresent: false, reason: "already_consumed" };
      return { canPresent: true, offer: offerDto({ ...offer, consumedAt: now }, true, now), activity: activityDto(candidate) };
    });
  }

  async recordOutcome(scope, { offerId, token, tabId, outcome }) {
    const athleteId = assertAthleteScope(scope);
    const loginId = scope.actor.runReviewLoginId;
    if (!loginId) return null;
    const row = await this.#prisma.coachRunReviewOffer.findFirst({ where: { id: offerId, athleteId, loginId, token, tabId, consumedAt: { not: null } } });
    if (!row) return null;
    const updated = await this.#prisma.coachRunReviewOffer.update({ where: { id: row.id }, data: { outcome } });
    return offerDto(updated, false, this.#now());
  }

  async #findCandidate(tx, athleteId, activatedAt, now) {
    const activity = await tx.activity.findFirst({
      where: {
        athleteId, deletedAt: null, sport: { in: ["run", "trail_run", "treadmill_run"] }, endedAt: { lte: now },
        OR: [{ runReviewState: { is: null } }, { runReviewState: { is: { completedAt: null, suppressedAt: null } } }],
        AND: [
          { OR: [{ occurredAt: { gt: activatedAt } }, { runReviewState: { is: { reopenedAt: { not: null } } } }] },
          { OR: [{ activityReflections: { none: { questionnaireVersion: "activity-reflection.v2" } } }, { runReviewState: { is: { reopenedAt: { not: null }, completedAt: null, suppressedAt: null } } }] },
        ],
      }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
    });
    return activity ? activityDto(activity) : null;
  }
}

function activityDto(row) {
  return {
    id: row.id, title: row.title || `${row.sport.replaceAll("_", " ")} session`, sport: row.sport,
    occurredAt: row.occurredAt.toISOString(), elapsedTimeS: row.elapsedTimeS, movingTimeS: row.movingTimeS,
    distanceM: Number(row.distanceM), avgPaceSecPerKm: Number(row.avgPaceSecPerKm), elevationGainM: Number(row.elevationGainM),
    avgHrBpm: row.avgHrBpm, revision: row.revisions?.[0]?.revisionNumber ?? 0, sourceType: row.sourceType,
  };
}

function offerDto(row, owned, now) {
  return { id: row.id, activityId: row.activityId, expiresAt: row.expiresAt.toISOString(), consumedAt: row.consumedAt?.toISOString() ?? null, status: row.consumedAt ? "consumed" : row.expiresAt > now ? "reserved" : "expired", ...(owned ? { token: row.token, tabId: row.tabId } : {}) };
}
