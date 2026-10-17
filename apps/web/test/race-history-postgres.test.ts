import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { readCloudRaceHistory, saveCloudRaceHistory, deleteCloudRaceHistory } from "../lib/server/race-history.ts";

test("PostgreSQL migration and actual parameterised race-history SQL support persistent scoped CRUD", async () => {
  const database = new PGlite();
  try {
    await database.exec('CREATE TABLE athletes (id TEXT PRIMARY KEY); INSERT INTO athletes VALUES (\'a\'), (\'b\');');
    await database.exec(await readFile(new URL("../../../packages/db/prisma/migrations/20261017120000_race_achievements/migration.sql", import.meta.url), "utf8"));
    const prisma = {
      $queryRawUnsafe: async (sql: string, ...parameters: unknown[]) => (await database.query(sql, parameters)).rows,
      $executeRawUnsafe: async (sql: string, ...parameters: unknown[]) => (await database.query(sql, parameters)).affectedRows,
    } as unknown as Parameters<typeof readCloudRaceHistory>[1];
    const record = { id: "race-pg", title: "Comrades PB", confirmedBy: "user", achievement: "personal_best" };
    await saveCloudRaceHistory("a", { record, expectedRevision: 0 }, prisma);
    assert.equal((await readCloudRaceHistory("a", prisma))[0].title, "Comrades PB");
    assert.deepEqual(await readCloudRaceHistory("b", prisma), []);
    await assert.rejects(saveCloudRaceHistory("a", { record, expectedRevision: 0 }, prisma), { code: "CONFLICT" });
    await saveCloudRaceHistory("a", { record: { ...record, elapsedTimeSeconds: 39000 }, expectedRevision: 1 }, prisma);
    assert.equal((await readCloudRaceHistory("a", prisma))[0].revision, 2);
    await assert.rejects(deleteCloudRaceHistory("b", record.id, 2, prisma), { code: "CONFLICT" });
    await deleteCloudRaceHistory("a", record.id, 2, prisma);
    assert.deepEqual(await readCloudRaceHistory("a", prisma), []);
  } finally { await database.close(); }
});
