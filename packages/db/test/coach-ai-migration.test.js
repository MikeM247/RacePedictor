import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(new URL("../prisma/migrations/20261025110000_coach_ai_settings/migration.sql", import.meta.url), "utf8");

test("coach settings and review request configuration are additive and athlete scoped", () => {
  assert.match(schema, /model CoachAiConfiguration \{/u);
  assert.match(schema, /athleteId\s+String\s+@unique/u);
  assert.match(schema, /providerReturnedModel\s+String\?/u);
  assert.match(migration, /CREATE TABLE "coach_ai_configurations"/u);
  assert.match(migration, /REFERENCES "athletes"\("id"\) ON DELETE CASCADE/u);
  for (const field of ["executionTarget", "provider", "requestedModel", "configurationRevision", "forceRegenerate", "expectedReviewRevision"]) assert.match(migration, new RegExp(`ADD COLUMN "${field}"`, "u"));
  assert.match(migration, /lockedBy.*<> 'cloud-coach-worker'/u);
});
