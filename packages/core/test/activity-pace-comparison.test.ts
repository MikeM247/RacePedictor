import assert from "node:assert/strict";
import test from "node:test";
import { paceArtifactSchema } from "../src/contracts/activity-pace-comparison.ts";
import { comparisonRead, prescriptionSource, publishedComparison, splitFingerprint, validatePaceArtifact } from "../src/services/activity-pace-comparison.ts";
import { paceDifference, paceDomain, paceText, splitRows } from "../src/services/split-pacing.ts";
import { activity, artifact, blocks, plan, source } from "./fixtures/pace-comparison.ts";

test("Sunday range comparisons, approximation and final partial split stay truthful", () => {
  const rows = splitRows(activity.splits, blocks);
  assert.equal(rows[0].planned, "≈5:55"); assert.equal(rows[0].difference, "≈3 s/km faster");
  assert.equal(rows[5].difference, "8–10 s/km slower"); assert.equal(rows[3].difference, "Within range");
  assert.equal(rows[14].difference, "7–9 s/km faster"); assert.equal(rows[15].planned, "No numeric target");
  assert.equal(rows[21].label, "Split 22 · 193 m"); assert.equal(rows[21].actual, "4:50");
  assert.equal(paceText(359.6), "6:00"); assert.equal(paceDifference(0, blocks[0]), "Actual pace unavailable");
  const domain = paceDomain(activity.splits, blocks); assert.ok(domain.min < 290 && domain.max > 370);
});
test("source and artifact hashes fence explicit approval", () => {
  assert.doesNotThrow(() => validatePaceArtifact(artifact(), activity, source));
  assert.throws(() => validatePaceArtifact({ ...artifact(), blocks: [] }, activity, source), /hash/);
  assert.throws(() => validatePaceArtifact(artifact(), activity, { ...source, prescription: "Revised" }), /source/);
  assert.throws(() => validatePaceArtifact(artifact({ athleteId: "other" }), activity, source), /changed/);
});
test("overlaps, reversed ranges and nonexistent splits are rejected", () => {
  assert.equal(paceArtifactSchema.safeParse(artifact({ blocks: [blocks[0], blocks[0]] })).success, false);
  assert.equal(paceArtifactSchema.safeParse(artifact({ blocks: [{ ...blocks[1], minPaceSecPerKm: 360 }] })).success, false);
  assert.throws(() => validatePaceArtifact(artifact({ blocks: [{ ...blocks[0], lastSplitIndex: 22 }] }), activity, source), /splits/);
  assert.equal(splitRows(activity.splits, [blocks[1]])[0].difference, "No approved target");
});
test("new active plans do not change saved comparisons; changed split data makes them stale", () => {
  const saved = publishedComparison(paceArtifactSchema.parse(artifact()), "2026-10-06T09:00:00.000Z");
  assert.equal(comparisonRead(activity, saved).data.status, "ready");
  assert.equal(comparisonRead({ ...activity, avgHrBpm: 160 }, saved).data.status, "ready");
  const changed = { ...activity, splits: activity.splits.map((s, i) => i ? s : { ...s, paceSecPerKm: 353 }) };
  assert.equal(comparisonRead(changed, saved).data.status, "stale");
  assert.equal(splitFingerprint({ ...activity, splits: [...activity.splits].reverse() }), splitFingerprint(activity));
  const { activatedAt, activatedBy, ...retired } = plan;
  assert.deepEqual(prescriptionSource({ ...retired, status: "retired", retiredAt: "2026-10-05T08:00:00.000Z" }, "race-session"), source);
});
test("amended source reconstructs the requested revision and rejects missing history", () => {
  assert.equal(prescriptionSource(plan, "race-session", 2, [{ revision: 2, afterValues: { prescription: "Updated before race" } }]).prescription, "Updated before race");
  assert.throws(() => prescriptionSource(plan, "race-session", 3, [{ revision: 3, afterValues: {} }]), /incomplete/);
});
