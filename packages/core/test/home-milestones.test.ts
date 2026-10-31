import test from "node:test";
import assert from "node:assert/strict";
import type { MilestoneEntry } from "../src/contracts/milestone-timeline.ts";
import {
  homeMilestones,
  entryStatus,
  targetTimeLabel,
  daysUntil,
} from "../src/services/home-milestones.ts";
import { emptyImageState } from "../src/contracts/milestone-images.ts";
import {
  assignEntryImage,
  entryImage,
  reconcileEntryImages,
  MilestoneImageConflict,
} from "../src/services/milestone-images.ts";
const target = (
  id: string,
  date: string,
  mainGoal = false,
): MilestoneEntry => ({
  id: `target:${id}`,
  title: id,
  date,
  sources: [{ kind: "target", id }],
  target: {
    id,
    title: id,
    date,
    mainGoal,
    distanceMeters: 10000,
    targetTimeSeconds: 3600,
  },
  completion: "upcoming",
  performance: "unassessed",
});
const result = (id: string, date?: string): MilestoneEntry => ({
  id: `achievement:${id}`,
  title: id,
  date,
  sources: [{ kind: "achievement", id }],
  achievement: {
    id,
    title: id,
    confirmedBy: "user",
    achievement: "personal_best",
    raceDate: date,
  },
  completion: "completed",
  performance: "not_set",
});
test("the next race stays on the timeline and the primary goal appears exactly once", () => {
  const pb = result("21 km PB"),
    oldies = target("oldies", "2026-11-01"),
    marathon = target("marathon", "2027-03-07"),
    comrades = target("comrades", "2027-06-13", true);
  const view = homeMilestones([comrades, marathon, pb, oldies], "2026-10-30");
  assert.equal(view.next?.id, oldies.id);
  assert.deepEqual(
    view.highlights.map((e) => e.id),
    [pb.id, oldies.id, marathon.id, comrades.id],
  );
  assert.equal(
    homeMilestones([comrades, marathon, pb, oldies], "2026-11-02").next?.id,
    marathon.id,
  );
  assert.equal(
    homeMilestones([comrades, pb], "2027-06-13").next?.id,
    comrades.id,
  );
  assert.equal(homeMilestones([comrades, pb], "2027-06-14").next, null);
});
test("many milestones preserve full membership and choose four deduplicated highlights", () => {
  const entries = [
    result("older", "2025-01-01"),
    result("recent", "2026-10-01"),
    result("undated"),
    target("next", "2026-11-01"),
    target("following", "2027-01-01"),
    target("later", "2027-02-01"),
    target("final", "2027-06-01", true),
  ];
  const view = homeMilestones(entries, "2026-10-30");
  assert.equal(view.ordered.length, 7);
  assert.deepEqual(
    view.highlights.map((e) => e.title),
    ["recent", "next", "following", "final"],
  );
  assert.equal(view.ordered[2].title, "undated");
});
test("undated achievements and same-date entries retain their saved order", () => {
  const first = result("z-first-saved"),
    second = result("a-second-saved"),
    third = result("m-third-saved");
  const view = homeMilestones([first, second, third], "2026-10-30");
  assert.deepEqual(
    view.ordered.map((entry) => entry.id),
    [first.id, second.id, third.id],
  );
});
test("completed races are not automatically personal bests or target successes", () => {
  const missed = { ...result("race"), performance: "missed" as const };
  assert.equal(entryStatus(missed), "Completed · target missed");
  assert.equal(
    entryStatus({ ...missed, performance: "unassessed" }),
    "Completed · target unassessed",
  );
  assert.equal(entryStatus(result("PB")), "Achieved");
  assert.equal(
    entryStatus({
      ...target("race", "2026-01-01"),
      completion: "result_pending",
    }),
    "Result pending",
  );
  assert.equal(targetTimeLabel(3600, true), "Sub-60");
  assert.equal(targetTimeLabel(15600, true), "Sub-4:20");
  assert.equal(targetTimeLabel(15601, true), "Sub-4:20:01");
  assert.equal(daysUntil("2026-11-01", "2026-10-30"), 2);
  assert.equal(daysUntil("2026-10-30", "2026-10-30"), 0);
});
test("images use source identities and reset to an explicit catalogue default", () => {
  const race = target("saved", "2026-11-01");
  let state = assignEntryImage(emptyImageState(), race.sources, {
    kind: "catalogue",
    id: "oldies",
  });
  state = assignEntryImage(state, race.sources, {
    kind: "upload",
    id: "a".repeat(64),
  });
  assert.equal(
    entryImage(state, { ...race, title: "renamed" }).choice?.id,
    "a".repeat(64),
  );
  state = assignEntryImage(state, race.sources, null);
  assert.equal(entryImage(state, race).choice?.id, "oldies");
  assert.equal(entryImage(state, target("other", "2026-11-01")).url, null);
});
test("reconciliation requires an explicit choice when images differ and preserves it for unlink", () => {
  const race = target("race", "2026-01-01"),
    achievement = result("history", "2026-01-01");
  let state = assignEntryImage(emptyImageState(), race.sources, {
    kind: "catalogue",
    id: "oldies",
  });
  state = assignEntryImage(state, achievement.sources, {
    kind: "catalogue",
    id: "comrades",
  });
  const change = {
    operation: "link" as const,
    entryId: race.id,
    achievementId: "history",
    confirmedSameRace: true as const,
    expectedRevision: 1,
    sourceVersion: "v",
  };
  assert.throws(
    () =>
      reconcileEntryImages(state, 2, { entries: [race, achievement] }, change),
    MilestoneImageConflict,
  );
  assert.throws(
    () =>
      reconcileEntryImages(
        state,
        2,
        { entries: [race, achievement] },
        { ...change, imageResolution: { expectedRevision: 1, choice: null } },
      ),
    MilestoneImageConflict,
  );
  const resolved = reconcileEntryImages(
    state,
    2,
    { entries: [race, achievement] },
    {
      ...change,
      imageResolution: {
        expectedRevision: 2,
        choice: { kind: "catalogue", id: "oldies" },
      },
    },
  );
  assert.equal(entryImage(resolved, race).choice?.id, "oldies");
  assert.equal(entryImage(resolved, achievement).choice?.id, "oldies");
});
test("explicit verified target aliases retain an existing image when the projection identity reconciles", () => {
  const old = target("old-target", "2026-11-01"),
    current = target("primary", "2026-11-01", true);
  current.target!.aliases = ["old-target"];
  const state = assignEntryImage(emptyImageState(), old.sources, {
    kind: "catalogue",
    id: "oldies",
  });
  assert.equal(entryImage(state, current).choice?.id, "oldies");
});
