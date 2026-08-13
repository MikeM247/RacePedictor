import assert from "node:assert/strict";
import test from "node:test";
import { trainingPlanSchema } from "../../../packages/core/src/contracts/coaching.ts";
import { buildCoachingReviewContext } from "../../../packages/core/src/services/coaching-review-context.ts";
import { buildActorContext } from "../../../packages/core/src/contracts/auth.ts";
import { ApiHttpError } from "../lib/server/api-response.ts";
import {
  CalendarSessionAmendmentError,
  TrainingPlanActivationError,
} from "../../../packages/db/src/cloud/index.js";
import { createSyntheticTestActor } from "../lib/server/auth.ts";
import {
  handleCloudActivities,
  handleCloudActivePlan,
  handleCloudCalendar,
  handleCloudCoachingReviewContext,
  handleCloudOnlineStatus,
  handleCloudPlan,
  handleCloudPlanActivation,
  handleCloudPlanHistory,
  handleCloudSessionAmendment,
  handleCloudSessionAmendmentHistory,
  handleCloudSyncChanges,
  handleCloudToday,
  type CloudReadComposition,
} from "../lib/server/cloud-read-handlers.ts";
import type { SensitiveRouteContext } from "../lib/server/route-security.ts";

const security: SensitiveRouteContext = {
  mode: "authenticated",
  actor: createSyntheticTestActor("owner-a", ["athlete-a"]),
};
const ownerSecurity: SensitiveRouteContext = {
  mode: "authenticated",
  actor: buildActorContext({
    userId: "owner-a",
    permittedAthleteIds: ["athlete-a"],
    activeAthleteId: "athlete-a",
    requestId: "request-plan-activation",
    credentialKind: "session",
  }),
};
const now = new Date("2026-08-10T06:00:00.000Z");
const parsedPlan = trainingPlanSchema.parse({
  id: "plan-a", athleteId: "athlete-a", goalId: "goal-a", goalRevision: 1, routineRevision: 1,
  version: 1, revision: 2, startsOn: "2026-08-10", endsOn: "2026-08-16", timezone: "Africa/Johannesburg",
  weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Synthetic week", sessionIds: ["run-a"] }],
  workouts: [{ id: "run-a", kind: "run", scheduledDate: "2026-08-10", title: "Easy run", purpose: "Aerobic base", prescription: "Run easily for 30 minutes.", cautions: [], durationMinutes: 30 }],
  contextArtifactId: "context-a", createdAt: "2026-08-09T08:00:00.000Z",
  approval: { goalRationale: "Synthetic rationale", rationale: "Synthetic rationale", summary: "Synthetic plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash: "b".repeat(64) },
  status: "active", activatedAt: "2026-08-09T09:00:00.000Z", activatedBy: "user",
});
if (parsedPlan.status !== "active") throw new Error("Expected an active plan fixture");
const plan = parsedPlan;
const { activatedAt: _activatedAt, activatedBy: _activatedBy, ...activePlanBody } = plan;
const retiredPlan = trainingPlanSchema.parse({
  ...activePlanBody,
  revision: 3,
  status: "retired",
  retiredAt: "2026-08-10T07:00:00.000Z",
});

test("cloud read handlers pass the authenticated athlete scope to every repository", async () => {
  const scopes: string[] = [];
  const composition = fakeComposition(scopes);
  const getComposition = () => composition;

  const activities = await handleCloudActivities(security, new Request("http://localhost/api/v1/activities?limit=20"), getComposition);
  const changes = await handleCloudSyncChanges(security, new Request("http://localhost/api/v1/sync/changes?limit=20"), getComposition);
  const status = await handleCloudOnlineStatus(security, new Request("http://localhost/api/v1/sync/status"), getComposition, () => now);
  const active = await handleCloudActivePlan(security, new Request("http://localhost/api/v1/coaching/plans/active"), getComposition);
  const history = await handleCloudPlanHistory(security, new Request("http://localhost/api/v1/coaching/plans/history"), getComposition);
  const version = await handleCloudPlan(security, "plan-a", getComposition);

  assert.equal((await activities.json()).data.items[0].athleteId, "athlete-a");
  assert.equal((await changes.json()).data.hasMore, false);
  assert.equal((await status.json()).data.athleteId, "athlete-a");
  assert.equal((await active.json()).data.id, "plan-a");
  assert.equal((await history.json()).data.plans.length, 1);
  assert.equal((await version.json()).data.plan.athleteId, "athlete-a");
  assert.deepEqual(new Set(scopes), new Set(["athlete-a"]));
});

test("cloud Calendar and Today work from approved structured data with no local service", async () => {
  const composition = fakeComposition([]);
  const getComposition = () => composition;
  const calendar = await handleCloudCalendar(
    security,
    new Request("http://localhost/api/v1/coaching/calendar?from=2026-08-10&to=2026-08-16"),
    getComposition,
  );
  const today = await handleCloudToday(
    security,
    new Request("http://localhost/api/v1/coaching/today?date=2026-08-10"),
    getComposition,
    () => now,
  );
  const calendarBody = await calendar.json();
  const todayBody = await today.json();
  assert.equal(calendarBody.data.sessions[0].id, "run-a");
  assert.equal(todayBody.data.state, "upcoming");
  assert.equal(todayBody.data.source, "fallback");
  const serialized = JSON.stringify({ calendarBody, todayBody });
  assert.doesNotMatch(serialized, /vault|relativePath|storageKey|credential|refreshToken/u);
  assert.doesNotMatch(serialized, /reviewed by AI|adapted online/u);
});

test("cloud coaching handlers reject invalid dates and missing foreign resources without disclosure", async () => {
  const composition = fakeComposition([]);
  const getComposition = () => composition;
  await assert.rejects(
    () => handleCloudCalendar(security, new Request("http://localhost/api/v1/coaching/calendar?from=bad&to=2026-08-16"), getComposition),
    (error: unknown) => error instanceof ApiHttpError && error.status === 400 && error.code === "VALIDATION_ERROR",
  );
  await assert.rejects(
    () => handleCloudPlan(security, "plan-b", getComposition),
    (error: unknown) => error instanceof ApiHttpError && error.status === 404 && error.code === "NOT_FOUND",
  );
});

test("cloud plan activation is owner-scoped, validates optimistic state, and maps conflicts", async () => {
  const scopes: string[] = [];
  const composition = fakeComposition(scopes);
  const response = await handleCloudPlanActivation(
    ownerSecurity,
    "plan-a",
    new Request("http://localhost/api/v1/coaching/plans/plan-a/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedActivePlanId: "plan-b" }),
    }),
    () => composition,
  );
  assert.equal((await response.json()).data.activePlan.id, "plan-a");
  assert.deepEqual(scopes, ["athlete-a"]);

  const conflicting = fakeComposition([]);
  conflicting.planActivation.activate = async () => {
    throw new TrainingPlanActivationError("PLAN_ACTIVATION_CONFLICT", "conflict");
  };
  await assert.rejects(
    () => handleCloudPlanActivation(
      ownerSecurity,
      "plan-a",
      new Request("http://localhost/api/v1/coaching/plans/plan-a/activate", {
        method: "POST",
        body: JSON.stringify({ expectedActivePlanId: "plan-b" }),
      }),
      () => conflicting,
    ),
    (error: unknown) => error instanceof ApiHttpError && error.status === 409 && error.code === "CONFLICT",
  );
});

