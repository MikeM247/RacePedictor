import { expect, test } from "@playwright/test";
import { coachingFixtures } from "./coaching-fixtures.ts";
import { expectAxeClean, recordApplicationWrites } from "./test-helpers.ts";
import { goalContextRouteDataSchema } from "../../../packages/core/src/contracts/coaching.ts";
import { prepareMilestoneChange } from "../../../packages/core/src/services/milestone-management.ts";

test("online planned-target requests offer the paired-device handoff without online plan creation or writes", async ({ page }) => {
  const context = goalContextRouteDataSchema.parse({ state: "ready", plan: { id: "online-plan", version: 2, revision: 1, startsOn: "2026-09-01", endsOn: "2027-06-13", timezone: "Africa/Johannesburg", approvalContentHash: "a".repeat(64) }, goal: { id: "online-goal", athleteId: "e2e_athlete", revision: 1, title: "Primary marathon", why: "Purpose", target: { kind: "performance", distanceMeters: 42195, targetDate: "2027-06-13" } }, milestones: [], projection: null });
  const request = prepareMilestoneChange(context, { operation: "add", milestone: { id: "checkpoint", title: "Approved-review checkpoint", distanceMeters: 10000, targetDate: "2027-03-01", targetTimeSeconds: 3600 } });
  await page.addInitScript((value) => sessionStorage.setItem("racepredictor:milestone-change:v1:e2e_athlete", value), JSON.stringify(request));
  await page.route("**/api/v1/coaching/goal-context/active", (route) => route.fulfill({ json: { data: { context } } }));
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ json: coachingFixtures.activePlan() }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ json: coachingFixtures.history() }));
  const writes = recordApplicationWrites(page); await page.goto("/dashboard/plan?milestoneUpdate=1");
  await expect(page.getByText(/paired local planning workflow/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Download change request", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to plan review", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Create.*plan with Codex/ })).toHaveCount(0);
  await expectAxeClean(page, "Online milestone handoff"); expect(writes).toEqual([]);
});
