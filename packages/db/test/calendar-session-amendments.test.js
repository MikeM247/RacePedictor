import assert from "node:assert/strict";
import test from "node:test";
import { athleteScopeFor, buildActorContext } from "../../core/src/contracts/auth.ts";
import {
  CalendarSessionAmendmentError,
  PrismaCalendarSessionAmendmentRepository,
} from "../src/cloud/index.js";

const NOW = new Date("2026-08-10T12:00:00.000Z");

test("future cloud session amendments are atomic, append-only, replay-safe, and sync-visible", async () => {
  const prisma = fakePrisma();
  const repository = new PrismaCalendarSessionAmendmentRepository({ prisma, now: () => NOW });
  const result = await repository.amend(ownerScope("athlete-a"), "run-a", {
    operation: "amend",
    expectedRevision: 2,
    reason: "  Work travel requires a shorter session.  ",
    idempotencyKey: "amend-run-a-1",
    changes: { title: "Travel easy run", durationMinutes: 25 },
  });

  assert.equal(result.reused, false);
  assert.equal(result.session.title, "Travel easy run");
  assert.equal(result.session.durationMinutes, 25);
  assert.equal(result.session.original.title, "Easy run");
  assert.equal(result.session.revision, 3);
  assert.equal(result.amendment.reason, "Work travel requires a shorter session.");
  assert.deepEqual(result.amendment.changedFields, ["title", "durationMinutes"]);
  assert.equal(prisma.projection.plan.workouts[0].title, "Easy run", "approved plan JSON stays immutable");
  assert.deepEqual(prisma.changes.map((change) => [change.entityType, change.entityId, change.entityVersion]), [
    ["calendar_session", "run-a", 3],
  ]);

  const replay = await repository.amend(ownerScope("athlete-a"), "run-a", {
    operation: "amend",
    expectedRevision: 2,
    reason: "Work travel requires a shorter session.",
    idempotencyKey: "amend-run-a-1",
    changes: { title: "Travel easy run", durationMinutes: 25 },
  });
  assert.equal(replay.reused, true);
  assert.equal(prisma.amendments.length, 1);
  assert.equal(prisma.changes.length, 1);

  await assert.rejects(
    repository.amend(ownerScope("athlete-a"), "run-a", {
      operation: "skip", expectedRevision: 2, reason: "Recovery", idempotencyKey: "skip-stale", changes: {},
    }),
    (error) => error instanceof CalendarSessionAmendmentError && error.code === "REVISION_CONFLICT",
  );
  await assert.rejects(
    repository.amend(ownerScope("athlete-b"), "run-a", {
      operation: "skip", expectedRevision: 3, reason: "Recovery", idempotencyKey: "foreign", changes: {},
    }),
    (error) => error instanceof CalendarSessionAmendmentError && error.code === "SESSION_NOT_FOUND",
  );
});

test("cloud session amendments require owner credentials, reasons, and an eligible session date", async () => {
  const prisma = fakePrisma();
  const repository = new PrismaCalendarSessionAmendmentRepository({ prisma, now: () => new Date("2026-08-12T12:00:00.000Z") });
  await assert.rejects(
    repository.amend(deviceScope("athlete-a"), "run-a", {
      operation: "skip", expectedRevision: 2, reason: "Recovery", idempotencyKey: "device", changes: {},
    }),
    (error) => error instanceof CalendarSessionAmendmentError && error.code === "SESSION_REQUIRED",
  );
  await assert.rejects(
    repository.amend(ownerScope("athlete-a"), "run-a", {
      operation: "skip", expectedRevision: 2, reason: "   ", idempotencyKey: "blank", changes: {},
    }),
    (error) => error instanceof CalendarSessionAmendmentError && error.code === "VALIDATION_ERROR",
  );
  await assert.rejects(
    repository.amend(ownerScope("athlete-a"), "run-a", {
      operation: "skip", expectedRevision: 2, reason: "Recovery", idempotencyKey: "today", changes: {},
    }),
    (error) => error instanceof CalendarSessionAmendmentError && error.code === "FUTURE_ONLY",
  );
});

