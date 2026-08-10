import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalCoachingRepository } from "../../../packages/db/src/local-coaching-repository.js";
import { GET as getActivePlan } from "../app/api/v1/coaching/plans/active/route.ts";
import { GET as getPlanHistory } from "../app/api/v1/coaching/plans/history/route.ts";
import { GET as getPlanVersion } from "../app/api/v1/coaching/plans/[planId]/route.ts";

const responseBody = async (response: Response) => response.json() as Promise<Record<string, any>>;
const getRequest = (path: string) => new Request(`http://localhost${path}`);

test("legacy approved plans are rehydrated through active, history, and detail routes after restart", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-legacy-active-plan-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const repository = createLocalCoachingRepository({ databasePath });
  const goal = repository.settleGoal(repository.createGoal({
    goalType: "consistency",
    title: "Legacy consistency goal",
    targetDate: "2026-09-06",
    details: {
      why: "Preserve a dependable running routine.",
      target: {
        kind: "consistency",
        sessionsPerWeek: 2,
        minimumMinutesPerWeek: 60,
        startsOn: "2026-08-10",
        endsOn: "2026-09-06",
      },
    },
  }).id);
  const proposal = repository.saveValidatedPlan({
    goalId: goal.id,
    title: "Legacy approved plan",
    startDate: "2026-08-10",
    endDate: "2026-09-06",
    summary: { phase: "base" },
    workouts: [{
      id: "legacy_easy_run",
      localDate: "2026-08-10",
      title: "Legacy easy run",
      workoutType: "easy",
      durationMinutes: 45,
      distanceM: 7000,
      intensity: "easy",
      details: { purpose: "Build consistency from the existing approved plan." },
    }],
  });
  const active = repository.activatePlan(proposal.id);
  repository.close();

  process.env.RACEPREDICTOR_DATABASE_PATH = databasePath;
  process.env.RACEPREDICTOR_COACH_EXCHANGE_PATH = path.join(directory, "Coach Exchange");
  process.env.RACEPREDICTOR_VAULT_PATH = path.join(directory, "vault");
  process.env.RACEPREDICTOR_ATHLETE_ID = "athlete_001";
  try {
    const activeResponse = await getActivePlan(getRequest("/api/v1/coaching/plans/active"));
    assert.equal(activeResponse.status, 200);
    const restored = (await responseBody(activeResponse)).data;
    assert.equal(restored.id, active.id);
    assert.equal(restored.status, "active");
    assert.equal(restored.timezone, "Africa/Johannesburg");
    assert.deepEqual(restored.weeklyStructure[0].sessionIds, ["legacy_easy_run"]);
    assert.equal(restored.workouts[0].kind, "run");
    assert.equal(restored.workouts[0].prescription, "Build consistency from the existing approved plan.");
    assert.deepEqual(restored.workouts[0].cautions, []);
    assert.match(restored.approval.sourceHistoryFingerprint, /^[a-f0-9]{64}$/);
    assert.match(restored.approval.contentHash, /^[a-f0-9]{64}$/);

    const historyResponse = await getPlanHistory(getRequest("/api/v1/coaching/plans/history"));
    assert.equal(historyResponse.status, 200);
    const history = (await responseBody(historyResponse)).data.plans;
    assert.equal(history.length, 1);
    assert.equal(history[0].id, active.id);

    const detailResponse = await getPlanVersion(
      new Request(`http://localhost/api/v1/coaching/plans/${active.id}`),
      { params: Promise.resolve({ planId: active.id }) },
    );
    assert.equal(detailResponse.status, 200);
    assert.equal((await responseBody(detailResponse)).data.plan.id, active.id);
  } finally {
    delete process.env.RACEPREDICTOR_DATABASE_PATH;
    delete process.env.RACEPREDICTOR_COACH_EXCHANGE_PATH;
    delete process.env.RACEPREDICTOR_VAULT_PATH;
    delete process.env.RACEPREDICTOR_ATHLETE_ID;
  }
});