test("cloud session amendment handlers require a reason and pass owner-scoped optimistic writes", async () => {
  const scopes: string[] = [];
  const composition = fakeComposition(scopes);
  const response = await handleCloudSessionAmendment(
    ownerSecurity,
    "run-a",
    new Request("http://localhost/api/v1/coaching/calendar/sessions/run-a/amendments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "browser-edit-1" },
      body: JSON.stringify({ operation: "amend", expectedRevision: 2, reason: "Work travel", changes: { durationMinutes: 25 } }),
    }),
    () => composition,
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.amendment.reason, "Work travel");
  const history = await handleCloudSessionAmendmentHistory(ownerSecurity, "run-a", () => composition);
  assert.equal((await history.json()).data.amendments[0].reason, "Work travel");
  assert.deepEqual(scopes, ["athlete-a", "athlete-a"]);

  await assert.rejects(
    () => handleCloudSessionAmendment(
      ownerSecurity,
      "run-a",
      new Request("http://localhost/api/v1/coaching/calendar/sessions/run-a/amendments", {
        method: "POST", body: JSON.stringify({ operation: "skip", expectedRevision: 2 }),
      }),
      () => composition,
    ),
    (error: unknown) => error instanceof ApiHttpError && error.status === 400 && error.code === "VALIDATION_ERROR",
  );
});

test("cloud coaching review context is owner-scoped and retains structured amendment reasons", async () => {
  const scopes: string[] = [];
  const composition = fakeComposition(scopes);
  const response = await handleCloudCoachingReviewContext(ownerSecurity, () => composition);
  const context = (await response.json()).data.context;
  assert.equal(context.schema, "coaching-review-context.v1");
  assert.equal(context.futureSessions[0].amendments[0].reason, "Work travel");
  assert.equal(context.futureSessions[0].amendments[0].actorKind, "user");
  assert.deepEqual(scopes, ["athlete-a"]);
});

