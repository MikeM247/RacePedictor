import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalCoachingRepository } from "../../../packages/db/src/local-coaching-repository.js";
import {
  LocalCoachingServiceError,
  createLocalCoachingService,
} from "../lib/local-coaching-service.ts";

test("calendar service derives persisted effective state and same-day conflicts from immutable prescriptions", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-calendar-service-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const repository = createLocalCoachingRepository({ databasePath });
  const goal = repository.settleGoal(repository.createGoal({
    goalType: "race",
    title: "Synthetic race goal",
    targetDate: "2026-09-06",
  }).id);
  const proposal = repository.saveValidatedPlan({
    goalId: goal.id,
    title: "Synthetic calendar plan",
    startDate: "2026-08-05",
    endDate: "2026-09-06",
    workouts: [
      { id: "easy-run", localDate: "2026-08-06", title: "Easy run", workoutType: "run", durationMinutes: 45 },
      { id: "strength", localDate: "2026-08-07", title: "Strength", workoutType: "strength", durationMinutes: 30 },
    ],
  });
  repository.activatePlan(proposal.id);
  repository.close();

  const timestamp = "2026-08-05T04:00:00.000Z";
  let service = createLocalCoachingService({ databasePath, clock: () => new Date(timestamp) });
  const moved = service.editCalendar({
    planId: proposal.id,
    sessionId: "easy-run",
    operation: "reschedule",
    reason: "Move around a work commitment",
    effectiveDate: "2026-08-07",
    expectedRevision: 1,
    requestedAt: timestamp,
  });
  assert.equal(moved.prescribedDate, "2026-08-06");
  assert.equal(moved.effectiveDate, "2026-08-07");
  assert.equal(moved.warnings.length, 1);
  service.close();

  service = createLocalCoachingService({ databasePath, clock: () => new Date(timestamp) });
  const persisted = service.listActiveCalendar().find((session) => session.id === "easy-run")!;
  assert.equal(persisted.prescribedDate, "2026-08-06");
  assert.equal(persisted.effectiveDate, "2026-08-07");
  assert.equal(persisted.revision, 2);
  const skipped = service.editCalendar({
    planId: proposal.id,
    sessionId: "easy-run",
    operation: "skip",
    reason: "Recovery is needed",
    expectedRevision: 2,
    requestedAt: timestamp,
  });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.warnings.length, 0);
  assert.throws(
    () => service.editCalendar({
      planId: proposal.id,
      sessionId: "easy-run",
      operation: "restore",
      reason: "Recovery is complete",
      expectedRevision: 2,
      requestedAt: timestamp,
    }),
    (error) => error instanceof LocalCoachingServiceError && error.code === "REVISION_CONFLICT",
  );
  const restored = service.editCalendar({
    planId: proposal.id,
    sessionId: "easy-run",
    operation: "restore",
    reason: "Recovery is complete",
    expectedRevision: 3,
    requestedAt: timestamp,
  });
  assert.equal(restored.status, "upcoming");
  assert.equal(restored.warnings.length, 1);
  service.close();
});
