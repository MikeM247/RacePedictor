import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readLocalRaceHistory, saveLocalRaceHistory, deleteLocalRaceHistory, readCloudRaceHistory, saveCloudRaceHistory, raceHistoryActor, captureApprovedRaceTarget } from "../lib/server/race-history.ts";
import type { GoalContextRouteData } from "../../../packages/core/src/contracts/coaching.ts";
import { buildActorContext } from "../../../packages/core/src/contracts/auth.ts";
import type { RaceHistoryRecord } from "../../../packages/core/src/contracts/race-history.ts";

const record: RaceHistoryRecord = { id: "pb", title: "Comrades PB", achievement: "personal_best", confirmedBy: "user" };
test("local history persists, updates, deletes and isolates athletes with revision conflicts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "road-history-"));
  const file = path.join(root, "data.sqlite");
  try {
    assert.deepEqual(readLocalRaceHistory(file, "a"), []);
    assert.equal(saveLocalRaceHistory(file, "a", { record, expectedRevision: 0 }).revision, 1);
    assert.deepEqual(readLocalRaceHistory(file, "b"), []);
    assert.throws(() => saveLocalRaceHistory(file, "a", { record, expectedRevision: 0 }), { code: "CONFLICT" });
    saveLocalRaceHistory(file, "a", { record: { ...record, elapsedTimeSeconds: 40000 }, expectedRevision: 1 });
    assert.equal(readLocalRaceHistory(file, "a")[0].elapsedTimeSeconds, 40000);
    assert.throws(() => deleteLocalRaceHistory(file, "b", "pb", 2), { code: "CONFLICT" });
    deleteLocalRaceHistory(file, "a", "pb", 2);
    assert.deepEqual(readLocalRaceHistory(file, "a"), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("cloud queries bind athlete IDs and records as parameters; foreign activity links are rejected", async () => {
  const calls: unknown[][] = [];
  const prisma = {
    $queryRawUnsafe: async (...args: unknown[]) => { calls.push(args); return [{ record, revision: 1 }]; },
    activity: { findFirst: async () => null },
  } as unknown as Parameters<typeof readCloudRaceHistory>[1];
  assert.equal((await readCloudRaceHistory("athlete-a", prisma))[0].title, "Comrades PB");
  assert.equal(calls[0][1], "athlete-a");
  await saveCloudRaceHistory("athlete-a", { record: { ...record, title: "PB ' ; DROP TABLE activities; --" }, expectedRevision: 0 }, prisma);
  assert.equal(calls[1][0]?.toString().includes("DROP TABLE"), false);
  assert.ok(calls[1][3]?.toString().includes("DROP TABLE"));
  await assert.rejects(saveCloudRaceHistory("athlete-a", { record: { ...record, activityId: "foreign-activity" }, expectedRevision: 0 }, prisma), { code: "NOT_FOUND" });
});

test("cloud writes require a signed-in owner and use the active athlete", () => {
  const actor = buildActorContext({ userId: "owner", permittedAthleteIds: ["athlete-a"], activeAthleteId: "athlete-a", requestId: "test", credentialKind: "session" });
  assert.equal(raceHistoryActor({ mode: "authenticated", actor }, true), "athlete-a");
  assert.throws(() => raceHistoryActor({ mode: "local", actor: null }, true), { code: "UNAUTHENTICATED" });
  assert.throws(() => raceHistoryActor({ mode: "authenticated", actor: { ...actor, credentialKind: "device" } }, true), { code: "FORBIDDEN" });
});

test("target snapshots come from approved server data and survive plan changes; forged snapshots are rejected", () => {
  const context = { state: "ready", goal: null, plan: null, projection: null, milestones: [{ id: "target", title: "10 km sub-60", targetDate: "2026-10-17", targetTimeSeconds: 3600, distanceMeters: 10000 }] } as GoalContextRouteData;
  const result = { ...record, targetId: "target", raceDate: "2026-10-17", distanceMeters: 10000, elapsedTimeSeconds: 3500 };
  const captured = captureApprovedRaceTarget(result, context, []);
  assert.equal(captured.targetSnapshot?.targetTimeSeconds, 3600);
  const forged = { ...captured, targetSnapshot: { ...captured.targetSnapshot!, targetTimeSeconds: 99999 } };
  assert.equal(captureApprovedRaceTarget(forged, null, [captured]).targetSnapshot?.targetTimeSeconds, 3600);
  assert.throws(() => captureApprovedRaceTarget(forged, null, []), { code: "VALIDATION_ERROR" });
  assert.equal(captureApprovedRaceTarget({ ...record, targetSnapshot: captured.targetSnapshot }, null, []).targetSnapshot, undefined);
});