test("cloud session amendment conflicts return a reload-and-review response", async () => {
  const composition = fakeComposition([]);
  composition.calendarSessions.amend = async () => {
    throw new CalendarSessionAmendmentError(
      "REVISION_CONFLICT",
      "The session changed; reload before editing again",
    );
  };

  await assert.rejects(
    () => handleCloudSessionAmendment(
      ownerSecurity,
      "run-a",
      new Request("http://localhost/api/v1/coaching/calendar/sessions/run-a/amendments", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "browser-conflict-1" },
        body: JSON.stringify({ operation: "skip", expectedRevision: 2, reason: "Recovery day" }),
      }),
      () => composition,
    ),
    (error: unknown) => error instanceof ApiHttpError
      && error.status === 409
      && error.code === "CONFLICT"
      && error.message === "The session changed; reload and review the latest values",
  );
});

function fakeComposition(scopes: string[]): CloudReadComposition {
  const record = (scope: { athleteId: string }) => scopes.push(scope.athleteId);
  const calendarSession = {
    ...plan.workouts[0],
    prescribedDate: plan.workouts[0].scheduledDate,
    effectiveDate: plan.workouts[0].scheduledDate,
    originalDate: plan.workouts[0].scheduledDate,
    status: "upcoming" as const,
    revision: 2,
    warnings: [],
    original: plan.workouts[0],
    amendments: [],
  };
  const amendment = {
    id: "amendment-a", planId: "plan-a", sessionId: "run-a", operation: "amend" as const,
    actor: "owner-a", changedAt: "2026-08-10T06:00:00.000Z", reason: "Work travel",
    changedFields: ["durationMinutes" as const], before: { durationMinutes: 30 }, after: { durationMinutes: 25 },
    expectedRevision: 2, resultingRevision: 3,
  };
  const reviewContext = buildCoachingReviewContext({
    athleteId: "athlete-a",
    generatedAt: "2026-08-10T06:00:00.000Z",
    currentLocalDate: "2026-08-09",
    activePlan: { id: plan.id, version: plan.version, revision: plan.revision, contentHash: plan.approval.contentHash },
    sessions: [{
      id: calendarSession.id,
      prescribed: plan.workouts[0],
      effective: { ...plan.workouts[0], durationMinutes: 25 },
      status: "upcoming",
      revision: 3,
      amendments: [{ ...amendment, actorKind: "user" }],
    }],
  });
  return {
    activities: {
      list: async (scope: { athleteId: string }) => {
        record(scope);
        return { items: [{ id: "activity-a", athleteId: scope.athleteId }], hasMore: false };
      },
      findById: async () => null,
    },
    dashboard: { getOverview: async () => ({ fetchStatus: "empty", reason: "No data" }) },
    changes: {
      list: async (scope: { athleteId: string }) => {
        record(scope);
        return { changes: [], nextCursor: null, hasMore: false };
      },
    },
    status: {
      getFacts: async (scope: { athleteId: string }) => {
        record(scope);
        return {
          athleteId: scope.athleteId,
          provider: { displayStatus: "connected", connectedAt: "2026-08-01T00:00:00.000Z", lastProviderContactAt: "2026-08-10T05:00:00.000Z" },
          ingestion: { lastEventAt: "2026-08-10T05:00:00.000Z", lastCanonicalUpdateAt: "2026-08-10T05:01:00.000Z", pendingJobs: 0, failedJobs: 0 },
          latestActivityAt: "2026-08-10T04:00:00.000Z",
          device: null,
          secondBrain: null,
        };
      },
    },
    coaching: {
      getActivePlan: async (scope: { athleteId: string }) => { record(scope); return scope.athleteId === "athlete-a" ? plan : null; },
      listHistory: async (scope: { athleteId: string }) => { record(scope); return scope.athleteId === "athlete-a" ? [plan] : []; },
      findPlan: async (scope: { athleteId: string }, planId: string) => { record(scope); return scope.athleteId === "athlete-a" && planId === plan.id ? plan : null; },
    },
    calendarSessions: {
      listActiveCalendar: async (scope: { athleteId: string }, range: { from: string; to: string }) => {
        record(scope);
        return calendarSession.effectiveDate >= range.from && calendarSession.effectiveDate <= range.to ? [calendarSession] : [];
      },
      amend: async (scope: { athleteId: string }, sessionId: string, input: { reason: string }) => {
        record(scope);
        assert.equal(sessionId, "run-a");
        assert.equal(input.reason, "Work travel");
        return { session: { ...calendarSession, durationMinutes: 25, revision: 3, amendments: [amendment] }, amendment, reused: false };
      },
      listHistory: async (scope: { athleteId: string }, sessionId: string) => {
        record(scope);
        assert.equal(sessionId, "run-a");
        return [amendment];
      },
      getReviewContext: async (scope: { athleteId: string }) => {
        record(scope);
        return reviewContext;
      },
    },
    planActivation: {
      activate: async (scope: { athleteId: string }, planId: string, expectedActivePlanId: string | null) => {
        record(scope);
        assert.equal(planId, "plan-a");
        assert.equal(expectedActivePlanId, "plan-b");
        return { activePlan: plan, retiredPlan, reused: false };
      },
    },
  } as unknown as CloudReadComposition;
}
