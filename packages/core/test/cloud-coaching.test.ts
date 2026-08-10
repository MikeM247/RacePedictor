import assert from "node:assert/strict";
import test from "node:test";
import { trainingPlanSchema, type TrainingPlan } from "../src/contracts/coaching.ts";
import { projectCloudCalendar, projectCloudToday } from "../src/services/cloud-coaching.ts";

const plan = trainingPlanSchema.parse({
  id: "plan-1",
  athleteId: "athlete-a",
  goalId: "goal-1",
  goalRevision: 1,
  routineRevision: 1,
  version: 1,
  revision: 2,
  startsOn: "2026-08-10",
  endsOn: "2026-08-16",
  timezone: "Africa/Johannesburg",
  weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Safe aerobic consistency", sessionIds: ["run-1", "rest-1"] }],
  workouts: [
    { id: "run-1", kind: "run", scheduledDate: "2026-08-10", title: "Easy run", purpose: "Aerobic base", prescription: "Run easily for 40 minutes.", cautions: [], durationMinutes: 40, intensityRpe: 3 },
    { id: "rest-1", kind: "rest", scheduledDate: "2026-08-11", title: "Rest", purpose: "Recover", prescription: "Rest from structured training.", cautions: [], durationMinutes: 0 },
  ],
  contextArtifactId: "context-1",
  createdAt: "2026-08-09T08:00:00.000Z",
  approval: {
    goalRationale: "Synthetic goal rationale",
    rationale: "Synthetic approval rationale",
    summary: "Synthetic approved plan",
    assumptions: [],
    cautions: [],
    sourceHistoryFingerprint: "a".repeat(64),
    contentHash: "b".repeat(64),
  },
  status: "active",
  activatedAt: "2026-08-09T09:00:00.000Z",
  activatedBy: "user",
}) as TrainingPlan;

test("cloud calendar projects only approved structured sessions in the requested range", () => {
  const result = projectCloudCalendar({ plan, from: "2026-08-10", to: "2026-08-10" });
  assert.deepEqual(result.sessions.map((session) => session.id), ["run-1"]);
  assert.equal(result.sessions[0].prescribedDate, result.sessions[0].effectiveDate);
  assert.equal(result.sessions[0].revision, 2);
  assert.doesNotMatch(JSON.stringify(result), /relativePath|vault|storageKey/u);
});
test("cloud Today is truthful about approved, rest, missed, and no-plan states", () => {
  const generatedAt = new Date("2026-08-10T06:00:00.000Z");
  assert.equal(projectCloudToday({ athleteId: "athlete-a", plan, date: "2026-08-10", generatedAt }).state, "upcoming");
  assert.equal(projectCloudToday({ athleteId: "athlete-a", plan, date: "2026-08-11", generatedAt }).state, "rest");
  assert.equal(projectCloudToday({ athleteId: "athlete-a", plan, date: "2026-08-09", generatedAt }).state, "rest");
  const empty = projectCloudToday({ athleteId: "athlete-a", plan: null, date: "2026-08-10", generatedAt });
  assert.equal(empty.state, "no-plan");
  assert.equal(empty.source, "fallback");
  assert.match(empty.message, /No approved plan/u);
  assert.doesNotMatch(empty.message, /reviewed by AI|adapted/u);
});

test("cloud coaching rejects an invalid or foreign-shaped plan before projection", () => {
  assert.throws(() => projectCloudCalendar({
    plan: { ...plan, athleteId: "athlete-b", localVaultPath: "secret" } as unknown as TrainingPlan,
    from: "2026-08-10",
    to: "2026-08-16",
  }));
});