test("a past cloud session can only be recorded as skipped with append-only history", async () => {
  const prisma = fakePrisma();
  const repository = new PrismaCalendarSessionAmendmentRepository({ prisma, now: () => new Date("2026-08-13T12:00:00.000Z") });
  const result = await repository.amend(ownerScope("athlete-a"), "run-a", {
    operation: "skip", expectedRevision: 2, reason: "Skipped by athlete.", idempotencyKey: "past-skip", changes: {},
  });

  assert.equal(result.reused, false);
  assert.equal(result.session.status, "skipped");
  assert.equal(result.session.revision, 3);
  assert.equal(result.amendment.reason, "Skipped by athlete.");
  assert.deepEqual(result.amendment.changedFields, ["status"]);
  assert.equal(prisma.projection.plan.workouts[0].title, "Easy run", "approved plan JSON stays immutable");
  assert.deepEqual(prisma.amendments[0].beforeValues, { session: approvedPlan().workouts[0], status: "upcoming" });
  assert.deepEqual(prisma.amendments[0].afterValues, { session: approvedPlan().workouts[0], status: "skipped" });
  const [calendarSession] = await repository.listActiveCalendar(ownerScope("athlete-a"), { from: "2026-08-10", to: "2026-08-16" });
  assert.equal(calendarSession.status, "skipped");
  assert.equal(calendarSession.amendments[0].reason, "Skipped by athlete.");

  await assert.rejects(
    repository.amend(ownerScope("athlete-a"), "run-a", {
      operation: "restore", expectedRevision: 3, reason: "Reconsidered.", idempotencyKey: "past-restore", changes: {},
    }),
    (error) => error instanceof CalendarSessionAmendmentError && error.code === "FUTURE_ONLY",
  );
});

test("cloud coaching review context exposes owner-scoped reasons with a deterministic aggregate hash", async () => {
  const prisma = fakePrisma();
  const repository = new PrismaCalendarSessionAmendmentRepository({ prisma, now: () => NOW });
  await repository.amend(ownerScope("athlete-a"), "run-a", {
    operation: "amend",
    expectedRevision: 2,
    reason: "Work travel requires a shorter session.",
    idempotencyKey: "review-context-amendment",
    changes: { durationMinutes: 25 },
  });

  const first = await repository.getReviewContext(ownerScope("athlete-a"));
  const repeated = await repository.getReviewContext(ownerScope("athlete-a"));
  assert.equal(first.schema, "coaching-review-context.v1");
  assert.equal(first.activePlan.contentHash, "b".repeat(64));
  assert.equal(first.futureSessions[0].prescribed.durationMinutes, 30);
  assert.equal(first.futureSessions[0].effective.durationMinutes, 25);
  assert.equal(first.futureSessions[0].amendments[0].reason, "Work travel requires a shorter session.");
  assert.equal(first.futureSessions[0].amendments[0].actorKind, "user");
  assert.equal(first.contentHash, repeated.contentHash);

  await assert.rejects(
    repository.getReviewContext(deviceScope("athlete-a")),
    (error) => error instanceof CalendarSessionAmendmentError && error.code === "SESSION_REQUIRED",
  );
});

test("Prisma serializable write conflicts require the caller to reload the session", async () => {
  const prisma = fakePrisma();
  prisma.$transaction = async () => {
    const error = new Error("Transaction failed due to a write conflict or a deadlock");
    error.code = "P2034";
    throw error;
  };
  const repository = new PrismaCalendarSessionAmendmentRepository({ prisma, now: () => NOW });

  await assert.rejects(
    repository.amend(ownerScope("athlete-a"), "run-a", {
      operation: "skip",
      expectedRevision: 2,
      reason: "Recovery is more important today",
      idempotencyKey: "serializable-conflict",
      changes: {},
    }),
    (error) => error instanceof CalendarSessionAmendmentError
      && error.code === "REVISION_CONFLICT"
      && error.message === "The session changed; reload before editing again",
  );
});

function ownerScope(athleteId) {
  return scope(athleteId, "session");
}

function deviceScope(athleteId) {
  return scope(athleteId, "device");
}

