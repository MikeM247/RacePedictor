import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachingReviewContext } from "../src/services/coaching-review-context.ts";
import type { CoachingReviewContextInput } from "../src/services/coaching-review-context.ts";

test("coaching review context is future-only, ordered, and deterministically hashed", () => {
  const input = fixture();
  const first = buildCoachingReviewContext(input);
  const regenerated = buildCoachingReviewContext({
    ...input,
    generatedAt: "2026-08-11T12:00:00.000Z",
    sessions: [...input.sessions].reverse(),
  });

  assert.equal(first.schema, "coaching-review-context.v1");
  assert.deepEqual(first.futureSessions.map(({ id }) => id), ["run-future"]);
  assert.equal(first.futureSessions[0].prescribed.title, "Easy run");
  assert.equal(first.futureSessions[0].effective.title, "Short easy run");
  assert.equal(first.futureSessions[0].amendments[0].reason, "Work travel requires a shorter session.");
  assert.equal(first.futureSessions[0].amendments[0].actorKind, "user");
  assert.equal(first.contentHash, regenerated.contentHash, "generation time and input order do not affect the aggregate hash");
  assert.equal(first.id, regenerated.id);
});

test("coaching review aggregate hash changes when an amendment reason changes", () => {
  const input = fixture();
  const first = buildCoachingReviewContext(input);
  const changed = fixture();
  changed.sessions[1].amendments[0].reason = "Recovery requires a shorter session.";
  const second = buildCoachingReviewContext(changed);

  assert.notEqual(first.contentHash, second.contentHash);
  assert.notEqual(first.id, second.id);
});

function fixture(): CoachingReviewContextInput {
  const prescribed = workout("run-future", "2026-08-12", "Easy run", 30);
  const effective = workout("run-future", "2026-08-12", "Short easy run", 25);
  return {
    athleteId: "athlete-a",
    generatedAt: "2026-08-10T12:00:00.000Z",
    currentLocalDate: "2026-08-10",
    activePlan: { id: "plan-a", version: 1, revision: 2, contentHash: "a".repeat(64) },
    sessions: [
      { id: "run-today", prescribed: workout("run-today", "2026-08-10", "Today", 20), effective: workout("run-today", "2026-08-10", "Today", 20), status: "upcoming", revision: 2, amendments: [] },
      {
        id: "run-future", prescribed, effective, status: "upcoming", revision: 3,
        amendments: [{
          id: "amendment-a", planId: "plan-a", sessionId: "run-future", operation: "amend",
          actor: "owner-a", actorKind: "user", changedAt: "2026-08-10T12:00:00.000Z",
          reason: "Work travel requires a shorter session.", changedFields: ["title", "durationMinutes"],
          before: { title: "Easy run", durationMinutes: 30 }, after: { title: "Short easy run", durationMinutes: 25 },
          expectedRevision: 2, resultingRevision: 3,
        }],
      },
    ],
  };
}

function workout(id: string, scheduledDate: string, title: string, durationMinutes: number) {
  return { id, kind: "run" as const, scheduledDate, title, purpose: "Aerobic base", prescription: "Run easily.", cautions: [], durationMinutes };
}
