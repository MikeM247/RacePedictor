import assert from "node:assert/strict";
import test from "node:test";
import { PrismaCoachRunReviewRepository } from "../src/cloud/prisma-coach-run-review-repository.js";

const athleteId = "athlete_run_review";
const loginId = "3bab52fb-72f9-40ef-b686-b5d1bc870a65";
const baseTime = new Date("2026-10-28T12:00:00.000Z");

function harness() {
  let now = new Date(baseTime);
  let nextOfferId = 1;
  let candidate = {
    id: "activity_newest_run", athleteId, sport: "run", deletedAt: null,
    endedAt: new Date(baseTime.getTime() - 60_000), occurredAt: new Date(baseTime.getTime() - 30_000),
    title: "Afternoon run", elapsedTimeS: 1800, movingTimeS: 1760, distanceM: 5000,
    avgPaceSecPerKm: 360, elevationGainM: 20, avgHrBpm: 140, sourceType: "manual",
    revisions: [{ revisionNumber: 4 }], runReviewState: null, activityReflections: [],
  };
  let activation = null;
  let offer = null;
  let queue = Promise.resolve();
  const tx = {
    $queryRaw: async () => [],
    coachRunReviewActivation: {
      upsert: async ({ create }) => { activation ??= create; return activation; },
      findUnique: async () => activation,
    },
    coachRunReviewOffer: {
      findUnique: async () => offer,
      findFirst: async ({ where }) => offer && offer.id === where.id ? offer : null,
      create: async ({ data }) => { offer = { id: `offer_${nextOfferId++}`, consumedAt: null, outcome: null, createdAt: now, ...data }; return offer; },
      update: async ({ data }) => { offer = { ...offer, ...data }; return offer; },
      updateMany: async ({ where, data }) => {
        if (!offer || offer.id !== where.id || offer.token !== where.token || offer.consumedAt !== null || offer.expiresAt <= now) return { count: 0 };
        offer = { ...offer, ...data }; return { count: 1 };
      },
    },
    activity: {
      findFirst: async ({ where }) => {
        if (!candidate || candidate.athleteId !== where.athleteId || candidate.deletedAt) return null;
        if (where.id && candidate.id !== where.id) return null;
        if (where.sport?.in && !where.sport.in.includes(candidate.sport)) return null;
        if (where.endedAt?.lte && candidate.endedAt > where.endedAt.lte) return null;
        if (where.id && candidate.runReviewState?.completedAt) return null;
        return candidate;
      },
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (callback) => {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await callback(tx); } finally { release(); }
    },
  };
  const repository = new PrismaCoachRunReviewRepository({ prisma, now: () => new Date(now) });
  const scope = { athleteId, actor: { activeAthleteId: athleteId, permittedAthleteIds: [athleteId], runReviewLoginId: loginId, credentialKind: "session" } };
  return { repository, scope, setNow(value) { now = new Date(value); }, setCandidate(value) { candidate = value; }, get offer() { return offer; } };
}

test("one login owns an unconsumed reservation and only the first consume authorizes presentation", async () => {
  const app = harness();
  const first = await app.repository.reserve(app.scope, { tabId: "tab_one" });
  assert.equal(first.status, "reserved");
  assert.equal(first.activity.id, "activity_newest_run");
  const secondTab = await app.repository.reserve(app.scope, { tabId: "tab_two" });
  assert.equal(secondTab.status, "owned_elsewhere");

  const input = { offerId: first.offer.id, token: first.offer.token, tabId: "tab_one" };
  const presented = await app.repository.consume(app.scope, input);
  assert.equal(presented.canPresent, true);
  assert.equal(presented.activity.revision, 4);
  const lostResponseReplay = await app.repository.consume(app.scope, input);
  assert.equal(lostResponseReplay.canPresent, false);
  assert.equal(lostResponseReplay.reason, "already_consumed");
});

test("an abandoned reservation can expire and be claimed again without authorizing before consume", async () => {
  const app = harness();
  const abandoned = await app.repository.reserve(app.scope, { tabId: "tab_one" });
  assert.equal(abandoned.offer.consumedAt, null);
  app.setNow(new Date(baseTime.getTime() + 61_000));
  const renewed = await app.repository.reserve(app.scope, { tabId: "tab_two" });
  assert.equal(renewed.status, "reserved");
  assert.notEqual(renewed.offer.token, abandoned.offer.token);
  assert.equal(renewed.offer.consumedAt, null);
});

test("no candidate leaves the login allowance unconsumed", async () => {
  const app = harness();
  app.setCandidate(null);
  const result = await app.repository.reserve(app.scope, { tabId: "tab_one" });
  assert.equal(result.status, "none");
  assert.equal(result.offer, null);
  assert.equal(app.offer, null);
});
