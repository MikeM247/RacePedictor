import assert from "node:assert/strict";
import test from "node:test";
import { buildActorContext, athleteScopeFor } from "../../core/src/contracts/auth.ts";
import { CoachAiConfigurationConflictError, PrismaCoachAiConfigurationRepository } from "../src/cloud/prisma-coach-ai-configuration-repository.js";

function scope(athleteId = "athlete-a") {
  return athleteScopeFor(buildActorContext({ userId: "owner-a", permittedAthleteIds: [athleteId], activeAthleteId: athleteId, requestId: "settings-test", credentialKind: "session" }));
}

test("effective coach settings default to the environment OpenAI model, then gpt-5-mini", async () => {
  const repository = new PrismaCoachAiConfigurationRepository({ prisma: { coachAiConfiguration: { findUnique: async () => null } } });
  assert.deepEqual(await repository.get(scope(), { RACEPREDICTOR_ACTIVITY_REVIEW_MODEL: "gpt-4.1-mini", OPENAI_API_KEY: "configured" }), { provider: "openai", modelId: "gpt-4.1-mini", revision: 0, credentials: { openai: true, openrouter: false } });
  assert.equal((await repository.get(scope(), {})).modelId, "gpt-5-mini");
});

test("coach settings save by expected revision and require the selected provider key", async () => {
  let row = null;
  const delegate = {
    findUnique: async () => row,
    create: async ({ data }) => (row = { ...data }),
    updateMany: async ({ where, data }) => { if (!row || row.revision !== where.revision) return { count: 0 }; row = { ...row, ...data }; return { count: 1 }; },
  };
  const prisma = { coachAiConfiguration: delegate, $transaction: async (fn) => fn({ coachAiConfiguration: delegate }) };
  const repository = new PrismaCoachAiConfigurationRepository({ prisma });
  await assert.rejects(repository.save(scope(), { provider: "openrouter", modelId: "anthropic/claude-sonnet-4", expectedRevision: 0 }, {}), /OPENROUTER_API_KEY/u);
  const saved = await repository.save(scope(), { provider: "openrouter", modelId: "anthropic/claude-sonnet-4", expectedRevision: 0 }, { OPENROUTER_API_KEY: "configured" });
  assert.equal(saved.provider, "openrouter");
  assert.equal(saved.revision, 1);
  await assert.rejects(repository.save(scope(), { provider: "openai", modelId: "gpt-5-mini", expectedRevision: 0 }, { OPENAI_API_KEY: "configured" }), CoachAiConfigurationConflictError);
});

test("settings use the active athlete scope and return no credential values", async () => {
  let where;
  const repository = new PrismaCoachAiConfigurationRepository({ prisma: { coachAiConfiguration: { findUnique: async (query) => { where = query.where; return null; } } } });
  const result = await repository.get(scope("athlete-b"), { OPENAI_API_KEY: "secret-value" });
  assert.deepEqual(where, { athleteId: "athlete-b" });
  assert.deepEqual(result.credentials, { openai: true, openrouter: false });
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});
