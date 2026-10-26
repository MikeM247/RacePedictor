import type { Page } from "@playwright/test";
import { goalContextRouteDataSchema } from "../../../packages/core/src/contracts/coaching.ts";
import { raceHistorySchema } from "../../../packages/core/src/contracts/race-history.ts";
import { composeMilestoneTimeline } from "../../../packages/core/src/services/milestone-timeline.ts";
import { readLocalMilestoneState } from "../../../packages/db/src/milestone-timeline.ts";
import { e2eDatabasePath } from "./fixture-paths.ts";
import { DatabaseSync } from "node:sqlite";

export function resetMilestoneFixtureState() {
  const db = new DatabaseSync(e2eDatabasePath);
  try { if (db.prepare("SELECT name FROM sqlite_master WHERE name='milestone_timeline_state'").get()) db.prepare("DELETE FROM milestone_timeline_state WHERE athlete_id = ?").run("e2e_athlete"); }
  finally { db.close(); }
}

/** Presentation fixtures override source content; CAS/source tokens still come from the real API. */
export async function mockMilestoneRead(page: Page, context: unknown, history?: unknown[]) {
  await page.route(/\/api\/v1\/coaching\/milestones(?:\?.*)?$/u, async (route) => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const { data } = await response.json();
    const current = goalContextRouteDataSchema.parse(context);
    const records = raceHistorySchema.parse(history ?? data.history);
    const state = readLocalMilestoneState(e2eDatabasePath, "e2e_athlete").state;
    return route.fulfill({ json: { data: { ...data, context: current, history: records,
      availability: { goal: true, history: true }, ...composeMilestoneTimeline(current, records, state, data.today) } } });
  });
}
