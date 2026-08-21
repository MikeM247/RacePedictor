import assert from "node:assert/strict";
import test from "node:test";
import { readCloudEnvironment } from "../lib/server/cloud-environment.ts";
import { shouldRenderOnlineUi } from "../lib/server/online-ui-mode.ts";

test("online UI fixture is restricted to non-production and cannot enable cloud access", () => {
  assert.equal(shouldRenderOnlineUi(readCloudEnvironment({ NODE_ENV: "test" }), "online-fixture"), true);
  assert.equal(shouldRenderOnlineUi(readCloudEnvironment({ NODE_ENV: "development" }), "online-fixture"), true);
  assert.equal(shouldRenderOnlineUi(readCloudEnvironment({ NODE_ENV: "production" }), "online-fixture"), false);
  assert.equal(shouldRenderOnlineUi(readCloudEnvironment({ NODE_ENV: "test", RACEPREDICTOR_CLOUD_MODE: "enabled" }), "local"), true);
});
