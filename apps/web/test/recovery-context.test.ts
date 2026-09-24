import assert from "node:assert/strict";
import test from "node:test";
import { recoveryReturnHref, safeRecoveryPath, type RecoveryContext } from "../lib/recovery-context.ts";

const context: RecoveryContext = {
  version: 1, id: "recovery_12345678", createdAt: 1, expiresAt: Date.now() + 10_000,
  path: "/dashboard/activities?activityId=run_1", kind: "training", activityId: "run_1",
  filters: { search: "long run", sport: "run", from: "2026-09-01", to: "2026-09-13" },
  loadedDepth: 2, loadedCursors: ["opaque-next-page"], disclosure: "filters", scrollY: 320, focusKey: "activity-row-run_1",
};

test("recovery paths retain only supported dashboard destinations and presentation keys", () => {
  assert.equal(safeRecoveryPath("/dashboard/activities?activityId=run_1&token=secret"), "/dashboard/activities?activityId=run_1");
  assert.equal(safeRecoveryPath("/dashboard/data-quality?source=strava&returnTo=%2Fdashboard"), "/dashboard/data-quality?source=strava");
  assert.equal(safeRecoveryPath("/dashboard/calendar?activityId=run_1"), "/dashboard/calendar?activityId=run_1");
  assert.equal(safeRecoveryPath("https://attacker.example/dashboard"), "/dashboard/activities");
  assert.equal(safeRecoveryPath("//attacker.example/dashboard"), "/dashboard/activities");
  assert.equal(safeRecoveryPath("/dashboard-private"), "/dashboard/activities");
  assert.equal(recoveryReturnHref(context, "/dashboard/activities"), "/dashboard/activities?activityId=run_1&recovery=recovery_12345678");
});

test("recovery context stores metadata rather than records, warning contents, credentials, or raw paths", () => {
  assert.deepEqual(Object.keys(context).sort(), ["activityId", "createdAt", "disclosure", "expiresAt", "filters", "focusKey", "id", "kind", "loadedCursors", "loadedDepth", "path", "scrollY", "version"]);
  assert.equal(context.filters?.search, "long run");
  assert.deepEqual(context.loadedCursors, ["opaque-next-page"]);
});
