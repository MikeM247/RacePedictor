import assert from "node:assert/strict";
import test from "node:test";
import { readPaceComparison, readPaceContext, publishPaceComparison } from "../lib/server/pace-comparison-handlers.ts";
import { createSyntheticTestActor } from "../lib/server/auth.ts";
import { ApiHttpError } from "../lib/server/api-response.ts";
import { PaceComparisonError, publishedComparison } from "../../../packages/core/src/services/activity-pace-comparison.ts";
import { paceArtifactSchema } from "../../../packages/core/src/contracts/activity-pace-comparison.ts";
import { activity, artifact, source } from "../../../packages/core/test/fixtures/pace-comparison.ts";

const actor = createSyntheticTestActor("owner", [activity.athleteId]);
const owner = { mode: "authenticated" as const, actor };
const security = { actor, device: { id: "device", athleteId: activity.athleteId, displayName: "PC", status: "active" as const, lastAcknowledgedCursor: null, lastSeenAt: null, createdAt: "2026-10-06T00:00:00.000Z", revokedAt: null } };
const saved = publishedComparison(paceArtifactSchema.parse(artifact()), "2026-10-06T10:00:00.000Z");
const repository = {
  read: async (scope: { athleteId: string }, id: string) => { assert.equal(scope.athleteId, activity.athleteId); assert.equal(id, activity.id); return { data: { activityId: id, status: "ready" as const, comparison: saved } }; },
  context: async (scope: { athleteId: string }, id: string, planId: string, sessionId: string, revision?: number | null) => { assert.equal(scope.athleteId, activity.athleteId); assert.equal(id, activity.id); assert.equal(planId, source.planId); assert.equal(sessionId, source.sessionId); assert.equal(revision, null); return { activity, source, activityRevision: 3, comparisonRevision: 0 }; },
  publish: async (scope: { athleteId: string }, input: unknown, device: string) => { assert.equal(scope.athleteId, activity.athleteId); assert.deepEqual(input, artifact()); assert.equal(device, "device"); return saved; },
};
test("comparison routes use authenticated scope and require explicit source selection", async () => {
  assert.equal((await readPaceComparison(owner, activity.id, () => repository)).status, 200);
  const context = await readPaceContext(security, new Request(`http://localhost/?planId=${source.planId}&sessionId=${source.sessionId}`), activity.id, () => repository);
  assert.equal((await context.json()).data.activityRevision, 3);
  await assert.rejects(() => readPaceContext(security, new Request("http://localhost/"), activity.id, () => repository), (e: unknown) => e instanceof ApiHttpError && e.status === 400);
  const published = await publishPaceComparison(security, new Request("http://localhost/", { method: "POST", body: JSON.stringify(artifact()) }), () => repository);
  assert.equal(published.status, 201);
});
test("malformed publications and repository conflicts remain explicit", async () => {
  await assert.rejects(() => publishPaceComparison(security, new Request("http://localhost/", { method: "POST", body: "{}" }), () => repository), (e: unknown) => e instanceof ApiHttpError && e.status === 400);
  await assert.rejects(() => readPaceComparison(owner, activity.id, () => ({ ...repository, read: async () => { throw new PaceComparisonError("NOT_FOUND", "Activity was not found"); } })), (e: unknown) => e instanceof ApiHttpError && e.status === 404);
  await assert.rejects(() => publishPaceComparison(security, new Request("http://localhost/", { method: "POST", body: JSON.stringify(artifact()) }), () => ({ ...repository, publish: async () => { throw new PaceComparisonError("CONFLICT", "Reload and review"); } })), (e: unknown) => e instanceof ApiHttpError && e.status === 409);
});
test("rollback disables overlays and publication without opening a repository", async () => {
  const previous = process.env.RACEPREDICTOR_PACE_COMPARISONS_ENABLED;
  process.env.RACEPREDICTOR_PACE_COMPARISONS_ENABLED = "false";
  const unavailable = () => { throw new Error("Repository must not be opened"); };
  try {
    const response = await readPaceComparison(owner, activity.id, unavailable);
    assert.equal((await response.json()).data.status, "none");
    await assert.rejects(() => publishPaceComparison(security, new Request("http://localhost/", { method: "POST", body: "{}" }), unavailable), (e: unknown) => e instanceof ApiHttpError && e.status === 503);
  } finally {
    if (previous === undefined) delete process.env.RACEPREDICTOR_PACE_COMPARISONS_ENABLED;
    else process.env.RACEPREDICTOR_PACE_COMPARISONS_ENABLED = previous;
  }
});
