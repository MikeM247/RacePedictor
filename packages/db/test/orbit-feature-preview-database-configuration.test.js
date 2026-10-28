import assert from "node:assert/strict";
import test from "node:test";
import { readOrbitFeaturePreviewDatabaseOverride } from "../src/cloud/orbit-feature-preview-database-configuration.js";

const pooledHost = "ep-orbit-fixture-pooler.c-5.eu-central-1.aws.neon.tech";
const directHost = pooledHost.replace("-pooler", "");
const featurePreview = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/orbit-post-run-review",
  RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL: `postgresql://synthetic:synthetic@${pooledHost}/test?sslmode=require`,
  RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL_UNPOOLED: `postgresql://synthetic:synthetic@${directHost}/test?sslmode=verify-full`,
  RACEPREDICTOR_ORBIT_PREVIEW_POOLED_HOST: pooledHost,
  RACEPREDICTOR_ORBIT_PREVIEW_DIRECT_HOST: directHost,
};

test("only the exact ORBIT feature Preview branch selects its dedicated URLs", () => {
  const selected = readOrbitFeaturePreviewDatabaseOverride({ ...featurePreview, DATABASE_URL: "postgresql://injected:secret@production.invalid/live" });
  assert.deepEqual(selected, { url: featurePreview.RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL, directUrl: featurePreview.RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL_UNPOOLED });
  assert.ok(Object.isFrozen(selected));
  for (const environment of [
    { ...featurePreview, VERCEL_ENV: "production" },
    { ...featurePreview, VERCEL_GIT_COMMIT_REF: "work" },
    { ...featurePreview, VERCEL: "0" },
  ]) assert.throws(() => readOrbitFeaturePreviewDatabaseOverride(environment), /require the feature-branch Preview/);
});

test("missing feature configuration never falls back to the integration DATABASE_URL", () => {
  assert.throws(() => readOrbitFeaturePreviewDatabaseOverride({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/orbit-post-run-review", DATABASE_URL: "postgresql://production:secret@production.invalid/live" }), /Both ORBIT feature-preview/);
});

test("wrong endpoint, swapped pooling, and disabled TLS fail closed", () => {
  assert.throws(() => readOrbitFeaturePreviewDatabaseOverride({ ...featurePreview, RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL: featurePreview.RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL.replace(pooledHost, "production.neon.tech") }), /does not match its configured TLS endpoint/);
  assert.throws(() => readOrbitFeaturePreviewDatabaseOverride({ ...featurePreview, RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL_UNPOOLED: featurePreview.RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL }), /does not match its configured TLS endpoint/);
  assert.throws(() => readOrbitFeaturePreviewDatabaseOverride({ ...featurePreview, RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL: featurePreview.RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL.replace("sslmode=require", "sslmode=disable") }), /does not match its configured TLS endpoint/);
  assert.throws(() => readOrbitFeaturePreviewDatabaseOverride({ ...featurePreview, RACEPREDICTOR_ORBIT_PREVIEW_POOLED_HOST: directHost }), /isolated Neon endpoints/);
});
