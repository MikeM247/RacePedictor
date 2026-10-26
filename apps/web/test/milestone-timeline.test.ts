import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { emptyMilestoneState } from "../../../packages/core/src/contracts/milestone-timeline.ts";
import { readCloudMilestoneState, writeCloudMilestoneState, readLocalMilestoneState, writeLocalMilestoneState, withLocalMilestoneTransaction, MilestoneRevisionConflict } from "../../../packages/db/src/milestone-timeline.ts";
import { readMilestones, mutateMilestones, milestoneView, verifyMilestoneChange } from "../lib/server/milestone-timeline.ts";
import { saveLocalRaceHistory, readLocalRaceHistory } from "../lib/server/race-history.ts";
import { createCloudGoalContextReadComposition } from "../lib/server/cloud-read-composition.ts";
import { buildActorContext } from "../../../packages/core/src/contracts/auth.ts";
import { handleCloudActiveGoalContext } from "../lib/server/cloud-read-handlers.ts";

test("local reads never create state; transactions persist athlete-scoped removals, reject stale writes and roll back", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "milestone-state-")), "state.sqlite");
  assert.equal(readLocalMilestoneState(file, "a").revision, 0); assert.equal(existsSync(file), false);
  const state = emptyMilestoneState();
  withLocalMilestoneTransaction(file, (db) => writeLocalMilestoneState(db, "a", 0, state));
  assert.equal(readLocalMilestoneState(file, "a").revision, 1); assert.equal(readLocalMilestoneState(file, "b").revision, 0);
  assert.throws(() => withLocalMilestoneTransaction(file, (db) => writeLocalMilestoneState(db, "a", 0, state)), MilestoneRevisionConflict);
  assert.throws(() => withLocalMilestoneTransaction(file, (db) => { writeLocalMilestoneState(db, "a", 1, state); throw new Error("rollback"); }), /rollback/);
  assert.equal(readLocalMilestoneState(file, "a").revision, 1);
});

test("PostgreSQL migration validates FK ownership, persistence, first-write races and subsequent revision conflicts", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE athletes (id TEXT PRIMARY KEY); INSERT INTO athletes VALUES ('a'), ('b');");
    await db.exec(await readFile(new URL("../../../packages/db/prisma/migrations/20261025190000_milestone_timeline_state/migration.sql", import.meta.url), "utf8"));
    const sql = { $queryRawUnsafe: async <T>(query: string, ...values: unknown[]) => (await db.query(query, values)).rows as T };
    const state = emptyMilestoneState();
    assert.equal((await readCloudMilestoneState("a", sql)).revision, 0);
    await writeCloudMilestoneState("a", 0, state, sql);
    assert.equal((await readCloudMilestoneState("b", sql)).revision, 0);
    await assert.rejects(writeCloudMilestoneState("a", 0, state, sql), MilestoneRevisionConflict);
    await writeCloudMilestoneState("a", 1, state, sql);
    assert.equal((await readCloudMilestoneState("a", sql)).revision, 2);
    await assert.rejects(writeCloudMilestoneState("a", 1, state, sql), MilestoneRevisionConflict);
    await assert.rejects(writeCloudMilestoneState("foreign", 0, state, sql));
  } finally { await db.close(); }
});

test("API service removes and restores without deleting results; stale source edits and foreign identities are rejected", async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "milestone-api-")), "state.sqlite");
  const previous = { db: process.env.RACEPREDICTOR_DATABASE_PATH, athlete: process.env.RACEPREDICTOR_ATHLETE_ID };
  process.env.RACEPREDICTOR_DATABASE_PATH = file; process.env.RACEPREDICTOR_ATHLETE_ID = "a";
  const security = { mode: "local" as const, actor: null };
  const record = { id: "result", title: "Saved race", confirmedBy: "user", achievement: "personal_best" };
  try {
    saveLocalRaceHistory(file, "a", { record, expectedRevision: 0 });
    const before = await readMilestones(security);
    const inspect = new DatabaseSync(file, { readOnly: true });
    assert.equal(inspect.prepare("SELECT name FROM sqlite_master WHERE name='milestone_timeline_state'").get(), undefined); inspect.close();
    const command = { operation: "remove", entryId: "achievement:result", sourceVersion: before.sourceVersion, expectedRevision: before.revision };
    const removed = await mutateMilestones(security, command);
    assert.equal(removed.entries.length, 0); assert.equal(removed.removed.length, 1); assert.equal(readLocalRaceHistory(file, "a").length, 1);
    await assert.rejects(mutateMilestones(security, command), { status: 409 });
    const restored = await mutateMilestones(security, { ...command, operation: "restore", entryId: removed.removed[0].id, sourceVersion: removed.sourceVersion, expectedRevision: removed.revision });
    assert.equal(restored.entries.length, 1);
    saveLocalRaceHistory(file, "a", { record: { ...record, title: "Corrected" }, expectedRevision: 1 });
    await assert.rejects(mutateMilestones(security, { ...command, sourceVersion: restored.sourceVersion, expectedRevision: restored.revision }), { status: 409 });
    const fresh = await readMilestones(security);
    await assert.rejects(mutateMilestones(security, { ...command, entryId: "achievement:foreign", sourceVersion: fresh.sourceVersion, expectedRevision: fresh.revision }), { status: 409 });
  } finally {
    if (previous.db === undefined) delete process.env.RACEPREDICTOR_DATABASE_PATH; else process.env.RACEPREDICTOR_DATABASE_PATH = previous.db;
    if (previous.athlete === undefined) delete process.env.RACEPREDICTOR_ATHLETE_ID; else process.env.RACEPREDICTOR_ATHLETE_ID = previous.athlete;
  }
});

test("unavailable sources fail closed and management/source revisions are both required", () => {
  const view = milestoneView({ context: null, history: [], availability: { goal: false, history: true } }, { revision: 0, state: emptyMilestoneState() });
  assert.throws(() => verifyMilestoneChange({ operation: "remove", entryId: "target:x", expectedRevision: 0, sourceVersion: view.sourceVersion }, view), { status: 503 });
});

test("cloud goal-context reads accept transaction-only clients without constructing publishing repositories", async () => {
  const transaction = {
    trainingPlanProjection: { findMany: async () => [] },
    trainingPlanGoalContextProjection: { findUnique: async () => null },
  } as unknown as Parameters<typeof createCloudGoalContextReadComposition>[0];
  const composition = createCloudGoalContextReadComposition(transaction);
  assert.equal("publish" in composition.goalContexts, false);
  const actor = buildActorContext({ userId: "owner", activeAthleteId: "a", permittedAthleteIds: ["a"], requestId: "test", credentialKind: "session" });
  const response = await handleCloudActiveGoalContext({ mode: "authenticated", actor }, () => composition);
  assert.equal((await response.json()).data.context.state, "no_active_plan");
});
