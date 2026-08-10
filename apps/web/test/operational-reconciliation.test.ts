import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSyntheticTestActor } from "../lib/server/auth.ts";
import { createInternalRouteWrapper } from "../lib/server/internal-route-security.ts";
import {
  handleOperationalStatus,
  handleScheduledReconciliation,
  type OperationalComposition,
} from "../lib/server/operational-handlers.ts";

const zeroUsage = {
  rawStorageBytes: 0, databaseBytes: 0, invocationsDaily: 0,
  bandwidthBytesDaily: 0, providerRequests15Minutes: 0, providerRequestsDaily: 0,
};

test("the free-tier production schedule uses Vercel's GET contract and standard secret", async () => {
  const config = JSON.parse(await readFile(new URL("../../../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.crons, [{ path: "/api/v1/internal/reconciliation", schedule: "0 3 * * *" }]);
  const route = await readFile(new URL("../app/api/v1/internal/reconciliation/route.ts", import.meta.url), "utf8");
  const security = await readFile(new URL("../lib/server/internal-route-security.ts", import.meta.url), "utf8");
  assert.match(route, /export const GET = withInternalRoute/u);
  assert.match(security, /process\.env\.CRON_SECRET/u);
  assert.doesNotMatch(security, /RACEPREDICTOR_CRON_SECRET/u);
});

test("internal reconciliation uses an independent timing-safe secret and fails closed", async () => {
  let calls = 0;
  const wrapper = createInternalRouteWrapper({ readSecret: () => "s".repeat(32) });
  const handler = wrapper(async () => { calls += 1; return Response.json({ ok: true }); });
  const missing = await handler(new Request("http://localhost/api/v1/internal/reconciliation", { method: "POST" }));
  const wrong = await handler(new Request("http://localhost/api/v1/internal/reconciliation", {
    method: "POST", headers: { authorization: `Bearer ${"x".repeat(32)}` },
  }));
  const allowed = await handler(new Request("http://localhost/api/v1/internal/reconciliation", {
    method: "POST", headers: { authorization: `Bearer ${"s".repeat(32)}` },
  }));
  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.deepEqual(await missing.json(), await wrong.json());
  assert.equal(allowed.status, 200);
  assert.equal(calls, 1);

  const unconfigured = createInternalRouteWrapper({ readSecret: () => undefined })(async () => Response.json({}));
  assert.equal((await unconfigured(new Request("http://localhost"))).status, 503);
});

test("scheduled handler records the invocation before bounded reconciliation", async () => {
  const order: string[] = [];
  const composition = {
    usage: {
      recordInvocation: async () => { order.push("usage"); },
      readUsage: async () => zeroUsage,
    },
    reconciliation: { run: async (input: { workerId: string; maxAthletes: number; maxJobs: number }) => {
      order.push("run");
      assert.match(input.workerId, /^cron:/u);
      assert.deepEqual({ maxAthletes: input.maxAthletes, maxJobs: input.maxJobs }, { maxAthletes: 25, maxJobs: 25 });
      return { state: "completed", enqueued: 1, reused: 0, processed: 1, outcomes: { completed: 1 } };
    } },
  } as unknown as OperationalComposition;
  const response = await handleScheduledReconciliation(new Request("http://localhost"), () => composition);
  assert.equal(response.status, 200);
  assert.deepEqual(order, ["usage", "run"]);
  assert.equal((await response.json()).data.processed, 1);
});

test("owner operations status returns safe actionable guardrails without identifiers or secrets", async () => {
  const composition = {
    usage: { readUsage: async () => ({ ...zeroUsage, providerRequests15Minutes: 90 }) },
  } as unknown as OperationalComposition;
  const response = await handleOperationalStatus({
    mode: "authenticated",
    actor: createSyntheticTestActor("owner-a", ["athlete-a"]),
  }, new Request("http://localhost"), () => composition);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.state, "hard_stop");
  assert.equal(payload.data.processingAllowed, false);
  assert.doesNotMatch(JSON.stringify(payload), /athlete-a|owner-a|secret|token|storageKey/u);
});
