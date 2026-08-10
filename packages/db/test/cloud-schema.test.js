import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const migrationsUrl = new URL("../prisma/migrations/", import.meta.url);

const schema = await readFile(schemaUrl, "utf8");

function modelBlock(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Expected Prisma model ${name}`);
  return match[1];
}

async function cloudMigration() {
  const entries = await readdir(migrationsUrl, { withFileTypes: true });
  const migration = entries.find(
    (entry) => entry.isDirectory() && entry.name.endsWith("_cloud_athlete_scoped_sync"),
  );
  assert.ok(migration, "Expected the cloud athlete-scoped sync migration");
  return readFile(new URL(`${migration.name}/migration.sql`, migrationsUrl), "utf8");
}

test("cloud persistence models are present and athlete scoped", () => {
  const requiredModels = [
    "User",
    "Athlete",
    "AthleteAccess",
    "ProviderConnection",
    "ProviderOAuthAttempt",
    "ProviderWebhookEvent",
    "IngestionJob",
    "RawObject",
    "ActivitySourceReference",
    "ActivityRevision",
    "SyncChange",
    "PairedDevice",
    "SecondBrainSnapshot",
  ];

  for (const model of requiredModels) modelBlock(model);

  for (const model of requiredModels.slice(2)) {
    assert.match(modelBlock(model), /\bathleteId\s+String\b/, `${model} must be athlete scoped`);
  }
});

test("tenant identity participates in entity relations and idempotency keys", () => {
  assert.match(modelBlock("Activity"), /@@unique\(\[id, athleteId\]\)/);
  assert.match(modelBlock("Import"), /@@unique\(\[athleteId, idempotencyKey\]\)/);
  assert.match(
    modelBlock("ActivitySourceReference"),
    /@relation\(fields: \[activityId, athleteId\], references: \[id, athleteId\]/,
  );
  assert.match(
    modelBlock("ActivityRevision"),
    /@relation\(fields: \[activityId, athleteId\], references: \[id, athleteId\]/,
  );
  assert.match(
    modelBlock("SecondBrainSnapshot"),
    /@relation\(fields: \[pairedDeviceId, athleteId\], references: \[id, athleteId\]/,
  );

  assert.match(modelBlock("AthleteAccess"), /@@unique\(\[userId, athleteId\]\)/);
  assert.match(modelBlock("ProviderConnection"), /@@unique\(\[athleteId, provider\]\)/);
  assert.match(
    modelBlock("ProviderWebhookEvent"),
    /@@unique\(\[athleteId, provider, providerEventKey\]\)/,
  );
  assert.match(modelBlock("IngestionJob"), /@@unique\(\[athleteId, idempotencyKey\]\)/);
  assert.match(modelBlock("IngestionJob"), /\bkind\s+IngestionJobKind\b/u);
  assert.match(modelBlock("IngestionJob"), /\bpayload\s+Json\?/u);
  assert.match(modelBlock("IngestionJob"), /\blockedBy\s+String\?/u);
  assert.match(modelBlock("IngestionJob"), /\bleaseToken\s+String\?/u);
  assert.match(modelBlock("IngestionJob"), /@@index\(\[status, lockedAt\]\)/u);
  assert.match(
    modelBlock("ActivitySourceReference"),
    /@@unique\(\[athleteId, sourceType, sourceObjectId\]\)/,
  );
  assert.match(
    modelBlock("ActivityRevision"),
    /@@unique\(\[athleteId, activityId, revisionNumber\]\)/,
  );
});

test("provider credentials use an authenticated encrypted envelope", () => {
  const connection = modelBlock("ProviderConnection");

  for (const field of [
    "credentialCiphertext",
    "credentialIv",
    "credentialAuthTag",
    "credentialKeyVersion",
  ]) {
    assert.match(connection, new RegExp(`\\b${field}\\s+String\\b`), `Missing ${field}`);
  }

  assert.doesNotMatch(
    connection,
    /^\s*(accessToken|refreshToken|token|password|clientSecret)\s+/m,
    "Provider credentials must never have a plaintext-shaped field",
  );
});

test("OAuth attempts retain only an actor-bound single-use state digest", () => {
  const attempt = modelBlock("ProviderOAuthAttempt");
  assert.match(attempt, /\bathleteId\s+String\b/u);
  assert.match(attempt, /\buserId\s+String\b/u);
  assert.match(attempt, /\bstateHash\s+String\b/u);
  assert.match(attempt, /\bexpiresAt\s+DateTime\b/u);
  assert.match(attempt, /\bconsumedAt\s+DateTime\?/u);
  assert.match(attempt, /@@unique\(\[provider, stateHash\]\)/u);
  assert.doesNotMatch(attempt, /^\s*(state|authorizationCode|accessToken|refreshToken)\s+/mu);
});

test("cloud tables contain pointers and selected structures, not raw provider bodies", () => {
  const cloudModels = [
    "ProviderConnection",
    "ProviderOAuthAttempt",
    "ProviderWebhookEvent",
    "IngestionJob",
    "RawObject",
    "ActivitySourceReference",
    "ActivityRevision",
    "SyncChange",
    "PairedDevice",
    "SecondBrainSnapshot",
  ];
  const prohibited = /^\s*(rawBody|bodyJson|payloadJson|providerPayload|rawPayload|accessToken|refreshToken)\s+/m;

  for (const model of cloudModels) {
    assert.doesNotMatch(modelBlock(model), prohibited, `${model} must not persist raw provider data`);
  }

  const rawObject = modelBlock("RawObject");
  assert.match(rawObject, /\bstorageKey\s+String\b/);
  assert.match(rawObject, /\bchecksumSha256\s+String\b/);
  assert.doesNotMatch(rawObject, /\bcontents?\s+(String|Json|Bytes)\b/);

  const secondBrain = modelBlock("SecondBrainSnapshot");
  assert.match(secondBrain, /\bselectedFields\s+Json\b/);
  assert.match(secondBrain, /\bcontext\s+Json\b/);
  assert.match(secondBrain, /\bpublishedAt\s+DateTime\b/);
  assert.doesNotMatch(secondBrain, /\b(vault|markdown|fileContents)\s+/);

  const syncChange = modelBlock("SyncChange");
  assert.match(syncChange, /@@unique\(\[athleteId, cursor\]\)/);
  assert.doesNotMatch(syncChange, /cursor\s+BigInt\s+@unique/);
});

test("forward migration preserves existing rows before adding tenant foreign keys", async () => {
  const migration = await cloudMigration();
  const seedPosition = migration.indexOf('INSERT INTO "athletes"');
  const tenantConstraintPosition = migration.indexOf(
    'ADD CONSTRAINT "Activity_athleteId_fkey"',
  );

  assert.ok(seedPosition >= 0, "Migration must backfill athletes from existing rows");
  assert.ok(
    tenantConstraintPosition > seedPosition,
    "Athlete rows must be backfilled before tenant foreign keys are enabled",
  );
  assert.match(migration, /ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'strava'/);
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN)\b/i);
  assert.doesNotMatch(
    migration,
    /"(accessToken|refreshToken|rawBody|payloadJson|providerPayload)"/,
  );
});