function scope(athleteId, credentialKind) {
  return athleteScopeFor(buildActorContext({
    userId: credentialKind === "session" ? `owner-${athleteId}` : `device-${athleteId}`,
    permittedAthleteIds: [athleteId],
    activeAthleteId: athleteId,
    requestId: `request-${credentialKind}-${athleteId}`,
    credentialKind,
  }));
}

function approvedPlan() {
  return {
    id: "plan-a", athleteId: "athlete-a", goalId: "goal-a", goalRevision: 1, routineRevision: 1,
    version: 1, revision: 2, startsOn: "2026-08-10", endsOn: "2026-08-16", timezone: "Africa/Johannesburg",
    weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Aerobic week", sessionIds: ["run-a"] }],
    workouts: [{ id: "run-a", kind: "run", scheduledDate: "2026-08-12", title: "Easy run", purpose: "Aerobic base", prescription: "Run easily for 30 minutes.", cautions: [], durationMinutes: 30 }],
    contextArtifactId: "context-a", createdAt: "2026-08-09T08:00:00.000Z",
    approval: { goalRationale: "Goal", rationale: "Plan", summary: "Plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash: "b".repeat(64) },
    status: "active", activatedAt: "2026-08-09T09:00:00.000Z", activatedBy: "user",
  };
}

function fakePrisma() {
  const plan = approvedPlan();
  const projection = {
    id: "projection-a", athleteId: "athlete-a", planId: plan.id, planVersion: plan.version,
    planStatus: plan.status, active: true, contentHash: plan.approval.contentHash, plan,
  };
  const sessions = [{
    id: "session-a", athleteId: "athlete-a", planId: "plan-a", sessionId: "run-a",
    prescribedSession: plan.workouts[0], effectiveSession: plan.workouts[0], status: "upcoming", revision: 2,
  }];
  const amendments = [];
  const changes = [];
  const findSession = (key) => sessions.find((row) => row.athleteId === key.athleteId && row.planId === key.planId && row.sessionId === key.sessionId) ?? null;
  const transaction = {
    trainingPlanProjection: {
      findMany: async ({ where }) => where.athleteId === projection.athleteId && where.active ? [projection] : [],
    },
    calendarSessionProjection: {
      findUnique: async ({ where, include }) => {
        const row = findSession(where.athleteId_planId_sessionId);
        return row && include ? { ...row, amendments: amendments.filter((item) => item.sessionId === row.sessionId) } : row;
      },
      findMany: async ({ where }) => sessions.filter((row) => row.athleteId === where.athleteId && row.planId === where.planId)
        .map((row) => ({ ...row, amendments: amendments.filter((item) => item.sessionId === row.sessionId) })),
      create: async ({ data }) => { const row = { id: `session-${sessions.length + 1}`, ...data }; sessions.push(row); return row; },
      update: async ({ where, data }) => { const row = findSession(where.athleteId_planId_sessionId); Object.assign(row, data); return row; },
    },
    calendarSessionAmendment: {
      findUnique: async ({ where }) => amendments.find((row) => row.athleteId === where.athleteId_idempotencyKey.athleteId && row.idempotencyKey === where.athleteId_idempotencyKey.idempotencyKey) ?? null,
      findMany: async ({ where }) => amendments.filter((row) => row.athleteId === where.athleteId && row.planId === where.planId && row.sessionId === where.sessionId),
      create: async ({ data }) => { const row = { id: `amendment-${amendments.length + 1}`, createdAt: data.requestedAt, ...data }; amendments.push(row); return row; },
    },
    syncChange: {
      aggregate: async () => ({ _max: { cursor: changes.at(-1)?.cursor ?? null } }),
      create: async ({ data }) => { changes.push(data); return data; },
    },
  };
  return {
    projection, sessions, amendments, changes,
    trainingPlanProjection: transaction.trainingPlanProjection,
    calendarSessionProjection: transaction.calendarSessionProjection,
    calendarSessionAmendment: transaction.calendarSessionAmendment,
    $transaction: async (action) => action(transaction),
  };
}
