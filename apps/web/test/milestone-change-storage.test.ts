import assert from "node:assert/strict";
import test from "node:test";
import { discardMilestoneChange, readMilestoneChange, storeMilestoneChange } from "../lib/milestone-change-storage.ts";
import { goalContextRouteDataSchema } from "../../../packages/core/src/contracts/coaching.ts";
import { prepareMilestoneChange } from "../../../packages/core/src/services/milestone-management.ts";

const request = (athleteId = "athlete-a") => prepareMilestoneChange(goalContextRouteDataSchema.parse({ state: "ready", plan: { id: "plan", version: 1, revision: 1, startsOn: "2026-09-01", endsOn: "2027-06-13", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) }, goal: { id: "goal", athleteId, revision: 1, title: "Primary race", why: "Purpose", target: { kind: "performance", distanceMeters: 42195, targetDate: "2027-06-13" } }, milestones: [], projection: null }), { operation: "add", milestone: { id: "checkpoint", title: "Checkpoint", targetDate: "2027-03-01", distanceMeters: 10000, targetTimeSeconds: 3600 } });

test("prepared requests round-trip per athlete and discard only that athlete's tab-local draft", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  storeMilestoneChange(storage, request()); storeMilestoneChange(storage, request("athlete-b"));
  assert.deepEqual(readMilestoneChange(storage, "athlete-a"), request());
  assert.equal(readMilestoneChange(storage, "unknown"), null);
  discardMilestoneChange(storage, "athlete-a");
  assert.equal(readMilestoneChange(storage, "athlete-a"), null); assert.equal(readMilestoneChange(storage, "athlete-b")?.athleteId, "athlete-b");
});

test("malformed cross-athlete and denied storage are explicit failures instead of silently trusted requests", () => {
  for (const value of ["{", "null", JSON.stringify(request("other")), JSON.stringify({ ...request(), operation: "remove" })]) assert.throws(() => readMilestoneChange({ getItem: () => value }, "athlete-a"));
  assert.throws(() => storeMilestoneChange({ setItem: () => { throw new Error("denied"); } }, request()), /denied/);
});
