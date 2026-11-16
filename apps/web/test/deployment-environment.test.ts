import assert from "node:assert/strict";
import test from "node:test";
import { readDeploymentEnvironment } from "../lib/server/deployment-environment.ts";

test("production build mode does not turn a staging deployment into Production", () => {
  assert.equal(readDeploymentEnvironment({
    NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "work",
  }), "Staging");
  assert.equal(readDeploymentEnvironment({ NODE_ENV: "production" }), "Unknown");
});

test("deployment target takes priority over branch and legacy environment metadata", () => {
  assert.equal(readDeploymentEnvironment({
    VERCEL_TARGET_ENV: "production", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "work",
  }), "Production");
  assert.equal(readDeploymentEnvironment({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "work" }), "Production");
  assert.equal(readDeploymentEnvironment({ VERCEL_TARGET_ENV: "staging", VERCEL_ENV: "preview" }), "Staging");
});

test("other previews, local runs and unrecognized targets have distinct labels", () => {
  assert.equal(readDeploymentEnvironment({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature" }), "Preview");
  assert.equal(readDeploymentEnvironment({ NODE_ENV: "development" }), "Development");
  assert.equal(readDeploymentEnvironment({ VERCEL_TARGET_ENV: "qa", NODE_ENV: "production" }), "Unknown");
  assert.equal(readDeploymentEnvironment({}), "Unknown");
});
