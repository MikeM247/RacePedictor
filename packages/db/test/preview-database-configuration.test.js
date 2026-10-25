import assert from "node:assert/strict";
import test from "node:test";
import { readPreviewDatabaseOverride } from "../src/cloud/preview-database-configuration.js";

const pooled = "postgresql://test:test@ep-tiny-band-b1j73wgx-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const direct = pooled.replace("-pooler", "");
const preview = {
  VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "work",
  RACEPREDICTOR_V2_DATABASE_URL: pooled,
  RACEPREDICTOR_V2_DATABASE_URL_UNPOOLED: direct,
};

test("Production, local and other preview branches retain the existing Prisma configuration", () => {
  for (const source of [{}, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature" }]) {
    assert.equal(readPreviewDatabaseOverride(source), undefined);
  }
});

test("work selects only the isolated pair despite an integration-supplied DATABASE_URL", () => {
  const selected = readPreviewDatabaseOverride({ ...preview, DATABASE_URL: "postgresql://wrong:wrong@integration.invalid/db" });
  assert.deepEqual(selected, { url: pooled, directUrl: direct });
  assert.ok(Object.isFrozen(selected));
});

test("work fails closed when either dedicated connection is missing", () => {
  for (const key of ["RACEPREDICTOR_V2_DATABASE_URL", "RACEPREDICTOR_V2_DATABASE_URL_UNPOOLED"]) {
    assert.throws(() => readPreviewDatabaseOverride({ ...preview, [key]: "" }), /Both isolated/);
  }
});

test("dedicated connections cannot silently apply in Production or a different branch", () => {
  assert.throws(() => readPreviewDatabaseOverride({ ...preview, VERCEL_ENV: "production" }), /require Preview/);
  assert.throws(() => readPreviewDatabaseOverride({ ...preview, VERCEL_GIT_COMMIT_REF: "other" }), /require Preview/);
});

test("wrong endpoints, swapped pooling, non-Postgres URLs and disabled TLS are rejected without credentials in errors", () => {
  for (const bad of [pooled.replace("ep-tiny-band-b1j73wgx-pooler", "production"), direct, pooled.replace("postgresql:", "https:"), pooled.replace("sslmode=require", "sslmode=disable"), "not-a-url"]) {
    assert.throws(() => readPreviewDatabaseOverride({ ...preview, RACEPREDICTOR_V2_DATABASE_URL: bad }), (error) => {
      assert.doesNotMatch(error.message, /test:test|postgresql:|integration.invalid/);
      return true;
    });
  }
  assert.throws(() => readPreviewDatabaseOverride({ ...preview, RACEPREDICTOR_V2_DATABASE_URL_UNPOOLED: pooled }), /isolated TLS endpoint/);
});
