import assert from "node:assert/strict";
import test from "node:test";
import { createRecoveryContext, readRecoveryContext, recoveryReturnHref, safeRecoveryPath, type RecoveryContext } from "../lib/recovery-context.ts";

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
  assert.equal(safeRecoveryPath("/dashboard/readiness?recovery=recovery_12345678"), "/dashboard/readiness?recovery=recovery_12345678");
  assert.equal(safeRecoveryPath("/dashboard/coach?recovery=recovery_12345678"), "/dashboard/coach?recovery=recovery_12345678");
  assert.equal(safeRecoveryPath("https://attacker.example/dashboard"), "/dashboard/activities");
  assert.equal(safeRecoveryPath("//attacker.example/dashboard"), "/dashboard/activities");
  assert.equal(safeRecoveryPath("/dashboard-private"), "/dashboard/activities");
  assert.equal(recoveryReturnHref(context, "/dashboard/activities"), "/dashboard/activities?activityId=run_1&recovery=recovery_12345678");
  const oldReadiness: RecoveryContext = { ...context, kind: "home", path: "/dashboard", activityId: undefined, disclosure: "readiness" };
  assert.equal(recoveryReturnHref(oldReadiness, "/dashboard"), "/dashboard/readiness?recovery=recovery_12345678");
  const legacyCoach: RecoveryContext = { ...context, kind: "coach", path: "/dashboard", activityId: undefined, coach: { topic: "prepare", transcriptScrollTop: 240 } };
  assert.equal(recoveryReturnHref(legacyCoach, "/dashboard"), "/dashboard/coach?recovery=recovery_12345678");
});

test("legacy Coach recovery is normalized in storage reads and new Coach contexts default to Coach", () => {
  const legacyCoach: RecoveryContext = { ...context, kind: "coach", path: "/dashboard", activityId: undefined, coach: { topic: "reflect", transcriptAnchorSequence: 14, transcriptScrollTop: 240 } };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: { getItem: (key: string) => key.endsWith(legacyCoach.id) ? JSON.stringify(legacyCoach) : null } },
  });
  try {
    const recovered = readRecoveryContext(legacyCoach.id);
    assert.equal(recovered?.path, "/dashboard/coach");
    assert.deepEqual(recovered?.coach, { topic: "reflect", selectedRecord: undefined, transcriptAnchorSequence: 14, transcriptScrollTop: 240 });
    const created = createRecoveryContext({ kind: "coach", path: "/dashboard", coach: { topic: "general" } });
    assert.equal(created.path, "/dashboard/coach");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("recovery context stores metadata rather than records, warning contents, credentials, or raw paths", () => {
  assert.deepEqual(Object.keys(context).sort(), ["activityId", "createdAt", "disclosure", "expiresAt", "filters", "focusKey", "id", "kind", "loadedCursors", "loadedDepth", "path", "scrollY", "version"]);
  assert.equal(context.filters?.search, "long run");
  assert.deepEqual(context.loadedCursors, ["opaque-next-page"]);
});
